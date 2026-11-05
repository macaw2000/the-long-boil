#!/usr/bin/env python3
"""PreToolUse: keep agents out of the canon files above their clearance.

Telling agents to stop reading at Layer 1 failed three times in work order 037,
so this refuses the read. Agents use docs/canon/slices/ instead. Only the
draftsman may read the GDD, and only if Claude Code names the agent; anything
it cannot place is refused. It matches names, so a command that reaches a file
without naming it, such as a script, is not caught.
"""
import json
import re
import sys

GDD = re.compile(r"(?<![\w-])gdd\.md\b")
SEALED = re.compile(r"(?<![\w-])(reveals|locked)\.md\b")
# A recursive search of docs/ reaches the same files without naming them.
SWEEP = re.compile(r"\b(rg|grep\s+(-\w+\s+)*-\w*[rR]\w*)\s[^|;&]*\bdocs(/canon)?/?(\s|$)")


def refuse(why):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": why + " Use docs/canon/slices/reveals-layer1.md and the other slices; docs/canon/slices/gdd-cleared.md once Jeremy has checked it.",
    }}))
    sys.exit(0)


call = json.load(sys.stdin)
tool = call.get("tool_input") or {}
if call.get("tool_name") == "Bash":
    text = tool.get("command", "")
else:
    text = " ".join(str(tool.get(key, "")) for key in ("file_path", "path", "pattern", "glob"))

if SEALED.search(text):
    refuse("That canon file is above agents' clearance.")
if GDD.search(text) and call.get("agent_type") != "draftsman":
    refuse("The GDD is above this agent's clearance.")
if call.get("tool_name") == "Bash" and SWEEP.search(text):
    refuse("A recursive search of docs/ reaches canon above this agent's clearance.")
if call.get("tool_name") == "Grep" and re.search(r"(^|/)docs(/canon)?/?$", str(tool.get("path", ""))):
    refuse("A recursive search of docs/ reaches canon above this agent's clearance.")
