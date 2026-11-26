"""Canned agents for loop.py --dry-run.

The Generator's draft breaks five rules on purpose: "the player" and "a sense of"
(the style validator catches both), a past-tense sentence, a modern "okay", and a
whale in a world where nothing lives below the city. The canned Evaluator finds
what is still in the text; the canned Refiner fixes the two heaviest problems per
pass. So the dry run shows the loop needing more than one refinement, with the
real validators scoring R5 and R12 throughout.
"""

import json
import os
import re
import types

HERE = os.path.dirname(os.path.abspath(__file__))

# (rule, flawed text, fixed text, reason)
FLAWS = [
    ("R8", "a tin of whale oil", "a tin of lamp oil",
     "Whale oil means something still lives in the sea below; world.md says nobody alive has seen the ground and the Scald covers the world."),
    ("R1", "The first-years watched you take off your coat.", "The first-years watch you take off your coat.",
     "Past tense for what the Tinker does now."),
    ("R4", "Okay, you think,", "Very well, you think,",
     "\"Okay\" is modern idiom."),
    ("R5", "a sense of", "the look of", None),
    ("R5", "the player", "you", None),
]


def _reply(payload):
    return types.SimpleNamespace(
        stop_reason="end_turn", stop_details=None,
        content=[types.SimpleNamespace(type="text", text=json.dumps(payload))],
        usage=types.SimpleNamespace(input_tokens=0, cache_creation_input_tokens=0,
                                    cache_read_input_tokens=0, output_tokens=0))


def _storylet(user):
    m = re.search(r"<storylet>\n(.*?)\n</storylet>", user, re.S)
    return m.group(1)


class _Messages:
    def create(self, *, system, messages, **_):
        user = messages[-1]["content"]
        if system.startswith("# Scrivener"):
            with open(os.path.join(HERE, "fixtures", "flawed_draft.json"), encoding="utf-8") as f:
                return _reply({"storylet_json": f.read(), "notes": "Dry run: a draft with five planted flaws."})
        if system.startswith("# Evaluator"):
            text = _storylet(user)
            scores = {}
            for rule, bad, _, reason in FLAWS:
                if reason and bad in text:
                    s = scores.setdefault(rule, {"rule": rule, "score": 10, "reason": "", "evidence": "", "fix": ""})
                    s["score"] -= 4
                    s["reason"] = (s["reason"] + " " + reason).strip()
                    s["evidence"] = (s["evidence"] + f" \"{bad}\"").strip()
                    s["fix"] = "Replace it."
            ids = re.findall(r"^## (R\d+)\. .*scored by evaluator", user, re.M)
            out = [scores.get(r, {"rule": r, "score": 10, "reason": "No problem found.", "evidence": "", "fix": ""}) for r in ids]
            return _reply({"scores": out, "summary": "Dry run."})
        if system.startswith("# Refiner"):
            text = _storylet(user)
            todo = [ln.split(" ")[1] for ln in user.split("<scorecard", 1)[1].splitlines() if ln.startswith("- R")][:2]
            changes = []
            for rule, bad, good, _ in FLAWS:
                if rule in todo and bad in text:
                    text = text.replace(bad, good)
                    changes.append({"rule": rule, "field": "text", "before": bad, "after": good})
            return _reply({"storylet_json": text, "changes": changes})
        raise ValueError("unknown agent: " + system[:40])


class FakeClient:
    def __init__(self):
        self.beta = types.SimpleNamespace(messages=_Messages())
