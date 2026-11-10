"""The Long Boil builder: a goal-oriented coding agent.

    python3 agent/agent.py                  # read, scan, rank: no model call, nothing written
    python3 agent/agent.py --build          # build the top-ranked missing feature, then re-scan
    python3 agent/agent.py --build --max-features 3

The goal is "every feature the GDD asks of the engine exists in the engine".
The agent works toward it in a loop:

1. Read the GDD. requirements.json lists the features the GDD asks for, each
   with the section it comes from and a sentence quoted from it. A quote the
   GDD no longer contains stops the run, so the list cannot drift from the
   design. The GDD also supplies two scoring inputs: how often it mentions a
   feature, and the order in which its Scope section says features are cut.
2. Scan the codebase: every source file under engine/packages, with its
   exports and routes.
3. Detect gaps. Each requirement names the evidence that would show it is
   built (a pattern in the rules, the server, the client, the tests). A
   requirement with evidence missing is a gap.
4. Rank the gaps with priority_score() and pick the highest.
5. Write the code. A planning call chooses which existing files to read; a
   writing call returns new files and exact edits; the gate (typecheck, every
   test, every validator) runs; failures go back for up to MAX_ROUNDS rounds.
   A feature that never passes the gate is taken back out, file by file.
6. Re-scan, and go round again. The loop stops when no gap is left, when
   every gap left is held or waiting on another, or at --max-features.

The agent reads the cleared cut of the GDD (docs/canon/slices/gdd-cleared.md),
like every other agent on this project, so nothing above reveal layer 1 can
reach the code it writes. It writes only under engine/packages, never commits,
and never pushes: accepting the code is Jeremy's step, after playing it.

Model calls go through headless Claude Code (claude -p), on the Claude plan it
is logged in with. Python 3.9+, standard library only.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ENGINE = os.path.join(REPO, "engine")
GDD = os.path.join(REPO, "docs", "canon", "slices", "gdd-cleared.md")
BUILD_PLAN = os.path.join(REPO, "docs", "build-plan.md")
REQUIREMENTS = os.path.join(HERE, "requirements.json")

MODEL = "claude-opus-5-5"
MAX_ROUNDS = 3        # writing rounds per feature before the agent gives up on it
MAX_READ = 14         # existing files the planner may ask to read
TIMEOUT = 30 * 60     # seconds per model call

# Where each kind of evidence is looked for, and the only places the agent may write.
LAYERS = {
    "rules": ("engine/packages/rules/src/",),
    "server": ("engine/packages/server/src/", "engine/packages/server/migrations/"),
    "client": ("engine/packages/client/src/", "engine/packages/client/App.tsx"),
    "tests": ("engine/packages/rules/test/", "engine/packages/server/test/"),
}
SOURCE = (".ts", ".tsx", ".sql")

# The gate, in order; the first step to fail ends the round.
GATE = (
    ("typecheck", ["npm", "run", "typecheck"], ENGINE),
    ("tests", ["npm", "test"], ENGINE),
    ("validators", [sys.executable, os.path.join("scripts", "validate", "run.py")], REPO),
)


# ---------------------------------------------------------------- the GDD

def read_gdd():
    """The GDD's text, its sections by heading, and the order its Scope section cuts features in."""
    with open(GDD, encoding="utf-8") as f:
        text = f.read()
    sections, title = {}, None
    for line in text.splitlines():
        heading = re.match(r"#{2,4}\s+(.*)", line)
        if heading:
            title = re.sub(r"^(?:\d+\.|[A-Z]\.\d*)\s+", "", heading.group(1)).strip()
            sections[title] = []
        elif title:
            sections[title].append(line)
    sections = {k: "\n".join(v).strip() for k, v in sections.items()}
    cut = re.search(r"cuts happen in this order: (.+?)\. ", text)
    cut_order = re.split(r",\s*(?:then\s+)?|\s+and\s+", cut.group(1)) if cut else []
    return {"text": text, "flat": squash(text), "sections": sections, "cut_order": cut_order}


def squash(text):
    return re.sub(r"\s+", " ", text)


def gdd_excerpt(gdd, req):
    """What the GDD says about one requirement: its section, then any other paragraph that names it."""
    out = [f"## {req['gdd']['section']}\n\n{gdd['sections'][req['gdd']['section']]}"]
    seen = gdd["sections"][req["gdd"]["section"]]
    for title, body in gdd["sections"].items():
        for para in body.split("\n\n"):
            if para not in seen and re.search(req["keywords"], para, re.I) and len(para) < 2500:
                out.append(f"(from \"{title}\")\n{para}")
                seen += para
    return "\n\n".join(out)


# ---------------------------------------------------------------- the scan

def layer_of(path):
    for layer, roots in LAYERS.items():
        if path.startswith(roots):
            return layer
    return None


def scan():
    """Every source file the engine is made of: path, layer, size, exports, routes and text."""
    files = []
    for root, dirs, names in os.walk(os.path.join(ENGINE, "packages")):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", ".expo", "assets", "public")]
        for name in sorted(names):
            path = os.path.relpath(os.path.join(root, name), REPO)
            if not name.endswith(SOURCE) or layer_of(path) is None:
                continue
            with open(os.path.join(REPO, path), encoding="utf-8") as f:
                text = f.read()
            files.append({
                "path": path,
                "layer": layer_of(path),
                "lines": text.count("\n") + 1,
                "exports": re.findall(
                    r"^export (?:default )?(?:async )?(?:function|const|class|interface|type|enum) (\w+)", text, re.M),
                "routes": [f"{m.upper()} {u}" for m, u in re.findall(
                    r"\bapp\.(get|post|put|delete)(?:<[^(]*>)?\(\s*[\"'`]([^\"'`]+)", text)],
                "text": text,
            })
    return sorted(files, key=lambda f: f["path"])


def codebase_map(files):
    lines = []
    for f in files:
        line = f"{f['path']} ({f['lines']} lines)"
        if f["exports"]:
            line += " exports: " + ", ".join(f["exports"][:40])
        if f["routes"]:
            line += " | routes: " + ", ".join(f["routes"])
        lines.append(line)
    return "\n".join(lines)


# ---------------------------------------------------------------- gap detection

def detect_gaps(requirements, gdd, files):
    """Compare what the GDD requires with what the scan found.

    Returns one record per requirement: its evidence split into found and
    missing, a status (met, partial, missing), and the figures
    priority_score() works from.
    """
    records = []
    for req in requirements:
        found, missing = [], []
        for ev in req["evidence"]:
            hit = next((f["path"] for f in files if f["layer"] == ev["layer"]
                        and (re.search(ev["pattern"], f["text"], re.I) or re.search(ev["pattern"], f["path"], re.I))),
                       None)
            (found if hit else missing).append({**ev, "file": hit})
        status = "met" if not missing else ("partial" if found else "missing")
        cut_rank = next((i for i, phrase in enumerate(gdd["cut_order"])
                         if re.search(req["keywords"], phrase, re.I)), None)
        records.append({
            **req,
            "status": status,
            "found": found,
            "missing": missing,
            "progress": len(found) / len(req["evidence"]),
            "mentions": len(re.findall(req["keywords"], gdd["text"], re.I)),
            "cut_rank": cut_rank,
        })
    open_ids = {r["id"] for r in records if r["status"] != "met"}
    for r in records:
        # A gap waits while anything it needs is itself a gap, and gains weight for each gap waiting on it.
        r["waiting_on"] = [n for n in r.get("needs", []) if n in open_ids]
        r["unlocks"] = sum(1 for o in records if o["id"] in open_ids and r["id"] in o.get("needs", []))
        r["score"] = priority_score(r) if r["status"] != "met" else None
    return records


# ---------------------------------------------------------------- priority

def priority_score(gap):
    """How soon a gap should be built: what it is worth, divided by what it costs.

    Worth, in points:
      3 x player_value   how much of it a player sees and uses (1 to 5, set in requirements.json)
      + mentions         how often the GDD names it, capped at 5, so the design's own emphasis counts
      + 2 x unlocks      how many other gaps cannot start until this one is built
      + 3 x progress     the share of its evidence already in the codebase: finish what is started

    Cost is effort (1 to 5, set in requirements.json): how many layers and how
    much existing code the feature touches. Dividing by it puts small, visible
    features ahead of large ones of the same worth, which suits an agent whose
    every write must pass the whole gate.

    A feature the GDD's own Scope section lists as one to cut if time runs
    short scores half. A gap that is held (a person parked it, with a reason)
    or waiting on another gap scores 0 and is never picked.
    """
    if gap.get("hold") or gap["waiting_on"]:
        return 0.0
    worth = 3 * gap["player_value"] + min(gap["mentions"], 5) + 2 * gap["unlocks"] + 3 * gap["progress"]
    score = worth / gap["effort"]
    if gap["cut_rank"] is not None:
        score /= 2
    return round(score, 2)


def score_sum(gap):
    """The arithmetic behind a score, for the log."""
    text = (f"(3x{gap['player_value']} value + {min(gap['mentions'], 5)} mentions + 2x{gap['unlocks']} unlocks"
            f" + 3x{gap['progress']:.2f} progress) / {gap['effort']} effort")
    return text + (" / 2 (on the GDD's cut list)" if gap["cut_rank"] is not None else "")


def ranked(records, skip=()):
    """Gaps that can be built now, best first. Ties go to the smaller job, then the id."""
    ready = [r for r in records if r["status"] != "met" and r["score"] > 0 and r["id"] not in skip]
    return sorted(ready, key=lambda r: (-r["score"], r["effort"], r["id"]))


# ---------------------------------------------------------------- the model

def ask(system, prompt, schema, effort="high"):
    """One call to Claude through headless Claude Code: no tools, no project settings, structured output."""
    cmd = ["claude", "-p", "--model", MODEL, "--effort", effort, "--system-prompt", system,
           "--json-schema", json.dumps(schema), "--output-format", "json", "--tools", "",
           "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"]
    # Without an API key in its environment, claude -p can only use the plan it is logged in with.
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    with tempfile.TemporaryDirectory() as cwd:
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, cwd=cwd, env=env, timeout=TIMEOUT)
    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"claude -p failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}")
    if out.get("is_error") or out.get("structured_output") is None:
        raise RuntimeError(f"claude -p returned no structured output: {out.get('result')}")
    return out["structured_output"]


SYSTEM = """You are the builder for The Long Boil, a steampunk idle MMO. You add one missing feature to its \
TypeScript engine, working only from what you are handed: the GDD's words on the feature, a map of the codebase, \
and the files you ask to read. You have no tools; your reply is applied to the repository by a script and then \
typechecked, tested and validated.

How this codebase is built, which your code must match:
- engine/packages/rules is pure TypeScript: deterministic, no database, no network, no clock of its own.
- engine/packages/server is Fastify on Node with PostgreSQL. A feature's queries live in its own module under \
src/; its routes are registered in src/api.ts beside the others, with the same auth and error handling.
- engine/packages/client is Expo (React Native Web). A screen is one file under src/, its fetchers are in \
src/api.ts, and it is reached the way the other screens are.
- Server tests are vitest against a real PostgreSQL database, written like the test you are shown.
- Comments say why, in plain sentences, and name the GDD section a rule comes from. Match the density around you.
- Relative imports end in .js in rules and server.

Rules for this job:
- Build what the GDD asks for and no more. Every number and rule comes from the GDD or from existing code. \
Where the GDD is silent and you had to choose, make the plainest choice and list it under open_questions.
- Do not add dependencies or touch package.json, and prefer no database migration when existing tables answer.
- Write only under engine/packages/rules, engine/packages/server and engine/packages/client.
- Text a player reads is plain and short, in the voice of the screens you are shown. No em dashes.
- A player who is fully banned must not be shown to other players."""

PLAN_OUT = {
    "type": "object",
    "properties": {
        "approach": {"type": "string", "description": "How the feature will be built, layer by layer, in a few sentences."},
        "read": {"type": "array", "items": {"type": "string"},
                 "description": f"Existing files to read in full before writing, as paths from the map. At most {MAX_READ}."},
        "create": {"type": "array", "items": {"type": "string"}, "description": "New files you expect to write."},
    },
    "required": ["approach", "read", "create"],
    "additionalProperties": False,
}

WRITE_OUT = {
    "type": "object",
    "properties": {
        "files": {
            "type": "array",
            "description": "Whole new files. A path may repeat one you created in an earlier round, to replace it.",
            "items": {"type": "object",
                      "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                      "required": ["path", "content"], "additionalProperties": False},
        },
        "edits": {
            "type": "array",
            "description": "Changes to existing files. find must appear exactly once in the file as it now stands.",
            "items": {"type": "object",
                      "properties": {"path": {"type": "string"}, "find": {"type": "string"}, "replace": {"type": "string"}},
                      "required": ["path", "find", "replace"], "additionalProperties": False},
        },
        "summary": {"type": "string", "description": "What was built, for the person who will review it."},
        "open_questions": {"type": "array", "items": {"type": "string"},
                           "description": "Each choice the GDD did not settle, and what you chose."},
    },
    "required": ["files", "edits", "summary", "open_questions"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------- writing code

class Workspace:
    """The agent's writes, kept so a feature that fails the gate can be taken back out exactly."""

    def __init__(self):
        self.created = set()
        self.originals = {}  # path -> text before the agent's first edit

    def check(self, reply):
        """Every reason this reply cannot be applied. Nothing is written unless this is empty."""
        errors, texts = [], {}
        for f in reply["files"]:
            path = f["path"]
            if not writable(path):
                errors.append(f"files: {path} is outside what the builder may write")
            elif os.path.exists(os.path.join(REPO, path)) and path not in self.created:
                errors.append(f"files: {path} already exists; change it with an edit")
            texts[path] = f["content"]
        for i, e in enumerate(reply["edits"]):
            path = e["path"]
            if not writable(path):
                errors.append(f"edits[{i}]: {path} is outside what the builder may write")
                continue
            if path not in texts:
                if not os.path.exists(os.path.join(REPO, path)):
                    errors.append(f"edits[{i}]: {path} does not exist")
                    continue
                texts[path] = read(path)
            count = texts[path].count(e["find"])
            if count != 1:
                errors.append(f"edits[{i}]: find appears {count} times in {path}, must be exactly once: {e['find'][:120]!r}")
                continue
            texts[path] = texts[path].replace(e["find"], e["replace"])
        return errors, texts

    def apply(self, texts):
        for path, text in texts.items():
            full = os.path.join(REPO, path)
            if os.path.exists(full):
                if path not in self.created:
                    self.originals.setdefault(path, read(path))
            else:
                self.created.add(path)
                os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as f:
                f.write(text)

    def touched(self):
        return sorted(self.created | set(self.originals))

    def undo(self):
        for path in self.created:
            os.remove(os.path.join(REPO, path))
        for path, text in self.originals.items():
            with open(os.path.join(REPO, path), "w", encoding="utf-8") as f:
                f.write(text)


def writable(path):
    return (not os.path.isabs(path) and ".." not in path.split("/") and layer_of(path) is not None
            and path.endswith(SOURCE))


def read(path):
    with open(os.path.join(REPO, path), encoding="utf-8") as f:
        return f.read()


def run_gate():
    """Typecheck, tests, validators. Returns None when all pass, else the failing step's output."""
    for name, cmd, cwd in GATE:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
        if proc.returncode != 0:
            out = (proc.stdout + proc.stderr).strip()
            if len(out) > 9000:  # the first errors and the summary say the most
                out = out[:4000] + "\n[...]\n" + out[-5000:]
            return f"{name} failed:\n{out}"
    return None


def build_plan_notes():
    text = open(BUILD_PLAN, encoding="utf-8").read()
    return text[text.index("## Principles"):text.index("## Database")]


def brief(gap, gdd, files):
    scan_for = "\n".join(f"- {ev['layer']}: {ev['what']} (the scan looks for /{ev['pattern']}/ under "
                         f"{' and '.join(LAYERS[ev['layer']])})" for ev in gap["missing"])
    return (f"# The feature to build: {gap['name']}\n\n{gap.get('goal', '')}\n\n"
            f"# What the GDD says\n\n{gdd_excerpt(gdd, gap)}\n\n"
            f"# How the engine is laid out (docs/build-plan.md)\n\n{build_plan_notes()}\n"
            f"# What is missing\n\nThe feature counts as built when the scan finds all of these and the gate "
            f"(npm run typecheck, npm test, scripts/validate/run.py) passes:\n{scan_for}\n\n"
            f"# The codebase\n\n{codebase_map(files)}\n")


def fenced(paths):
    return "\n\n".join(f"=== {p} ===\n{read(p)}" for p in paths if os.path.exists(os.path.join(REPO, p)))


def write_feature(gap, gdd, files, run_dir, log):
    """Plan, write, gate, and repair one feature. Returns the record of what happened; True under "built" if it stands."""
    record = {"id": gap["id"], "built": False, "rounds": []}
    base = brief(gap, gdd, files)

    log("[planner] choosing what to read")
    plan = ask(SYSTEM, base + "\n# Your task now\n\nPlan the build. Say how you will build the feature and name the "
               f"existing files you need to read in full first (at most {MAX_READ}): the ones you will edit, and one "
               "example of each kind of file you will write, a test included.", PLAN_OUT, effort="medium")
    known = {f["path"] for f in files}
    reading = [p for p in plan["read"] if p in known][:MAX_READ]
    record["plan"] = {**plan, "read": reading}
    log(f"[planner] {plan['approach']}")
    log(f"[planner] reading {len(reading)} file(s): {', '.join(os.path.basename(p) for p in reading)}")

    work, feedback = Workspace(), None
    for round_no in range(1, MAX_ROUNDS + 1):
        log(f"-- {gap['id']}: round {round_no}")
        prompt = base + f"\n# The files you asked to read, as they now stand\n\n{fenced(reading)}\n"
        if work.created:
            prompt += f"\n# Files you created in earlier rounds\n\n{fenced(sorted(work.created))}\n"
        if feedback:
            prompt += (f"\n# What went wrong last round\n\n{feedback}\n\n# Your task now\n\nYour earlier work is still "
                       "in place where it applied. Reply with only what must change to fix this: replacement files for "
                       "ones you created, and edits against the files as they now stand.")
        else:
            prompt += ("\n# Your task now\n\nWrite the feature: every layer listed as missing, tests included, and the "
                       "edits that wire it into the existing files.")
        log("[writer] writing (high effort)")
        reply = ask(SYSTEM, prompt, WRITE_OUT)
        with open(os.path.join(run_dir, f"{gap['id']}.round-{round_no}.json"), "w", encoding="utf-8") as f:
            json.dump(reply, f, indent=2)
        entry = {"round": round_no, "files": [f["path"] for f in reply["files"]],
                 "edits": [e["path"] for e in reply["edits"]]}
        record["rounds"].append(entry)
        record["summary"], record["open_questions"] = reply["summary"], reply["open_questions"]
        log(f"[writer] {len(reply['files'])} file(s), {len(reply['edits'])} edit(s)")

        errors, texts = work.check(reply)
        if errors:
            feedback = "Your reply could not be applied, so none of it was:\n" + "\n".join(errors)
        else:
            work.apply(texts)
            log("[gate] typecheck, tests, validators")
            feedback = run_gate()
            if feedback is None:
                # The re-scan is the judge of "built": the gap must be gone, not just the gate green.
                after = next(r for r in detect_gaps([gap], gdd, scan()) if r["id"] == gap["id"])
                if after["missing"]:
                    feedback = "The gate passes, but the scan still cannot find:\n" + "\n".join(
                        f"- {ev['layer']}: {ev['what']} (/{ev['pattern']}/)" for ev in after["missing"])
        if feedback is None:
            log("[gate] all pass, and the scan finds the feature")
            record.update(built=True, created=sorted(work.created), edited=sorted(work.originals))
            return record
        entry["feedback"] = feedback
        log("[gate] " + feedback.splitlines()[0])
        for line in feedback.splitlines()[1:6]:
            log("[gate]   " + line)

    work.undo()
    log(f"[writer] no passing build of {gap['id']} in {MAX_ROUNDS} rounds; its changes are taken back out")
    return record


# ---------------------------------------------------------------- the loop

def scoreboard(records, log):
    for r in records:
        if r["status"] == "met":
            log(f"  met      {r['id']:<18} {r['name']}")
    for r in ranked(records):
        log(f"  {r['status'].upper():<8} {r['id']:<18} score {r['score']:>5.2f} = {score_sum(r)}")
    for r in records:
        if r["status"] != "met" and r["score"] == 0:
            why = f"held: {r['hold']}" if r.get("hold") else "waiting on " + ", ".join(r["waiting_on"])
            log(f"  {r['status'].upper():<8} {r['id']:<18} {why}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--build", action="store_true", help="write code for the top-ranked gap (default: only rank)")
    parser.add_argument("--max-features", type=int, default=1, help="features to build before stopping (default 1)")
    args = parser.parse_args()

    run_dir = os.path.join(HERE, "runs", datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(run_dir)
    log_file = open(os.path.join(run_dir, "run.log"), "w", encoding="utf-8")

    def log(line):
        stamped = f"{datetime.datetime.now():%H:%M:%S} {line}"
        print(stamped, flush=True)
        log_file.write(stamped + "\n")
        log_file.flush()

    gdd = read_gdd()
    with open(REQUIREMENTS, encoding="utf-8") as f:
        requirements = json.load(f)["requirements"]
    stale = [r["id"] for r in requirements
             if r["gdd"]["section"] not in gdd["sections"] or squash(r["gdd"]["quote"]) not in gdd["flat"]]
    if stale:
        sys.exit(f"requirements.json quotes the GDD for {', '.join(stale)}, but the GDD no longer says so. Fix the list first.")
    log(f"GDD read: {len(gdd['sections'])} sections, {len(requirements)} requirements, each quote found")
    log("GDD cut order: " + "; ".join(gdd["cut_order"]))

    if args.build:
        log("[gate] checking the codebase passes before anything is written")
        broken = run_gate()
        if broken:
            sys.exit("The gate fails before the agent has written anything, so it will not build on it:\n" + broken)

    report = {"passes": [], "features": []}
    failed, passes = set(), 0
    while True:
        passes += 1
        files = scan()
        records = detect_gaps(requirements, gdd, files)
        gaps = [r for r in records if r["status"] != "met"]
        log(f"== pass {passes}: {len(files)} files scanned, {len(records) - len(gaps)} of {len(records)} requirements met")
        scoreboard(records, log)
        report["passes"].append([{k: r[k] for k in ("id", "status", "score", "progress", "mentions", "unlocks",
                                                    "cut_rank", "waiting_on")} for r in records])
        if not gaps:
            log("stop: every requirement is met")
            break
        ready = ranked(records, skip=failed)
        if not ready:
            log("stop: every gap left is held, waiting on another, or failed the gate this run")
            break
        choice = ready[0]
        log(f"next: {choice['id']} ({choice['name']}), score {choice['score']}")
        if not args.build:
            log("stop: ranking only. Run with --build to write it")
            break
        if len(report["features"]) >= args.max_features:
            log(f"stop: --max-features {args.max_features} reached")
            break
        result = write_feature(choice, gdd, files, run_dir, log)
        result["score"], result["why"] = choice["score"], score_sum(choice)
        report["features"].append(result)
        if not result["built"]:
            failed.add(choice["id"])

    with open(os.path.join(run_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    log(f"run written to {os.path.relpath(run_dir, REPO)}")


if __name__ == "__main__":
    main()
