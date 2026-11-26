"""The Long Boil style loop: Generator -> Evaluator -> Refiner, until the draft scores.

    python3 refine/loop.py refine/briefs/polytechnic-basement-supper.md            # real run, on the Claude plan
    python3 refine/loop.py refine/briefs/polytechnic-basement-supper.md --dry-run  # no model calls
    python3 refine/loop.py --guide                                                 # write STYLE_GUIDE.md from the rules

1. The Generator drafts one storylet from the brief and the Act I canon. It is the
   scrivener's definition on a fast model at low effort: a quick first pass.
2. The Evaluator scores the draft against every rule in style_guide.json, each
   from 0 to 10 with a reason, the exact text it objects to, and a fix. Two rules
   are scored by the game's own validators, not by a model. The weighted total is
   out of 100.
3. If the total is under the bar, or any rule is under its floor, the Refiner gets
   the draft and its scorecard and fixes the violations, changing as little as it
   can, and says which rule each change answers. The new draft goes back to step 2.
4. A revision that scores lower than the best so far is thrown away; the Refiner
   is told what it broke and works from the best version again.

Nobody steps in between iterations. The loop ends when a draft is accepted or after
MAX_ITERATIONS refinements, and writes every draft and scorecard to
refine/runs/<timestamp>/. It never touches content/: a finished storylet goes into
the game through the crew's register and Jeremy's approval, like any other.
"""

import argparse
import datetime
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "crew"))
import crew as C  # noqa: E402  the crew's canon loading, sandbox, validator gate and agent caller

GUIDE = json.load(open(os.path.join(HERE, "style_guide.json"), encoding="utf-8"))
RULES = {r["id"]: r for r in GUIDE["rules"]}
MODEL_RULES = [r["id"] for r in GUIDE["rules"] if r["scored_by"].startswith("evaluator")]
assert sum(r["weight"] for r in GUIDE["rules"]) == 100

MAX_ITERATIONS = 5  # refinements before the loop stops and keeps its best draft

# A fast first pass, a strict judge, a careful editor.
AGENTS = {
    "generator": ("claude-sonnet-5-5", "low"),
    "evaluator": (C.MODEL, "high"),
    "refiner": (C.MODEL, "high"),
}
C.AGENT_MODELS.update({k: m for k, (m, _) in AGENTS.items()})

GENERATOR_OUT = {
    "type": "object",
    "properties": {
        "storylet_json": {"type": "string", "description": "The whole storylet/1 file, as JSON text."},
        "notes": {"type": "string"},
    },
    "required": ["storylet_json", "notes"],
    "additionalProperties": False,
}

EVALUATOR_OUT = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rule": {"type": "string", "enum": MODEL_RULES},
                    "score": {"type": "integer", "description": "0 to 10, against the rule's anchors."},
                    "reason": {"type": "string", "description": "Why this score, in one or two sentences."},
                    "evidence": {"type": "string", "description": "The exact words in the draft that cost points, quoted, with their field. Empty for a 10."},
                    "fix": {"type": "string", "description": "What would raise it to 10. Empty for a 10."},
                },
                "required": ["rule", "score", "reason", "evidence", "fix"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["scores", "summary"],
    "additionalProperties": False,
}

REFINER_OUT = {
    "type": "object",
    "properties": {
        "storylet_json": {"type": "string", "description": "The whole revised storylet/1 file, as JSON text."},
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rule": {"type": "string", "enum": list(RULES)},
                    "field": {"type": "string"},
                    "before": {"type": "string"},
                    "after": {"type": "string"},
                },
                "required": ["rule", "field", "before", "after"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["storylet_json", "changes"],
    "additionalProperties": False,
}


def guide_text(rule_ids=None):
    """The style guide as the agents read it."""
    out = [f"# The Long Boil house style, scored\n\n{GUIDE['note']}\n",
           f"Accepted at a weighted total of {GUIDE['accept_total']} out of 100, with every rule at or above its floor.\n"]
    for r in GUIDE["rules"]:
        if rule_ids and r["id"] not in rule_ids:
            continue
        anchors = "; ".join(f"{k}: {v}" for k, v in r["anchors"].items())
        out.append(f"## {r['id']}. {r['name']} (weight {r['weight']}, floor {r['floor']}, scored by {r['scored_by']})\n"
                   f"Source: {r['source']}\n> {r['quote']}\n\n{r['check']}\n\nAnchors: {anchors}\n")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# The three agents


class Loop(C.Crew):
    def call(self, agent, system, user, schema):
        return self.ask(agent, system, user, schema, AGENTS[agent][1])

    def generate(self, brief, canon, examples):
        system = C.agent_prompt("scrivener") + (
            "\n\n## In this loop\n\nYou are the Generator: write a quick first draft. You have no "
            "file tools; everything you may read is in the user message. Return the storylet as "
            "JSON text in storylet_json. An Evaluator will score it and a Refiner will fix it.")
        user = (f"<brief>\n{brief}\n</brief>\n\n<canon>\n{canon}\n</canon>\n\n"
                f"<examples>\n{examples}\n</examples>")
        return self.call("generator", system, user, GENERATOR_OUT)

    def evaluate(self, brief, canon, storylet_text):
        system = (
            "# Evaluator\n\nYou are the Evaluator for The Long Boil, a steampunk idle game set in "
            "Kettleport. You score one storylet against the game's house style. You never rewrite it.\n\n"
            "Score every rule you are given, independently, from 0 to 10 against that rule's anchors. "
            "Be exacting: a 10 means nothing in the draft could be improved for that rule. For anything "
            "under 10, quote the exact words that cost the points and name their field (description, "
            "options[1].label, options[0].failure.text), give the reason in one or two sentences, and "
            "give a fix concrete enough that an editor can apply it without asking you. Judge only "
            "against the canon you are given: if the draft invents something canon does not state, say "
            "so under the rule it touches. For R10, work the challenge odds with the GDD's formula.")
        user = (f"<style_guide>\n{guide_text(MODEL_RULES)}\n</style_guide>\n\n<brief>\n{brief}\n</brief>\n\n"
                f"<canon>\n{canon}\n</canon>\n\n<storylet>\n{storylet_text}\n</storylet>")
        return self.call("evaluator", system, user, EVALUATOR_OUT)

    def refine(self, brief, canon, storylet_text, card, regression):
        system = (
            "# Refiner\n\nYou are the Refiner for The Long Boil. You receive a storylet and the "
            "Evaluator's scorecard. Fix every rule that scored under 10, the heaviest weight times gap "
            "first, and change as little as you can: leave alone any sentence nobody objected to. Keep "
            "the id, schema, act, location and reveal layer, and stay inside the brief's limits on "
            "requirements and rewards. Keep to the house limits as you edit: count the words. Return "
            "the whole storylet, and list every change with the rule it answers.")
        lines = []
        for s in sorted(card["scores"], key=lambda s: -(RULES[s["rule"]]["weight"] * (10 - s["score"]))):
            if s["score"] < 10:
                lines.append(f"- {s['rule']} {RULES[s['rule']]['name']}: {s['score']}/10 "
                             f"(weight {RULES[s['rule']]['weight']}, floor {RULES[s['rule']]['floor']}). "
                             f"{s['reason']} Evidence: {s['evidence']} Fix: {s['fix']}")
        user = (f"<style_guide>\n{guide_text()}\n</style_guide>\n\n<brief>\n{brief}\n</brief>\n\n"
                f"<canon>\n{canon}\n</canon>\n\n<storylet>\n{storylet_text}\n</storylet>\n\n"
                f"<scorecard total=\"{card['total']}\" accept_at=\"{GUIDE['accept_total']}\">\n"
                + "\n".join(lines) + "\n</scorecard>")
        if regression:
            user += f"\n\n<regression>\n{regression}\n</regression>"
        return self.call("refiner", system, user, REFINER_OUT)


# ---------------------------------------------------------------------------
# Scoring: the model's scores for most rules, the validators' for two


def code_scores(root, sid, text):
    """R5 and R12 from the game's validators, and any cap on R7. Returns (scores, storylet or None, reveal_fails)."""
    def score(rule, fails, reason_ok):
        n = len(fails)
        return {"rule": rule, "score": max(0, 10 - 3 * n), "by": "code",
                "reason": reason_ok if not n else f"{n} validator failure(s).",
                "evidence": "\n".join(fails), "fix": "" if not n else "Fix each failure line."}
    try:
        storylet = json.loads(text)
    except json.JSONDecodeError as e:
        bad = [f"not valid JSON: {e}"]
        return [score("R5", [], "Not checked: the draft is not JSON."), {**score("R12", bad, ""), "score": 0}], None, []
    if not isinstance(storylet, dict) or storylet.get("id") != sid:
        bad = [f"the id must be {sid}, not {storylet.get('id') if isinstance(storylet, dict) else storylet!r}"]
        return [score("R5", [], "Not checked: wrong id."), {**score("R12", bad, ""), "score": 0}], None, []
    fails, checks = C.run_validators(root, storylet)
    style = [f for f in fails if f.startswith("FAIL style")]
    reveal = [f for f in fails if f.startswith("FAIL reveal")]
    other = [f for f in fails if f not in style and f not in reveal]
    return ([score("R5", style, "The style validator passes: word limits and banned words."),
             score("R12", other, f"The game's validators pass ({len(checks)} checks).")],
            storylet, reveal)


def scorecard(model_card, code, reveal_fails):
    by_rule = {s["rule"]: {**s, "by": "evaluator", "score": max(0, min(10, int(s["score"])))}
               for s in (model_card or {}).get("scores", [])}
    for s in code:
        by_rule[s["rule"]] = s
    if reveal_fails and "R7" in by_rule:
        r7 = by_rule["R7"]
        r7["score"] = min(r7["score"], 3)
        r7["reason"] += " Capped at 3 by the reveal validator."
        r7["evidence"] = (r7["evidence"] + "\n" + "\n".join(reveal_fails)).strip()
    for rid in RULES:  # a rule the evaluator skipped scores 0, so it cannot slip through
        by_rule.setdefault(rid, {"rule": rid, "score": 0, "by": "loop", "reason": "Not scored.",
                                 "evidence": "", "fix": "Score this rule."})
    scores = [by_rule[rid] for rid in RULES]
    total = round(sum(RULES[s["rule"]]["weight"] * s["score"] for s in scores) / 10, 1)
    under = [s["rule"] for s in scores if s["score"] < RULES[s["rule"]]["floor"]]
    return {"total": total, "accepted": total >= GUIDE["accept_total"] and not under,
            "under_floor": under, "scores": scores,
            "summary": (model_card or {}).get("summary", "")}


# ---------------------------------------------------------------------------
# The run


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("brief", nargs="?")
    ap.add_argument("--dry-run", action="store_true", help="canned agent replies, real validators")
    ap.add_argument("--api", action="store_true", help="spend API credits instead of the Claude plan")
    ap.add_argument("--guide", action="store_true", help="write refine/STYLE_GUIDE.md from style_guide.json")
    args = ap.parse_args()

    if args.guide:
        with open(os.path.join(HERE, "STYLE_GUIDE.md"), "w", encoding="utf-8") as f:
            f.write("<!-- Generated from style_guide.json by `python3 refine/loop.py --guide`. -->\n\n")
            f.write(guide_text())
        print("wrote refine/STYLE_GUIDE.md")
        return 0
    if not args.brief:
        ap.error("a brief is needed")

    brief_path = os.path.abspath(args.brief)
    brief = C.read(brief_path)
    meta = C.parse_brief(brief)
    sid = meta["id"]

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = os.path.join(HERE, "runs", stamp + ("-dry" if args.dry_run else ""))
    os.makedirs(run_dir)
    log_lines = []

    def log(msg):
        line = f"{datetime.datetime.now().strftime('%H:%M:%S')} {msg}"
        print(line, flush=True)
        log_lines.append(line)

    def save(name, obj):
        with open(os.path.join(run_dir, name), "w", encoding="utf-8") as f:
            if isinstance(obj, str):
                f.write(obj)
            else:
                json.dump(obj, f, indent=2, ensure_ascii=False)
                f.write("\n")

    if args.dry_run:
        from fake_agents import FakeClient
        client = FakeClient()
    elif args.api:
        import anthropic
        client = anthropic.Anthropic()
    else:
        from claude_code_client import ClaudeCodeClient  # the Claude plan, not API credits
        client = ClaudeCodeClient()
    loop = Loop(client, log, "dry-run" if args.dry_run else "api" if args.api else "claude-code")
    started = time.monotonic()

    canon = C.canon_bundle(meta["act"], meta["layer"])
    examples = C.example_storylets(meta["act"], meta["location"])
    root = C.sandbox()
    log(f"brief {os.path.relpath(brief_path, REPO)}: {sid}; accept at {GUIDE['accept_total']}/100 with every rule at its floor")

    loop.round = 0
    gen = loop.generate(brief, canon, examples)
    text = gen["storylet_json"]
    history, best, regression = [], None, None
    for it in range(0, MAX_ITERATIONS + 1):
        loop.round = it
        log(f"-- iteration {it}: evaluate")
        code, storylet, reveal_fails = code_scores(root, sid, text)
        pretty = json.dumps(storylet, indent=2, ensure_ascii=False) if storylet else text
        model_card = loop.evaluate(brief, canon, pretty)
        card = scorecard(model_card, code, reveal_fails)
        save(f"draft-{it}.json", pretty + "\n")
        save(f"score-{it}.json", card)
        log(f"[evaluator] total {card['total']}/100" + (f"; under floor: {', '.join(card['under_floor'])}" if card["under_floor"] else ""))
        for s in card["scores"]:
            if s["score"] < 10:
                log(f"[evaluator]   {s['rule']} {s['score']}/10 ({s['by']}): {s['reason']}")
        entry = {"iteration": it, "total": card["total"], "accepted": card["accepted"],
                 "scores": {s["rule"]: s["score"] for s in card["scores"]}}
        history.append(entry)

        if best is None or card["total"] > best["card"]["total"] or (card["accepted"] and not best["card"]["accepted"]):
            best = {"iteration": it, "text": pretty, "card": card}
            regression = None
        else:
            fell = [f"{r} {best['card']['scores'][i]['score']} -> {card['scores'][i]['score']}"
                    for i, r in enumerate(RULES)
                    if card["scores"][i]["score"] < best["card"]["scores"][i]["score"]]
            regression = (f"Your last revision (iteration {it}) scored {card['total']}, not above the "
                          f"{best['card']['total']} of iteration {best['iteration']}, so it was thrown away. "
                          f"Rules that fell: {', '.join(fell) or 'none'}. You are working from iteration "
                          f"{best['iteration']} again; fix its violations without repeating what broke these.")
            log(f"[loop] iteration {it} did not beat iteration {best['iteration']}; discarded")
            entry["discarded"] = True

        if card["accepted"]:
            log(f"[loop] accepted at iteration {it}")
            break
        if it == MAX_ITERATIONS:
            log(f"[loop] {MAX_ITERATIONS} refinements spent; keeping iteration {best['iteration']} ({best['card']['total']})")
            break
        log(f"-- iteration {it + 1}: refine iteration {best['iteration']}")
        out = loop.refine(brief, canon, best["text"], best["card"], regression)
        for ch in out["changes"]:
            log(f"[refiner]   {ch['rule']} {ch['field']}: {ch['before'][:70]!r} -> {ch['after'][:70]!r}")
        save(f"changes-{it + 1}.json", out["changes"])
        text = out["storylet_json"]

    final = best
    save(f"{sid}.json", final["text"] + "\n")
    ledger = C.usage(loop, started, [], "accepted" if final["card"]["accepted"] else "best effort", log)
    ledger["models"] = {k: f"{m} ({e} effort)" for k, (m, e) in AGENTS.items()}
    save("usage.json", ledger)
    save("report.json", {"brief": os.path.relpath(brief_path, REPO), "id": sid,
                         "accepted": final["card"]["accepted"], "final_iteration": final["iteration"],
                         "generator_notes": gen.get("notes"), "history": history, "final_scorecard": final["card"]})
    save("scorecard.md", scorecard_md(sid, history, final))
    save("run.log", "\n".join(log_lines) + "\n")
    log(f"done: {os.path.relpath(run_dir, REPO)}")
    shutil.rmtree(root)
    return 0 if final["card"]["accepted"] else 2


def scorecard_md(sid, history, final):
    """The run at a glance: every rule's score at every iteration, then the final reasons."""
    its = [h["iteration"] for h in history]
    head = "| Rule | Weight | Floor | " + " | ".join(f"It. {i}" for i in its) + " |"
    out = [f"# Scorecard: `{sid}`\n",
           f"{'Accepted' if final['card']['accepted'] else 'Not accepted'}: iteration {final['iteration']}, "
           f"{final['card']['total']}/100 (bar {GUIDE['accept_total']}).\n", head,
           "| --- | ---: | ---: | " + " | ".join("---:" for _ in its) + " |"]
    for rid, r in RULES.items():
        cells = []
        for h in history:
            v = h["scores"][rid]
            cells.append(f"**{v}**" if v < r["floor"] else str(v))
        out.append(f"| {rid} {r['name']} | {r['weight']} | {r['floor']} | " + " | ".join(cells) + " |")
    out.append("| **Total** | 100 | " + str(GUIDE["accept_total"]) + " | "
               + " | ".join(f"{h['total']}" + (" (discarded)" if h.get("discarded") else "") for h in history) + " |")
    out.append("\nBold: under the rule's floor.\n\n## Final scores and reasons\n")
    for s in final["card"]["scores"]:
        out.append(f"- **{s['rule']} {RULES[s['rule']]['name']}: {s['score']}/10** ({s['by']}). {s['reason']}"
                   + (f" Fix: {s['fix']}" if s.get("fix") and s["score"] < 10 else ""))
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    sys.exit(main())
