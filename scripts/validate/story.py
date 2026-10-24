"""Shared helpers for the storylet and letter checks (work order 015).

Not a check itself: run.py does not list it. Standard library only; no
network calls, no model calls.

A story file is any content file declaring storylet/* or letter/*. Its
quality references are:

- requires: every key of the file's "requires" and of each option's
  "requires" (a gate the storylet reads);
- challenge: each option's challenge "quality" (read by the odds formula);
- changes: every key of each outcome's "changes" (set or adjusted).

Canon is read from the root being checked, so every fixture carries its own
docs/canon files and never depends on the real ones.
"""

import json
import os

import lib

STORYLET_PREFIX = "storylet/"
GUIDE_PREFIX = "guide/"
LETTER_PREFIX = "letter/"
CHECKABLE = ("storylet/1", "letter/1")
OUTCOME_KEYS = ("success", "failure")

REGISTRY_PATH = "docs/canon/qualities.json"
STYLE_PATH = "docs/canon/style.md"


def declared(data):
    value = data.get("schema") if isinstance(data, dict) else None
    return value if isinstance(value, str) else ""


def file_id(data):
    value = data.get("id") if isinstance(data, dict) else None
    return value if isinstance(value, str) else None


def story_files(root):
    """(path, data) for every parsed content file declaring storylet/* or
    letter/*, anywhere under content/. Files that do not parse are the schema
    check's to report."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue
        if declared(data).startswith((STORYLET_PREFIX, LETTER_PREFIX)):
            out.append((path, data))
    return out


def count_kinds(files):
    storylets = sum(1 for _p, d in files if declared(d).startswith(STORYLET_PREFIX))
    return storylets, len(files) - storylets


def options(data):
    """(index, option) for each dict in data["options"], leniently."""
    value = data.get("options")
    if not isinstance(value, list):
        return []
    return [(i, o) for i, o in enumerate(value) if isinstance(o, dict)]


def outcomes(option):
    """(key, outcome) for the option's success and failure, leniently."""
    return [(k, option[k]) for k in OUTCOME_KEYS if isinstance(option.get(k), dict)]


def prose_fields(data):
    """(pointer, text) for each prose field the player reads: the
    description, each option label and each outcome text, leniently: a
    field that is missing or not a string is skipped (the schema check's to
    report)."""
    out = []
    if isinstance(data.get("description"), str):
        out.append(("/description", data["description"]))
    for index, option in options(data):
        if isinstance(option.get("label"), str):
            out.append(("/options/%d/label" % index, option["label"]))
        for key, outcome in outcomes(option):
            if isinstance(outcome.get("text"), str):
                out.append(("/options/%d/%s/text" % (index, key), outcome["text"]))
    return out


def references(data):
    """(pointer, quality name, role) for every quality the file names,
    leniently: a malformed part is skipped, not raised."""
    out = []
    if isinstance(data.get("requires"), dict):
        for name in data["requires"]:
            out.append(("/requires/" + lib.escape_pointer_token(name), name, "requires"))
    for index, option in options(data):
        base = "/options/%d" % index
        if isinstance(option.get("requires"), dict):
            for name in option["requires"]:
                out.append(("%s/requires/%s" % (base, lib.escape_pointer_token(name)),
                            name, "requires"))
        challenge = option.get("challenge")
        if isinstance(challenge, dict) and "quality" in challenge:
            out.append((base + "/challenge/quality", challenge["quality"], "challenge"))
        for key, outcome in outcomes(option):
            if isinstance(outcome.get("changes"), dict):
                for name in outcome["changes"]:
                    out.append(("%s/%s/changes/%s" % (base, key, lib.escape_pointer_token(name)),
                                name, "changes"))
    return out


def load_registry(root):
    """Returns ({quality name: type}, {type: type entry}, error). The
    registry is docs/canon/qualities.json under root."""
    try:
        with open(os.path.join(root, REGISTRY_PATH), "r", encoding="utf-8") as fh:
            registry = json.load(fh)
    except OSError as exc:
        return None, None, "cannot be read: %s" % (exc.strerror or exc.__class__.__name__)
    except (ValueError, UnicodeDecodeError) as exc:
        return None, None, "does not parse as JSON: %s" % exc
    groups = registry.get("qualities") if isinstance(registry, dict) else None
    types = registry.get("types") if isinstance(registry, dict) else None
    if not isinstance(groups, dict) or not isinstance(types, dict):
        return None, None, "has no \"qualities\" object or no \"types\" object"
    names = {}
    for kind, listed in groups.items():
        if not isinstance(listed, list) or not all(isinstance(n, str) for n in listed):
            return None, None, "qualities.%s is not a list of names" % kind
        for name in listed:
            names.setdefault(name, kind)
    return names, types, None


# --------------------------------------------------------------------------
# The first-session guide (work order 021, part 1)
# --------------------------------------------------------------------------

# Work order 021: the guide is Prologue prose, so the reveal guard reads it as
# act 0. It has no act or reveal_layer field of its own.
GUIDE_ACT = 0


def guide_files(root):
    """(path, data) for every parsed content file declaring guide/*,
    anywhere under content/ (the schema check reports one in the wrong
    place)."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue
        if declared(data).startswith(GUIDE_PREFIX):
            out.append((path, data))
    return out


def guide_prose_fields(data):
    """(pointer, text, field) for each step's line and button, leniently:
    a step or field that is missing or not the right type is skipped (the
    schema check's to report). field is "line" or "button"."""
    out = []
    steps = data.get("steps")
    if not isinstance(steps, list):
        return out
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        for field in ("line", "button"):
            if isinstance(step.get(field), str):
                out.append(("/steps/%d/%s" % (index, field), step[field], field))
    return out


# --------------------------------------------------------------------------
# Work Orders (work order 022, part 1)
# --------------------------------------------------------------------------

WORK_ORDER_PREFIX = "work_order/"


def work_order_files(root):
    """(path, data) for every parsed content file declaring work_order/*,
    anywhere under content/ (the schema check reports one in the wrong
    place)."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue
        if declared(data).startswith(WORK_ORDER_PREFIX):
            out.append((path, data))
    return out


def work_order_prose_fields(data):
    """(pointer, text) for the order's request line, leniently: a request
    that is missing or not a string is skipped (the schema check's to
    report)."""
    if isinstance(data.get("request"), str):
        return [("/request", data["request"])]
    return []


# --------------------------------------------------------------------------
# Hester's Ledger pages (work order 024, section 4)
# --------------------------------------------------------------------------

LEDGER_PREFIX = "ledger_page/"


def ledger_files(root):
    """(path, data) for every parsed content file declaring ledger_page/*,
    anywhere under content/ (the schema check reports one in the wrong
    place)."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue
        if declared(data).startswith(LEDGER_PREFIX):
            out.append((path, data))
    return out


def ledger_prose_fields(data):
    """(pointer, text, field) for the page's title and text, leniently: a
    field that is missing or not a string is skipped (the schema check's to
    report). field is "title" or "text"."""
    return [("/" + field, data[field], field) for field in ("title", "text")
            if isinstance(data.get(field), str)]
