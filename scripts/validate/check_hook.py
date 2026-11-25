"""Check: the clearance hook refuses and allows what its cases say.

.claude/hooks/block_canon.py keeps agents out of canon above their clearance.
This check replays scripts/validate/hook_cases.json against it: each case is
one tool call as Claude Code would hand it to the hook, and whether the hook
must refuse it ("deny") or let it through ("allow").

No case touches a real file. The hook runs with CLAUDE_PROJECT_DIR set to a
made-up repository, /repo, so it judges paths only; it reads commands, never
files. A case's "cwd" is relative to /repo.

A case:
  {"id": "...", "tool": "Bash" | "Read" | "Grep" | "Glob",
   "input": {...tool_input...}, "agent": "inspector" (omit for none),
   "cwd": "docs/canon" (optional), "want": "deny" | "allow"}

Fails:
  hook/cases      the cases file is missing or not a list of cases
  hook/shape      a case is malformed, or its id is repeated
  hook/error      the hook exited non-zero or printed something unreadable
  hook/allowed    the hook let through a case that must be refused
  hook/refused    the hook refused a case that must be let through

The hook under test is the one in --root if it has one, else the
repository's own, so the fixtures test the real hook.

Usage: python3 scripts/validate/check_hook.py [--root DIR]
"""

import json
import os
import subprocess
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "hook"
CASES = "scripts/validate/hook_cases.json"
HOOK = ".claude/hooks/block_canon.py"
FAKE_REPO = "/repo"
TOOLS = ("Bash", "Read", "Grep", "Glob")
WANTS = ("deny", "allow")


def verdict(hook, case):
    call = {"tool_name": case["tool"], "tool_input": case["input"],
            "cwd": os.path.join(FAKE_REPO, case.get("cwd", ""))}
    if case.get("agent"):
        call["agent_type"] = case["agent"]
    env = dict(os.environ, CLAUDE_PROJECT_DIR=FAKE_REPO, PYTHONDONTWRITEBYTECODE="1")
    done = subprocess.run([sys.executable, hook], input=json.dumps(call), env=env,
                          capture_output=True, text=True, timeout=10)
    if done.returncode != 0:
        return None, "exit %d: %s" % (done.returncode, done.stderr.strip()[-300:])
    out = done.stdout.strip()
    if not out:
        return "allow", ""
    try:
        decision = json.loads(out)["hookSpecificOutput"]["permissionDecision"]
    except (ValueError, KeyError, TypeError):
        return None, "unreadable output: %s" % out[:300]
    return ("deny" if decision == "deny" else "allow"), ""


def run(root):
    report = lib.Report(CHECK)
    path = os.path.join(root, CASES)
    hook = os.path.join(root, HOOK)
    if not os.path.isfile(hook):
        hook = os.path.join(lib.DEFAULT_ROOT, HOOK)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            cases = json.load(fh)
    except (OSError, ValueError) as err:
        report.fail("cases", CASES, "cannot read the hook's cases: %s" % err)
        return report
    if not isinstance(cases, list):
        report.fail("cases", CASES, "the hook's cases must be a list")
        return report

    seen, counts = set(), {"deny": 0, "allow": 0}
    for index, case in enumerate(cases):
        ident = case.get("id") if isinstance(case, dict) else None
        if (not isinstance(case, dict) or not isinstance(ident, str) or not ident
                or case.get("tool") not in TOOLS or case.get("want") not in WANTS
                or not isinstance(case.get("input"), dict)):
            report.fail("shape", CASES, "case %d needs a string id, a tool in %s, an input object and want deny or allow"
                        % (index, "/".join(TOOLS)), ident)
            continue
        if ident in seen:
            report.fail("shape", CASES, "repeated case id", ident)
            continue
        seen.add(ident)
        got, why = verdict(hook, case)
        who = case.get("agent") or "no agent"
        if got is None:
            report.fail("error", CASES, "hook failed for %s: %s" % (who, why), ident)
        elif got != case["want"]:
            code = "allowed" if case["want"] == "deny" else "refused"
            report.fail(code, CASES, "%s: want %s, hook said %s: %s %s"
                        % (who, case["want"], got, case["tool"], json.dumps(case["input"], sort_keys=True)), ident)
        else:
            counts[got] += 1
    report.note("%d case(s) behaved: %d refused, %d allowed" % (counts["deny"] + counts["allow"], counts["deny"], counts["allow"]))
    return report


if __name__ == "__main__":
    sys.exit(run(lib.parse_root(sys.argv[1:])).emit())
