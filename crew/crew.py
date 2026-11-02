"""The Long Boil content crew: three Claude agents and a validator gate.

    .venv/bin/python crew.py briefs/rustmoor-silk-storylet.md
    .venv/bin/python crew.py briefs/rustmoor-silk-storylet.md --dry-run
    .venv/bin/python crew.py briefs/rustmoor-silk-storylet.md --apply
    .venv/bin/python crew.py briefs/rustmoor-silk-storylet.md --claude-code

The crew turns a brief into one game-ready storylet for The Long Boil, the same
way the game's own pipeline does:

1. The scrivener drafts the storylet as storylet/1 JSON from the brief and the
   Act I canon slice.
2. The validator gate runs the game's real validators (scripts/validate/run.py)
   on a sandbox copy of the content tree with the draft dropped in. Any failure
   naming the draft goes back to the scrivener.
3. The inspector reviews what code cannot check: voice, lore, reveal timing,
   whether the choice is a real one. A fail goes back to the scrivener.
4. The registrar writes the storylet's provenance row. The gate runs again with
   the row in the register, so the provenance check must pass as well.

Each agent's system prompt is its definition in .claude/agents/, the same files
the build crew uses in Claude Code. Nothing above the brief's reveal layer, and
never docs/canon/locked.md, reaches any agent.

The run is written to runs/<timestamp>/. With --apply, the storylet is copied
into content/storylets/ and its row appended to content/provenance.json.
Approval stays with Jeremy: the crew never moves a row past "reviewed".
"""

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CANON = os.path.join(REPO, "docs", "canon")
GDD = os.path.join(REPO, "docs", "gdd.md")
AGENTS = os.path.join(REPO, ".claude", "agents")
VALIDATE = os.path.join(REPO, "scripts", "validate", "run.py")

MODEL = "claude-opus-5-5"
MAX_ROUNDS = 3  # scrivener drafts before the crew gives up
LOCKED = "locked.md"

# Statuses the crew may write. "approved" and "shipped" are Jeremy's.
CREW_STATUSES = ("drafted", "validated", "reviewed")

SCRIVENER_OUT = {
    "type": "object",
    "properties": {
        "storylet_json": {
            "type": "string",
            "description": "The whole storylet/1 file, as JSON text.",
        },
        "invented": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Anything the scene needed that canon does not state.",
        },
        "open_questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["storylet_json", "invented", "open_questions"],
    "additionalProperties": False,
}

INSPECTOR_OUT = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "pass with notes", "fail"]},
        "reveal_clear": {
            "type": "boolean",
            "description": "False if any line states or hints at anything above the cleared reveal layer, however faintly.",
        },
        "reveal_risks": {"type": "array", "items": {"type": "string"}},
        "economy_risks": {"type": "array", "items": {"type": "string"}},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "finding": {"type": "string"},
                    "fix": {"type": "string"},
                },
                "required": ["field", "finding", "fix"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["verdict", "reveal_clear", "reveal_risks", "economy_risks", "findings"],
    "additionalProperties": False,
}

REGISTRAR_OUT = {
    "type": "object",
    "properties": {
        "row_json": {
            "type": "string",
            "description": "The register row for this storylet, as JSON text.",
        },
        "notes": {"type": "string"},
    },
    "required": ["row_json", "notes"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Context: what each agent is allowed to read


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def agent_prompt(name):
    """An agent's definition from .claude/agents/, without its front matter."""
    text = read(os.path.join(AGENTS, name + ".md"))
    if text.startswith("---"):
        text = text.split("---", 2)[2]
    return text.strip()


def reveals_to(layer):
    """reveals.md with every table row above the cleared layer cut out."""
    out = []
    for line in read(os.path.join(CANON, "reveals.md")).splitlines():
        m = re.match(r"\|\s*(\d+)\s*\|", line)
        if m and int(m.group(1)) > layer:
            continue
        out.append(line)
    return "\n".join(out)


ROMAN = {1: "I", 2: "II", 3: "III"}


def gdd_sections(act):
    """The GDD sections a storylet is written against: the house voice, this
    act's storyline and nothing past it, and the storylet rules with the odds
    formula. Section 4's opening, which lists every reveal layer, is never sent."""
    wanted = ("### Tone and voice", f"### Act {ROMAN[act]}:", "### Storylets")
    out, keep = [], False
    for line in read(GDD).splitlines():
        if line.startswith("## ") or line.startswith("### "):
            keep = line.startswith(wanted)
        if keep:
            out.append(line)
    return "\n".join(out)


def canon_bundle(act, layer):
    """The GDD sections, the Act slice and the files it says to attach. Never locked.md."""
    files = [f"slices/act{act}.md", "world.md", "characters.md", "style.md", "qualities.json"]
    assert LOCKED not in files
    parts = [f"<file name=\"docs/gdd.md\" sections=\"Tone and voice; Act {ROMAN[act]}; Storylets\">\n"
             f"{gdd_sections(act)}\n</file>"]
    parts += [f"<file name=\"docs/canon/{f}\">\n{read(os.path.join(CANON, f))}\n</file>" for f in files]
    parts.append(f"<file name=\"docs/canon/reveals.md\" truncated_at_layer=\"{layer}\">\n"
                 f"{reveals_to(layer)}\n</file>")
    return "\n\n".join(parts)


def example_storylets(act, location, n=2):
    """Neighbouring storylets, so the draft matches the shape and voice."""
    d = os.path.join(REPO, "content", "storylets")
    names = sorted(f for f in os.listdir(d) if f.startswith(f"act{act}.{location}."))[:n]
    return "\n\n".join(f"<file name=\"content/storylets/{f}\">\n{read(os.path.join(d, f))}\n</file>"
                       for f in names)


def parse_brief(text):
    def field(label):
        m = re.search(r"\*\*" + label + r":\*\*\s*(?:`([^`]+)`|([^.\n*]+))", text)
        return (m.group(1) or m.group(2)).strip() if m else None
    return {
        "act": int(field("Act")),
        "location": field("Location"),
        "layer": int(re.search(r"reveal layer (\d)", text).group(1)),
        "id": field("Storylet id"),
    }


# ---------------------------------------------------------------------------
# The validator gate (the toolwright's checks; no model in here)


def sandbox():
    root = tempfile.mkdtemp(prefix="longboil-crew-")
    shutil.copytree(os.path.join(REPO, "content"), os.path.join(root, "content"))
    shutil.copytree(CANON, os.path.join(root, "docs", "canon"),
                    ignore=shutil.ignore_patterns(LOCKED))
    return root


def run_validators(root, storylet, row=None):
    """Drop the draft (and its row) into a fresh copy and run every check.

    Returns the FAIL lines that name this storylet. Before the registrar has
    written a row, the provenance check's no-row failure is expected and
    skipped; afterwards every failure counts.
    """
    sid = storylet["id"]
    rel = f"content/storylets/{sid}.json"
    with open(os.path.join(root, rel), "w", encoding="utf-8") as f:
        json.dump(storylet, f, indent=2)
        f.write("\n")
    reg_path = os.path.join(root, "content", "provenance.json")
    reg = json.loads(read(os.path.join(REPO, "content", "provenance.json")))
    reg["rows"] = [r for r in reg["rows"] if r.get("id") != sid]
    if row is not None:
        reg["rows"].append(row)
    with open(reg_path, "w", encoding="utf-8") as f:
        json.dump(reg, f, indent=2)
        f.write("\n")

    proc = subprocess.run([sys.executable, VALIDATE, "--root", root],
                          capture_output=True, text=True)
    fails = [ln for ln in proc.stdout.splitlines() + proc.stderr.splitlines()
             if ln.startswith("FAIL") and (sid in ln or rel in ln)]
    if row is None:
        fails = [ln for ln in fails if not ln.startswith("FAIL provenance/no-row")]
    checks = list(dict.fromkeys(re.findall(r"^(\w+): passed", proc.stdout, re.M)))
    return fails, checks


# ---------------------------------------------------------------------------
# The agents


class Crew:
    def __init__(self, client, log):
        self.client = client
        self.log = log

    def ask(self, agent, system, user, schema, effort):
        """One structured call to Claude as `agent`. Returns the parsed JSON."""
        self.log(f"[{agent}] thinking ({effort} effort)")
        response = self.client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": effort,
                           "format": {"type": "json_schema", "schema": schema}},
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"{agent} declined: {response.stop_details}")
        if response.stop_reason == "max_tokens":
            raise RuntimeError(f"{agent} ran out of tokens")
        text = next(b.text for b in response.content if b.type == "text")
        u = response.usage
        self.log(f"[{agent}] done: {u.input_tokens} in, {u.output_tokens} out")
        return json.loads(text)

    def scrivener(self, brief, canon, examples, feedback):
        system = agent_prompt("scrivener") + (
            "\n\n## In this crew\n\nYou are running outside Claude Code, with no file tools. "
            "Everything you may read is in the user message. Return the storylet as JSON "
            "text in storylet_json; the crew writes the file and runs the validators for you, "
            "and hands you back anything they or the inspector find.")
        user = (f"<brief>\n{brief}\n</brief>\n\n<canon>\n{canon}\n</canon>\n\n"
                f"<examples>\n{examples}\n</examples>")
        if feedback:
            user += ("\n\n<revision_needed>\nYour last draft came back. Fix every point "
                     f"and return the whole storylet again.\n{feedback}\n</revision_needed>")
        return self.ask("scrivener", system, user, SCRIVENER_OUT, "high")

    def inspector(self, brief, canon, storylet, checks):
        system = agent_prompt("inspector") + (
            "\n\n## In this crew\n\nYou review one storylet. Return one verdict for it. "
            "A fail must name the exact field and the exact fix. Set reveal_clear to false if any "
            "line states or hints at anything above the cleared layer, however faintly; the crew "
            "then sends the draft back whatever your verdict.")
        user = (f"<validators passed=\"{', '.join(checks)}\"/>\n\n<brief>\n{brief}\n</brief>\n\n"
                f"<canon>\n{canon}\n</canon>\n\n<storylet>\n{json.dumps(storylet, indent=2)}\n</storylet>")
        return self.ask("inspector", system, user, INSPECTOR_OUT, "high")

    def registrar(self, sid, events, example_row, errors):
        system = agent_prompt("registrar") + (
            "\n\n## In this crew\n\nWrite exactly one row, for the storylet named below, from "
            "the events given. Never set approved_by or approved_at: approval is Jeremy's. "
            "The highest status you may give is \"reviewed\".")
        user = (f"<storylet_id>{sid}</storylet_id>\n<path>content/storylets/{sid}.json</path>\n"
                f"<events>\n{json.dumps(events, indent=2)}\n</events>\n\n"
                f"<example_row>\n{json.dumps(example_row, indent=2)}\n</example_row>")
        if errors:
            user += f"\n\n<provenance_check_failed>\n{errors}\n</provenance_check_failed>"
        return self.ask("registrar", system, user, REGISTRAR_OUT, "low")


def guard_row(row, sid):
    """Hard rules the registrar may not break, whatever the model says."""
    problems = []
    if row.get("id") != sid:
        problems.append(f"row id is {row.get('id')!r}, expected {sid!r}")
    if row.get("status") not in CREW_STATUSES:
        problems.append(f"status {row.get('status')!r} is not one the crew may write")
    if row.get("approved_by") or row.get("approved_at"):
        problems.append("approved_by and approved_at must be null")
    return problems


# ---------------------------------------------------------------------------
# The run


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("brief")
    ap.add_argument("--dry-run", action="store_true",
                    help="run the whole pipeline with canned agent replies, no API calls")
    ap.add_argument("--claude-code", action="store_true",
                    help="run each agent through headless Claude Code (your Claude plan) instead of the API")
    ap.add_argument("--apply", action="store_true",
                    help="copy the storylet and its row into the game's content tree")
    args = ap.parse_args()

    brief_path = os.path.abspath(args.brief)
    brief = read(brief_path)
    meta = parse_brief(brief)
    sid = meta["id"]

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = os.path.join(HERE, "runs", stamp)
    n = 1
    while os.path.exists(run_dir):
        n += 1
        run_dir = os.path.join(HERE, "runs", f"{stamp}-{n}")
    os.makedirs(run_dir)
    log_lines = []

    def log(msg):
        line = f"{datetime.datetime.now().strftime('%H:%M:%S')} {msg}"
        print(line, flush=True)
        log_lines.append(line)

    if args.dry_run:
        from dry_run import FakeClient
        client = FakeClient()
    elif args.claude_code:
        from claude_code_client import ClaudeCodeClient
        client = ClaudeCodeClient()
    else:
        import anthropic
        client = anthropic.Anthropic()
    crew = Crew(client, log)

    canon = canon_bundle(meta["act"], meta["layer"])
    examples = example_storylets(meta["act"], meta["location"])
    root = sandbox()
    events = [{"at": now(), "event": "brief", "path": os.path.relpath(brief_path, REPO)}]
    log(f"brief {os.path.relpath(brief_path, REPO)}: {sid}, act {meta['act']}, layer {meta['layer']}")

    feedback, storylet, verdict, checks, draft = None, None, None, [], None
    for rnd in range(1, MAX_ROUNDS + 1):
        log(f"-- round {rnd}")
        draft = crew.scrivener(brief, canon, examples, feedback)
        try:
            storylet = json.loads(draft["storylet_json"])
        except json.JSONDecodeError as e:
            feedback = f"storylet_json is not valid JSON: {e}"
            log(f"[gate] {feedback}")
            continue
        events.append({"at": now(), "event": "drafted", "by": "scrivener", "round": rnd})
        if storylet.get("id") != sid:
            feedback = f"The id must be {sid}, not {storylet.get('id')}."
            log(f"[gate] {feedback}")
            continue

        fails, checks = run_validators(root, storylet)
        if fails:
            log(f"[gate] {len(fails)} validator failure(s), back to the scrivener")
            for ln in fails:
                log(f"[gate]   {ln}")
            events.append({"at": now(), "event": "validators", "result": "fail", "lines": fails})
            feedback = "The validators failed:\n" + "\n".join(fails)
            continue
        log(f"[gate] validators pass ({len(checks)} checks)")
        events.append({"at": now(), "event": "validators", "result": "pass", "checks": checks})

        verdict = crew.inspector(brief, canon, storylet, checks)
        log(f"[inspector] verdict: {verdict['verdict']}")
        for f in verdict["findings"]:
            log(f"[inspector]   {f['field']}: {f['finding']} Fix: {f['fix']}")
        events.append({"at": now(), "event": "reviewed", "by": "inspector", "verdict": verdict})
        if verdict["verdict"] != "fail" and verdict["reveal_clear"]:
            break
        if verdict["verdict"] != "fail":
            # Hinting counts (docs/canon/reveals.md): a reveal risk sends the draft back
            # even when the inspector would pass it on everything else.
            log("[gate] the inspector found a reveal risk; back to the scrivener")
        feedback = "The inspector sent the draft back:\n" + "\n".join(
            [f"- Reveal risk: {r}" for r in verdict["reveal_risks"]]
            + [f"- {f['field']}: {f['finding']} Fix: {f['fix']}" for f in verdict["findings"]])
        verdict = None
    else:
        log(f"gave up after {MAX_ROUNDS} rounds; nothing to register")
        write_run(run_dir, log_lines, storylet, draft, verdict, None, events)
        return 1

    reg = json.loads(read(os.path.join(REPO, "content", "provenance.json")))
    example_row = next(r for r in reg["rows"] if r["type"] == "storylet" and r["status"] == "reviewed")
    row, errors = None, None
    for attempt in (1, 2):
        out = crew.registrar(sid, events, example_row, errors)
        row = json.loads(out["row_json"])
        problems = guard_row(row, sid)
        if not problems:
            fails, _ = run_validators(root, storylet, row)
            problems = fails
        if not problems:
            log(f"[registrar] row written at status {row['status']}; provenance check passes")
            break
        errors = "\n".join(problems)
        log(f"[registrar] row rejected: {errors}")
    else:
        log("registrar could not write a valid row")
        write_run(run_dir, log_lines, storylet, draft, verdict, None, events)
        return 1

    write_run(run_dir, log_lines, storylet, draft, verdict, row, events)
    if args.apply:
        dest = os.path.join(REPO, "content", "storylets", f"{sid}.json")
        shutil.copy(os.path.join(run_dir, f"{sid}.json"), dest)
        reg["rows"] = [r for r in reg["rows"] if r["id"] != sid] + [row]
        with open(os.path.join(REPO, "content", "provenance.json"), "w", encoding="utf-8") as f:
            json.dump(reg, f, indent=2)
            f.write("\n")
        log(f"applied: {os.path.relpath(dest, REPO)} and its register row")
    log(f"done: {os.path.relpath(run_dir, REPO)}")
    shutil.rmtree(root)
    return 0


def write_run(run_dir, log_lines, storylet, draft, verdict, row, events):
    if storylet:
        with open(os.path.join(run_dir, f"{storylet.get('id', 'draft')}.json"), "w") as f:
            json.dump(storylet, f, indent=2)
            f.write("\n")
    report = {
        "invented": draft and draft["invented"],
        "open_questions": draft and draft["open_questions"],
        "inspector": verdict,
        "register_row": row,
        "events": events,
    }
    with open(os.path.join(run_dir, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
        f.write("\n")
    with open(os.path.join(run_dir, "run.log"), "w") as f:
        f.write("\n".join(log_lines) + "\n")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        if type(e).__name__ in ("CredentialsError", "AuthenticationError"):
            sys.exit(f"No Anthropic credentials: set ANTHROPIC_API_KEY, or run --dry-run. ({e})")
        if type(e).__name__.endswith("Error") and hasattr(e, "status_code"):
            sys.exit(f"The Anthropic API refused the request ({e.status_code}): {e}")
        raise
