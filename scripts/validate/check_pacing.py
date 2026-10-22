"""Check: band pacing (work order 003, scope 4; combat added by work order 005,
scope 2).

For each skill that has actions, and each zone band (GDD section 6: 1 to 20,
20 to 45, 45 to 70):

- At each level L, the player uses the action with the highest XP per hour
  (xp * 3600 / seconds) among that skill's actions with level_required <= L.
  Inputs are ignored: the player is assumed to have them (see the open
  question in work order 003's hand-back).
- Band hours = sum over L = start .. end-1 of the curve's cost_to_next(L)
  divided by that level's best XP per hour.
- Band days = band hours / (BAND_SKILL_QUEUE_HOURS_PER_DAY x
  MAIN_COMBAT_SKILL_SHARE), both read from the curve file's "assumptions".
- A band fails when its days are more than BAND_DAYS_TOLERANCE from
  TARGET_BAND_DAYS.
- Each checked band's effective rate (band XP / band hours) is reported as a
  multiple of the curve's reference action (reference_action.xp * 3600 /
  reference_action.seconds_per_action), beside the curve's
  band_xp_rate_targets.

Which bands are checked: a band is checked only when the skill has an action
unlocked at the band's first level (level_required <= start) and at least one
action whose level_required lies inside the band (start <= level_required <
end). A band with no actions of its own is a NOTE. A band that has actions of
its own but nothing unlocked at its first level is a WARN, not checked.

Combat (work order 005): the main combat skill earns XP only from monsters,
so it is checked from monster/1 files, reported as "main combat skill":

- At each level L, the best target is the non-boss monster with the highest
  XP per hour (xp * 3600 / seconds_per_kill) among those with level <= L.
  Bosses never count: they are fought on purpose (GDD section 6).
- Everything else is the action rule above: band hours, band days, the
  tolerance, the band selection rule (with "non-boss monster" for "action"
  and level for level_required) and the rate report.
- A monster's xp is total combat XP before the main-skill split. It is used
  as is, with no share applied: the share is already in the denominator
  (BAND_SKILL_QUEUE_HOURS_PER_DAY x MAIN_COMBAT_SKILL_SHARE), exactly as the
  curve derives 5,600 main-skill XP a day = 12 h x 0.70 x the reference
  rate. Applying the share to xp as well would count it twice.

The curve is the one content file whose schema is tuning.xp_curve/1 and which
matches that schema. With no actions and no monsters there is nothing to check
and no curve is needed.

Usage: python3 scripts/validate/check_pacing.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
from check_xp_curve import TARGET_BAND_DAYS, ZONE_BANDS, band_key  # noqa: E402

CHECK = "pacing"

ACTION_SCHEMA_PREFIX = "action/"
CHECKABLE_ACTION_SCHEMA = "action/1"
MONSTER_SCHEMA_PREFIX = "monster/"
CHECKABLE_MONSTER_SCHEMA = "monster/1"

# The label the main combat skill is reported under. Monsters name no skill:
# the main combat skill is whichever one the loadout is built around.
MAIN_COMBAT_LABEL = "main combat skill"
CURVE_SCHEMA = "tuning.xp_curve/1"

# Work order 003, scope 4: a band passes when its days are within 2 of 14.
BAND_DAYS_TOLERANCE = 2

# Read from the curve file's "assumptions"; never copied here (work order 003).
HOURS_PER_DAY_KEY = "BAND_SKILL_QUEUE_HOURS_PER_DAY"
SHARE_KEY = "MAIN_COMBAT_SKILL_SHARE"


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def _load_entries(report, root, schemas, prefix, checkable, key, what):
    """[(path, entry)] from every file declaring prefix* that matches checkable.

    A file that declares prefix* but is not the checkable version, or does not
    match it, fails here as not-checkable: pacing computed without its entries
    would be wrong, so the check says so instead of guessing.
    """
    out = []
    files = 0
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue  # the schema check reports unparseable files
        declared = _declared(data)
        if not declared.startswith(prefix):
            continue
        files += 1
        if declared != checkable:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked"
                        % (declared, checkable))
            continue
        errors = lib.validate(data, schemas[checkable])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "pacing for the %s leaves its %s out"
                        % (checkable, len(errors), what, key))
            continue
        for entry in data[key]:
            out.append((path, entry))
    return files, out


def load_actions(report, root, schemas):
    return _load_entries(report, root, schemas, ACTION_SCHEMA_PREFIX,
                         CHECKABLE_ACTION_SCHEMA, "actions", "skills it names")


def load_monsters(report, root, schemas):
    return _load_entries(report, root, schemas, MONSTER_SCHEMA_PREFIX,
                         CHECKABLE_MONSTER_SCHEMA, "monsters", MAIN_COMBAT_LABEL)


def load_curve(report, root, schemas):
    """Returns (path, curve) or (None, None) after reporting why."""
    found, bad = [], []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or _declared(data) != CURVE_SCHEMA:
            continue
        if lib.validate(data, schemas[CURVE_SCHEMA]):
            bad.append(path)
        else:
            found.append((path, data))
    if len(found) == 1:
        return found[0]
    if not found:
        report.fail("no-curve", ", ".join(bad) or "-",
                    "actions or monsters exist but no file is a valid %s curve%s"
                    % (CURVE_SCHEMA,
                       " (these declare it but do not match it; see the schema check)"
                       if bad else ""))
    else:
        report.fail("many-curves", ", ".join(p for p, _ in found),
                    "%d valid %s files; pacing needs exactly one"
                    % (len(found), CURVE_SCHEMA))
    return None, None


def _positive_number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and value > 0)


def curve_inputs(report, path, curve):
    """Returns (hours_per_day, reference_xph, costs, targets) or None."""
    ident = curve.get("id")
    ok = True
    assumptions = curve.get("assumptions", {})
    values = {}
    for key in (HOURS_PER_DAY_KEY, SHARE_KEY):
        value = assumptions.get(key)
        if not _positive_number(value):
            report.fail("assumption-missing", path,
                        "assumptions.%s is %r; pacing needs a positive number"
                        % (key, value), ident)
            ok = False
        values[key] = value

    ref = curve.get("reference_action", {})
    if not (_positive_number(ref.get("xp"))
            and _positive_number(ref.get("seconds_per_action"))):
        report.fail("reference-unusable", path,
                    "reference_action needs a positive xp and seconds_per_action",
                    ident)
        ok = False

    costs = {}
    for row in curve.get("table", []):
        if _positive_number(row.get("cost_to_next")):
            costs.setdefault(row["level"], row["cost_to_next"])
    needed = [l for s, e in ZONE_BANDS for l in range(s, e) if l not in costs]
    if needed:
        report.fail("curve-incomplete", path,
                    "table lacks a positive cost_to_next at levels %s"
                    % ", ".join(str(l) for l in sorted(set(needed))), ident)
        ok = False
    if not ok:
        return None
    hours_per_day = values[HOURS_PER_DAY_KEY] * values[SHARE_KEY]
    reference_xph = ref["xp"] * 3600.0 / ref["seconds_per_action"]
    targets = curve.get("band_xp_rate_targets", {})
    return hours_per_day, reference_xph, costs, targets


class Pool:
    """What one band computation needs to know about its candidates.

    entries are (path, ident, level, xp_per_hour), one per action or non-boss
    monster. The wording fields keep each kind's report lines in its own terms.
    """

    def __init__(self, label, entries, noun, plural, level_field, best_word):
        self.label = label
        self.entries = entries
        self.noun = noun
        self.plural = plural
        self.level_field = level_field
        self.best_word = best_word


def xp_per_hour(action):
    return action["xp"] * 3600.0 / action["seconds"]


def kill_xp_per_hour(monster):
    """Total combat XP per hour, before the main-skill split."""
    return monster["xp"] * 3600.0 / monster["seconds_per_kill"]


def action_pool(skill, actions):
    return Pool("skill %s" % skill,
                [(p, a["id"], a["level_required"], xp_per_hour(a)) for p, a in actions],
                "action", "actions", "level_required for the skill", "actions")


def monster_pool(monsters):
    """Non-boss monsters only: bosses are fought on purpose (GDD section 6)."""
    return Pool(MAIN_COMBAT_LABEL,
                [(p, m["id"], m["level"], kill_xp_per_hour(m))
                 for p, m in monsters if not m["boss"]],
                "non-boss monster", "non-boss monsters", "non-boss monster level",
                "targets")


def best_entry(entries, level):
    """The entry with the highest XP per hour available at level.
    Ties go to the lower id, so the result never depends on file order."""
    unlocked = [e for e in entries if e[2] <= level]
    if not unlocked:
        return None
    return min(unlocked, key=lambda e: (-e[3], e[1]))


def _spans(used):
    """[(id, first_level, last_level)] from a per-level list of ids."""
    spans = []
    for level, ident in used:
        if spans and spans[-1][0] == ident and spans[-1][2] == level - 1:
            spans[-1][2] = level
        else:
            spans.append([ident, level, level])
    return ", ".join("%s (levels %s)" % (i, a if a == b else "%d-%d" % (a, b))
                     for i, a, b in spans)


def check_band(report, pool, start, end, inputs):
    hours_per_day, reference_xph, costs, targets = inputs
    entries = pool.entries
    label = "%s band %d to %d" % (pool.label, start, end)
    own = [e for e in entries if start <= e[2] < end]
    if not own:
        report.note("%s: no %s unlocked inside the band; not checked"
                    % (label, pool.plural))
        return
    if best_entry(entries, start) is None:
        lowest = min(e[2] for e in entries)
        paths = ", ".join(sorted(set(e[0] for e in own)))
        report.warn("band-uncovered", paths,
                    "%s: has %s, but none is unlocked at level %d (lowest "
                    "%s is %d); not checked"
                    % (label, pool.plural, start, pool.level_field, lowest))
        return

    hours = 0.0
    band_xp = 0
    used, paths = [], set()
    for level in range(start, end):
        path, ident, _lvl, xph = best_entry(entries, level)
        hours += costs[level] / xph
        band_xp += costs[level]
        used.append((level, ident))
        paths.add(path)
    days = hours / hours_per_day
    multiple = (band_xp / hours) / reference_xph
    target = targets.get(band_key(start, end))
    target_text = ("%sx" % target) if target is not None else "none stated"
    summary = ("%s: %.2f days, effective rate %.2fx the reference (curve target %s); "
               "best %s: %s" % (label, days, multiple, target_text, pool.best_word,
                                _spans(used)))
    if abs(days - TARGET_BAND_DAYS) > BAND_DAYS_TOLERANCE:
        report.fail("band-days", ", ".join(sorted(paths)),
                    "%s; must be within %s of %d days"
                    % (summary, BAND_DAYS_TOLERANCE, TARGET_BAND_DAYS))
    else:
        report.note(summary)


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    files, actions = load_actions(report, root, schemas)
    mfiles, monsters = load_monsters(report, root, schemas)
    if not actions:
        report.note("%d action file(s), 0 checkable actions; nothing to check" % files)
    if not monsters:
        report.note("%d monster file(s), 0 checkable monsters; %s: nothing to check"
                    % (mfiles, MAIN_COMBAT_LABEL))
    if not actions and not monsters:
        return report

    path, curve = load_curve(report, root, schemas)
    if curve is None:
        return report
    inputs = curve_inputs(report, path, curve)
    if inputs is None:
        return report

    if actions:
        by_skill = {}
        for pa in actions:
            by_skill.setdefault(pa[1]["skill"], []).append(pa)
        report.note("%d action file(s), %d checkable actions, %d skill(s); curve %s, "
                    "%.2f band-skill hours a day"
                    % (files, len(actions), len(by_skill), path, inputs[0]))
        for skill in sorted(by_skill):
            pool = action_pool(skill, by_skill[skill])
            for start, end in ZONE_BANDS:
                check_band(report, pool, start, end, inputs)

    if monsters:
        pool = monster_pool(monsters)
        bosses = len(monsters) - len(pool.entries)
        report.note("%s: %d monster file(s), %d checkable monsters (%d boss(es), "
                    "never counted); curve %s, %.2f band-skill hours a day"
                    % (MAIN_COMBAT_LABEL, mfiles, len(monsters), bosses, path,
                       inputs[0]))
        for start, end in ZONE_BANDS:
            check_band(report, pool, start, end, inputs)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
