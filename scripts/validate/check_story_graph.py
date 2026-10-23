"""Check: story graph (work order 015, scope 4).

Reads every storylet/1 and letter/1 file (a letter is a short storylet and is
held to the same rules) and fails when:

- never-set: a quality some storylet or letter requires is set by nothing.
  "Set" means changed by any storylet's or letter's outcome, or of a type the
  game sets on its own (SET_BY_GAME below).
- set-by-unknown: a required quality that no outcome sets is of a type for
  which docs/canon/qualities.json does not say whether the game sets it
  (SET_BY_GAME is None). This is an open question, not a pass.
- unreachable: a storylet or letter whose own requires cannot be met from a
  fresh Tinker.
- unreachable-option: an option of a reachable storylet whose requires cannot
  be met.
- leads-nowhere: an option outcome that changes no quality.
- not-checkable: a story file that is not storylet/1 or letter/1, or does not
  match its schema (the schema check reports why).

Reachability is a fixed point over a deliberately generous model. A fresh
Tinker holds every quality at the bottom of its type's registry range. A requirement
"<quality> <op> <n>" can be met when the fresh value already meets it, or the
quality's type is set by the game, or a reachable outcome moves it the right
way: "+N" for >= and >, "-N" for <= and <, either for ==, or a set to a value
that meets it. Magnitudes, repeats and the conjunction of several
requirements are not modelled, so a storylet this check calls unreachable is
certainly unreachable, and one it calls reachable may still not be. Both
outcomes of a reachable option (success and failure) count as reachable.
Names that are not qualities are the qualities check's to report; here they
can never be met.

No story file is not a failure: the real tree has none until work order 016.

Usage: python3 scripts/validate/check_story_graph.py [--root DIR]
"""

import operator
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import story  # noqa: E402
from check_references import item_ids  # noqa: E402

CHECK = "story_graph"

# Whether the game, outside any storylet or letter, sets a quality of each
# type, read from each type's "set_by" text in docs/canon/qualities.json.
# The registry has no machine-readable field for this; True and False below
# are readings of its text, and None marks a type the text does not decide.
SET_BY_GAME = {
    "skill": True,      # "the idle loop, never by a storylet"
    "item": True,       # "drops, crafting, storylets"
    "favour": True,     # "Work Orders, storylets, Guild Contracts"
    "lore": True,       # "storylets, boss first-kills, rare drops"
    "needle": False,    # "failed or risky storylets; falls 1 per 24h" (falling only lowers it)
    "progress": False,  # "storylets"
    "flag": None,       # "choices": open question, whether only storylet choices
    "record": True,     # "the engine, never by a storylet" (record.check_ins counts visits)
    "nerve": None,      # no "types" entry; open question in the registry itself
}

# A fresh Tinker's value for each type: the bottom of the type's range in
# docs/canon/qualities.json (skills start at level 1, everything else at 0;
# record's range is [0, null], so a fresh record is 0). None where the
# registry gives no range (nerve).

OPS = {">=": operator.ge, "<=": operator.le, "==": operator.eq,
       ">": operator.gt, "<": operator.lt}


def _parse_condition(text):
    for symbol in (">=", "<=", "==", ">", "<"):
        if text.startswith(symbol):
            return symbol, int(text[len(symbol):])
    raise ValueError(text)


def _parse_change(value):
    """Returns ("+", n), ("-", n) or ("=", n)."""
    if isinstance(value, str):
        return value[0], int(value[1:])
    return "=", int(value)


def _fresh_values(types):
    out = {}
    for kind in SET_BY_GAME:
        entry = types.get(kind)
        rng = entry.get("range") if isinstance(entry, dict) else None
        low = rng[0] if isinstance(rng, list) and rng and isinstance(rng[0], int) else None
        out[kind] = low
    return out


class Graph:
    def __init__(self, kinds, fresh):
        self.kinds = kinds  # quality name -> type, or absent
        self.fresh = fresh  # type -> fresh value or None
        self.moves = {}     # quality name -> set of ("+"|"-"|"=", n) from reachable outcomes

    def can_meet(self, name, condition):
        kind = self.kinds.get(name)
        if kind is None:
            return False
        if SET_BY_GAME.get(kind) is True:
            return True
        symbol, n = _parse_condition(condition)
        test = OPS[symbol]
        start = self.fresh.get(kind)
        if start is not None and test(start, n):
            return True
        for move, amount in self.moves.get(name, ()):
            if move == "=" and test(amount, n):
                return True
            if move == "+" and symbol in (">=", ">", "=="):
                return True
            if move == "-" and symbol in ("<=", "<", "=="):
                return True
        return False

    def meets_all(self, requires):
        return all(self.can_meet(name, cond) for name, cond in requires.items())

    def add(self, changes):
        grew = False
        for name, value in changes.items():
            move = _parse_change(value)
            seen = self.moves.setdefault(name, set())
            if move not in seen:
                seen.add(move)
                grew = True
        return grew


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    names, types, error = story.load_registry(root)
    if error:
        report.fail("registry-unreadable", story.REGISTRY_PATH, error)
        return report
    kinds = dict(names)
    for item in item_ids(root):
        kinds.setdefault(item, "item")

    files = story.story_files(root)
    nodes = []  # (path, ident, data)
    for path, data in files:
        ident = story.file_id(data)
        declared = story.declared(data)
        if declared not in story.CHECKABLE:
            report.fail("not-checkable", path, "schema is %r; only %s can be checked"
                        % (declared, " and ".join(story.CHECKABLE)), ident)
            continue
        errors = lib.validate(data, schemas[declared])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "its graph is not checked" % (declared, len(errors)), ident)
            continue
        nodes.append((path, ident, data))

    # leads-nowhere, and every quality any outcome sets.
    set_anywhere = set()
    for path, ident, data in nodes:
        for index, option in enumerate(data["options"]):
            for key, outcome in story.outcomes(option):
                if not outcome["changes"]:
                    report.fail("leads-nowhere", path,
                                "/options/%d/%s changes no quality" % (index, key), ident)
                set_anywhere.update(outcome["changes"])

    # never-set and set-by-unknown, once per (file, quality).
    for path, ident, data in nodes:
        required = []
        required.extend(("/requires", n) for n in data["requires"])
        for index, option in enumerate(data["options"]):
            required.extend(("/options/%d/requires" % index, n)
                            for n in option.get("requires", {}))
        reported = set()
        for where, name in required:
            kind = kinds.get(name)
            if kind is None or name in set_anywhere or name in reported:
                continue
            setter = SET_BY_GAME.get(kind)
            if setter is True:
                continue
            reported.add(name)
            if setter is None:
                report.fail("set-by-unknown", path,
                            "%s/%s: no outcome sets %r, and %s does not say whether the "
                            "game sets a %s quality" % (where, lib.escape_pointer_token(name),
                                                        name, story.REGISTRY_PATH, kind), ident)
            else:
                report.fail("never-set", path,
                            "%s/%s: %r is required but no storylet or letter outcome sets "
                            "it, and the game does not set a %s quality"
                            % (where, lib.escape_pointer_token(name), name, kind), ident)

    # Reachability from a fresh Tinker.
    graph = Graph(kinds, _fresh_values(types))
    reached, reached_options = set(), set()
    grew = True
    while grew:
        grew = False
        for number, (path, ident, data) in enumerate(nodes):
            if number not in reached:
                if not graph.meets_all(data["requires"]):
                    continue
                reached.add(number)
                grew = True
            for index, option in enumerate(data["options"]):
                if (number, index) in reached_options:
                    continue
                if not graph.meets_all(option.get("requires", {})):
                    continue
                reached_options.add((number, index))
                grew = True
                for _key, outcome in story.outcomes(option):
                    graph.add(outcome["changes"])

    for number, (path, ident, data) in enumerate(nodes):
        if number not in reached:
            blocked = sorted(n for n, c in data["requires"].items() if not graph.can_meet(n, c))
            report.fail("unreachable", path,
                        "cannot be reached from a fresh Tinker; no reachable path meets: %s"
                        % ", ".join("%s %s" % (n, data["requires"][n]) for n in blocked), ident)
            continue
        for index, option in enumerate(data["options"]):
            if (number, index) in reached_options:
                continue
            requires = option.get("requires", {})
            blocked = sorted(n for n, c in requires.items() if not graph.can_meet(n, c))
            report.fail("unreachable-option", path,
                        "/options/%d cannot be chosen from a fresh Tinker; no reachable path "
                        "meets: %s" % (index, ", ".join("%s %s" % (n, requires[n]) for n in blocked)),
                        ident)

    storylets, letters = story.count_kinds(files)
    report.note("%d storylet file(s), %d letter file(s); %d checked, %d reachable%s"
                % (storylets, letters, len(nodes), len(reached),
                   "; nothing to check" if not files else ""))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
