"""Check: band pacing (work order 003, scope 4).

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

The curve is the one content file whose schema is tuning.xp_curve/1 and which
matches that schema. With no actions at all there is nothing to check and no
curve is needed.

Usage: python3 scripts/validate/check_pacing.py [--root DIR]
"""

import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
from check_xp_curve import TARGET_BAND_DAYS, ZONE_BANDS, band_key  # noqa: E402

CHECK = "pacing"

ACTION_SCHEMA_PREFIX = "action/"
CHECKABLE_ACTION_SCHEMA = "action/1"
CURVE_SCHEMA = "tuning.xp_curve/1"

# Work order 003, scope 4: a band passes when its days are within 2 of 14.
BAND_DAYS_TOLERANCE = 2

# Read from the curve file's "assumptions"; never copied here (work order 003).
HOURS_PER_DAY_KEY = "BAND_SKILL_QUEUE_HOURS_PER_DAY"
SHARE_KEY = "MAIN_COMBAT_SKILL_SHARE"


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def load_actions(report, root, schemas):
    """[(path, action)] from every action file that matches action/1.

    A file that declares action/* but is not action/1, or does not match it,
    fails here as not-checkable: pacing computed without its actions would be
    wrong, so the check says so instead of guessing.
    """
    out = []
    files = 0
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue  # the schema check reports unparseable files
        declared = _declared(data)
        if not declared.startswith(ACTION_SCHEMA_PREFIX):
            continue
        files += 1
        if declared != CHECKABLE_ACTION_SCHEMA:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked"
                        % (declared, CHECKABLE_ACTION_SCHEMA))
            continue
        errors = lib.validate(data, schemas[CHECKABLE_ACTION_SCHEMA])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "pacing for the skills it names leaves its actions out"
                        % (CHECKABLE_ACTION_SCHEMA, len(errors)))
            continue
        for action in data["actions"]:
            out.append((path, action))
    return files, out


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
                    "actions exist but no file is a valid %s curve%s"
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


def xp_per_hour(action):
    return action["xp"] * 3600.0 / action["seconds"]


def best_action(actions, level):
    """The (path, action) with the highest XP per hour unlocked at level.
    Ties go to the lower id, so the result never depends on file order."""
    unlocked = [pa for pa in actions if pa[1]["level_required"] <= level]
    if not unlocked:
        return None
    return min(unlocked, key=lambda pa: (-xp_per_hour(pa[1]), pa[1]["id"]))


def _spans(used):
    """[(action_id, first_level, last_level)] from a per-level list of ids."""
    spans = []
    for level, ident in used:
        if spans and spans[-1][0] == ident and spans[-1][2] == level - 1:
            spans[-1][2] = level
        else:
            spans.append([ident, level, level])
    return ", ".join("%s (levels %s)" % (i, a if a == b else "%d-%d" % (a, b))
                     for i, a, b in spans)


def check_band(report, skill, actions, start, end, inputs):
    hours_per_day, reference_xph, costs, targets = inputs
    label = "skill %s band %d to %d" % (skill, start, end)
    own = [pa for pa in actions if start <= pa[1]["level_required"] < end]
    if not own:
        report.note("%s: no actions unlocked inside the band; not checked" % label)
        return
    if best_action(actions, start) is None:
        lowest = min(pa[1]["level_required"] for pa in actions)
        paths = ", ".join(sorted(set(pa[0] for pa in own)))
        report.warn("band-uncovered", paths,
                    "%s: has actions, but none is unlocked at level %d (lowest "
                    "level_required for the skill is %d); not checked"
                    % (label, start, lowest))
        return

    hours = 0.0
    band_xp = 0
    used, paths = [], set()
    for level in range(start, end):
        path, action = best_action(actions, level)
        hours += costs[level] / xp_per_hour(action)
        band_xp += costs[level]
        used.append((level, action["id"]))
        paths.add(path)
    days = hours / hours_per_day
    multiple = (band_xp / hours) / reference_xph
    target = targets.get(band_key(start, end))
    target_text = ("%sx" % target) if target is not None else "none stated"
    summary = ("%s: %.2f days, effective rate %.2fx the reference (curve target %s); "
               "best actions: %s" % (label, days, multiple, target_text, _spans(used)))
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
    if not actions:
        report.note("%d action file(s), 0 checkable actions; nothing to check" % files)
        return report

    path, curve = load_curve(report, root, schemas)
    if curve is None:
        return report
    inputs = curve_inputs(report, path, curve)
    if inputs is None:
        return report

    by_skill = {}
    for pa in actions:
        by_skill.setdefault(pa[1]["skill"], []).append(pa)
    report.note("%d action file(s), %d checkable actions, %d skill(s); curve %s, "
                "%.2f band-skill hours a day"
                % (files, len(actions), len(by_skill), path, inputs[0]))
    for skill in sorted(by_skill):
        for start, end in ZONE_BANDS:
            check_band(report, skill, by_skill[skill], start, end, inputs)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
