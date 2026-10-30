"""Gear files (gear/1 and gear/2, under content/gear/), loaded once for the
combat check, the pacing check (tools) and the drops check's grocer sink.

gear/1 holds two slots, weapon and the legacy armour slot (combat.json
revision 9). gear/2 (work order 029, combat.json revision 10) holds every
slot: weapon; off_hand, head, body, hands, feet and charm, worn by combat
level; one tool per gathering and production skill, worn by that skill's
level (content/tuning/tools.json); and the legacy armour slot, worn by
Fortitude, which content/gear/cinderworks.json still uses until it moves
(combat.json gear.legacy_armour_slot).

The rules a JSON Schema subset cannot say, checked here for both versions:

- row n of stats_by_calibration has calibration n, and row +0 is not null
  (gear-row-order, gear-row-zero);
- a weapon has a style, and nothing else has one; a tool has a skill, and
  nothing else has one (gear-shape);
- every row carries exactly its slot's stats (gear-shape): a weapon power
  and accuracy; armour, off_hand, head, body, hands and feet armour; a charm
  accuracy; a tool speed_percent;
- one gear entry per item across every gear file, of either version
  (gear-duplicate).

A gear/* file that is neither version, or does not match the one it
declares, fails as not-checkable. Gear entries that break a rule above are
left out of every reference loadout and tool ladder.
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

GEAR_PREFIX = "gear/"
GEAR_SCHEMAS = ("gear/1", "gear/2")

WEAPON = "weapon"
LEGACY_ARMOUR = "armour"
CHARM = "charm"
TOOL = "tool"
# combat.json gear.slot_rules: the five pieces that give armour at +0, worn
# by combat level (gear.combat_level).
ARMOUR_SLOTS = ("off_hand", "head", "body", "hands", "feet")
# Every slot worn by combat level, in combat.json gear.loadout order.
COMBAT_LEVEL_SLOTS = ARMOUR_SLOTS + (CHARM,)

# The stats each slot's rows carry, and the stat the reference loadout ranks
# a non-weapon piece by.
ROW_STATS = dict([(WEAPON, ("power", "accuracy")), (LEGACY_ARMOUR, ("armour",)),
                  (CHARM, ("accuracy",)), (TOOL, ("speed_percent",))]
                 + [(slot, ("armour",)) for slot in ARMOUR_SLOTS])
ALL_ROW_STATS = ("power", "accuracy", "armour", "speed_percent")

# How a slot is named in a gear-shape message. Weapon and legacy armour keep
# the wording gear/1's messages have always had.
_ROW_NOUN = {WEAPON: "a weapon", LEGACY_ARMOUR: "an armour", CHARM: "a charm",
             TOOL: "a tool", "off_hand": "an off_hand", "head": "a head",
             "body": "a body", "hands": "a hands", "feet": "a feet"}
_PIECE_NOUN = {WEAPON: "a weapon", LEGACY_ARMOUR: "armour", CHARM: "a charm",
               TOOL: "a tool", "off_hand": "an off_hand piece", "head": "a head piece",
               "body": "a body piece", "hands": "a hands piece", "feet": "a feet piece"}


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def load_gear(report, root, schemas):
    """Returns (file_count, [(path, entry)]) for gear entries that keep every
    rule; reports the ones that do not."""
    files = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue  # the schema check reports unparseable files
        if _declared(data).startswith(GEAR_PREFIX):
            files.append((path, data, _declared(data)))
    good = []
    seen = {}
    for path, data, declared in files:
        if declared not in GEAR_SCHEMAS:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked"
                        % (declared, " or ".join(GEAR_SCHEMAS)),
                        data.get("id") if isinstance(data.get("id"), str) else None)
            continue
        errors = lib.validate(data, schemas[declared])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "its gear is left out of the reference gear"
                        % (declared, len(errors)), data.get("id"))
            continue
        for index, entry in enumerate(data["gear"]):
            seen.setdefault(entry["item"], []).append("%s#/gear/%d" % (path, index))
            if _entry_ok(report, path, index, entry):
                good.append((path, entry))
    duplicates = set()
    for item in sorted(seen):
        if len(seen[item]) > 1:
            duplicates.add(item)
            for path in sorted(set(w.split("#")[0] for w in seen[item])):
                report.fail("gear-duplicate", path,
                            "item has %d gear entries: %s; one entry per item"
                            % (len(seen[item]), ", ".join(seen[item])), item)
    return len(files), [(p, e) for p, e in good if e["item"] not in duplicates]


def _entry_ok(report, path, index, entry):
    item = entry["item"]
    where = "/gear/%d" % index
    ok = True
    slot = entry["slot"]
    if slot == WEAPON and "style" not in entry:
        report.fail("gear-shape", path, "%s: a weapon needs a style" % where, item)
        ok = False
    if slot != WEAPON and "style" in entry:
        report.fail("gear-shape", path, "%s: %s has no style"
                    % (where, _PIECE_NOUN[slot]), item)
        ok = False
    if slot == TOOL and "skill" not in entry:
        report.fail("gear-shape", path, "%s: a tool needs a skill, the gathering or "
                    "production skill whose slot it fills" % where, item)
        ok = False
    if slot != TOOL and "skill" in entry:
        report.fail("gear-shape", path, "%s: %s has no skill; only a tool has one"
                    % (where, _PIECE_NOUN[slot]), item)
        ok = False
    need = ROW_STATS[slot]
    banned = tuple(k for k in ALL_ROW_STATS if k not in need)
    rows = entry["stats_by_calibration"]
    if rows[0] is None:
        report.fail("gear-row-zero", path,
                    "%s/stats_by_calibration/0: row +0 is null; only rows +1 to +20 "
                    "may be null" % where, item)
        ok = False
    for n, row in enumerate(rows):
        if row is None:
            continue
        rwhere = "%s/stats_by_calibration/%d" % (where, n)
        if row["calibration"] != n:
            report.fail("gear-row-order", path,
                        "%s: calibration is %s; row %d must be +%d"
                        % (rwhere, row["calibration"], n, n), item)
            ok = False
        missing = [k for k in need if k not in row]
        extra = [k for k in banned if k in row]
        if missing or extra:
            article = _ROW_NOUN[slot]
            report.fail("gear-shape", path,
                        "%s: %s row needs %s%s"
                        % (rwhere, article, " and ".join(need),
                           "; %s is not %s stat" % (", ".join(extra), article) if extra else ""),
                        item)
            ok = False
    return ok


def stat_at(entry, stat, calibration=0):
    """The entry's stat at that calibration, or None when the row is null."""
    row = entry["stats_by_calibration"][calibration]
    return None if row is None else row[stat]


def tools(gear):
    """{skill: [(item, level_required, speed_percent at +0, path)]}, sorted."""
    out = {}
    for path, entry in gear:
        if entry["slot"] == TOOL:
            out.setdefault(entry["skill"], []).append(
                (entry["item"], entry["level_required"], stat_at(entry, "speed_percent"), path))
    for skill in out:
        out[skill].sort()
    return out
