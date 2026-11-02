"""Canned agent replies for crew.py --dry-run.

Stands in for anthropic.Anthropic() so the whole pipeline, the validator gate
included, runs with no API key. The scrivener's first draft carries a banned
phrase on purpose, so the run shows the gate sending a draft back.
"""

import json
import os
import re
import types

HERE = os.path.dirname(os.path.abspath(__file__))


def _reply(payload):
    return types.SimpleNamespace(
        stop_reason="end_turn",
        stop_details=None,
        content=[types.SimpleNamespace(type="text", text=json.dumps(payload))],
        usage=types.SimpleNamespace(input_tokens=0, output_tokens=0),
    )


class _Messages:
    def __init__(self):
        self.drafts = 0

    def create(self, *, system, messages, **_):
        user = messages[-1]["content"]
        if system.startswith("# Scrivener"):
            return _reply(self.scrivener())
        if system.startswith("# Inspector"):
            return _reply({"verdict": "pass with notes", "reveal_risks": [], "economy_risks": [],
                           "findings": [{"field": "description",
                                         "finding": "Dorrit is a new name, not in characters.md.",
                                         "fix": "Keep her unnamed, or canonise her."}]})
        if system.startswith("# Registrar"):
            return _reply(self.registrar(user))
        raise ValueError("unknown agent")

    def scrivener(self):
        self.drafts += 1
        with open(os.path.join(HERE, "fixtures", "dry_run_storylet.json")) as f:
            storylet = json.load(f)
        if self.drafts == 1:
            storylet["description"] = storylet["description"].replace(
                "She looks at", "There is a sense of hope as she looks at")
        return {"storylet_json": json.dumps(storylet), "invented": ["Dorrit, a picker who trades silk"],
                "open_questions": ["Should Dorrit be canon?"]}

    def registrar(self, user):
        sid = re.search(r"<storylet_id>(.+?)</storylet_id>", user).group(1)
        events = json.loads(re.search(r"<events>\n(.*?)\n</events>", user, re.S).group(1))
        drafted = [e for e in events if e["event"] == "drafted"][-1]
        passed = [e for e in events if e["event"] == "validators" and e["result"] == "pass"][-1]
        review = [e for e in events if e["event"] == "reviewed"][-1]
        row = {
            "id": sid, "type": "storylet", "path": f"content/storylets/{sid}.json", "pointer": None,
            "revision": None, "work_order": "crew/briefs/rustmoor-silk-storylet.md",
            "status": "reviewed", "drafted_by": "scrivener", "model": "claude-opus-5-5", "patch": None,
            "validators": {"result": "pass", "run": passed["at"], "checks": passed["checks"], "waiver": None},
            "review": {"by": "inspector",
                       "verdict": "fail" if review["verdict"]["verdict"] == "fail" else "pass",
                       "notes": "Pass with notes: " + "; ".join(
                           f["finding"] for f in review["verdict"]["findings"])},
            "approved_by": None, "approved_at": None,
            "history": [{"at": drafted["at"], "status": "drafted", "by": "scrivener"},
                        {"at": passed["at"], "status": "validated", "by": "validators"},
                        {"at": review["at"], "status": "reviewed", "by": "inspector"}],
            "retirement": None,
        }
        return {"row_json": json.dumps(row), "notes": "dry run"}


class FakeClient:
    def __init__(self):
        self.beta = types.SimpleNamespace(messages=_Messages())
