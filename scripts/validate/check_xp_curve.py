"""Check: XP curve (work order 002, scope item 3).

For every content file whose schema is tuning.xp_curve/*:

- only tuning.xp_curve/1 is checkable, and the file must match that schema;
- the table runs from level 1 to level 100 with no gaps, level 1 has total_xp 0;
- total_xp rises strictly, and total_xp + cost_to_next equals the next row's
  total_xp (level 100's cost_to_next is null);
- cost_to_next never falls from one level to the next;
- recomputing the table from formula.constants reproduces it exactly;
- band_checkpoints match what the table and band_xp_rate_targets give, within
  rounding (half a unit in the last decimal place the file states);
- each zone band's days at its own rate are within BAND_DAYS_TOLERANCE of
  TARGET_BAND_DAYS (tolerance unset: see the open question), and level 70 is
  not reachable in LEVEL_70_FLOOR_DAYS days or fewer.

Usage: python3 scripts/validate/check_xp_curve.py [--root DIR]
"""

import math
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402

CHECK = "xp_curve"

SCHEMA_PREFIX = "tuning.xp_curve/"
CHECKABLE_SCHEMA = "tuning.xp_curve/1"

MAX_LEVEL = 100  # GDD section 6: "Sixteen skills, each levelled 1 to 100".

# GDD section 6, combat table: Rustmoor 1 to 20, Cinderworks 20 to 45,
# Thunderhead 45 to 70.
ZONE_BANDS = ((1, 20), (20, 45), (45, 70))

# GDD section 6 and docs/targets.md: about two weeks per zone.
TARGET_BAND_DAYS = 14

# How far, in days, each band's own days at its own rate may fall from
# TARGET_BAND_DAYS. Set by Jeremy in answer to work order 002. If this is ever
# set back to None, the comparison is reported as WARN lines, not enforced.
BAND_DAYS_TOLERANCE = 2

# Work order 001, Constraints: "A curve that makes level 70 reachable in nine
# days is a failure". Encoded as: elapsed days to level 70 <= 9 fails.
LEVEL_70_FLOOR_DAYS = 9


def round_half_up(value):
    """The table's rounding rule: halves round up (all costs are positive)."""
    return int(math.floor(value + 0.5))


def level_cost(constants, level):
    base = constants["base"]
    ratio = constants["ratio"]
    opening_end = constants["opening_end"]
    opening_power = constants["opening_power"]
    ramp = min(1.0, (level / opening_end) ** opening_power)
    return round_half_up(base * ratio ** (level - 1) * ramp)


def recompute(constants):
    """{level: (cost_to_next, total_xp)} for levels 1..MAX_LEVEL."""
    out = {}
    total = 0
    for level in range(1, MAX_LEVEL):
        cost = level_cost(constants, level)
        out[level] = (cost, total)
        total += cost
    out[MAX_LEVEL] = (None, total)
    return out


def rounding_tolerance(stated):
    """Half a unit in the last decimal place the stated number shows."""
    if isinstance(stated, int):
        return 0.5
    text = repr(float(stated))
    if "e" in text or "E" in text:
        return 0.0
    decimals = len(text.split(".")[1]) if "." in text else 0
    return 0.5 * 10 ** (-decimals) + 1e-9


def band_key(start, end):
    return "band_%d_to_%d" % (start, end)


def check_file(report, path, data, schema):
    ident = data.get("id") if isinstance(data, dict) else None
    declared = data.get("schema") if isinstance(data, dict) else None
    if declared != CHECKABLE_SCHEMA:
        report.fail("not-checkable", path,
                    "schema is %r; only %s can be checked" % (declared, CHECKABLE_SCHEMA),
                    ident)
        return
    shape_errors = lib.validate(data, schema)
    if shape_errors:
        report.fail("not-checkable", path,
                    "file does not match %s (%d errors; see the schema check)"
                    % (CHECKABLE_SCHEMA, len(shape_errors)), ident)
        return

    table = data["table"]
    rows_by_level = {}
    for row in table:
        rows_by_level.setdefault(row["level"], row)

    # Coverage: 1..100, in order, no gaps, no duplicates.
    levels = [row["level"] for row in table]
    expected = list(range(1, MAX_LEVEL + 1))
    if levels != expected:
        missing = sorted(set(expected) - set(levels))
        extra = sorted(set(levels) - set(expected))
        dupes = sorted(set(l for l in levels if levels.count(l) > 1))
        parts = []
        if missing:
            parts.append("missing levels %s" % _ranges(missing))
        if extra:
            parts.append("unexpected levels %s" % _ranges(extra))
        if dupes:
            parts.append("repeated levels %s" % _ranges(dupes))
        if not parts:
            parts.append("levels are out of order")
        report.fail("table-levels", path,
                    "table must run 1 to %d with no gaps: %s"
                    % (MAX_LEVEL, "; ".join(parts)), ident)

    if 1 in rows_by_level and rows_by_level[1]["total_xp"] != 0:
        report.fail("level-1-total", path,
                    "level 1 total_xp is %s; must be 0" % rows_by_level[1]["total_xp"],
                    ident)

    # Row-to-row arithmetic, in the order the file gives.
    not_rising, not_summing, falling, null_cost = [], [], [], []
    for index, row in enumerate(table):
        nxt = table[index + 1] if index + 1 < len(table) else None
        cost = row["cost_to_next"]
        if nxt is None:
            if cost is not None:
                null_cost.append("level %s (last row) has cost_to_next %s; must be null"
                                 % (row["level"], cost))
            continue
        if cost is None:
            null_cost.append("level %s has a null cost_to_next but is not the last row"
                             % row["level"])
        if nxt["total_xp"] <= row["total_xp"]:
            not_rising.append(nxt["level"])
        if cost is not None and row["total_xp"] + cost != nxt["total_xp"]:
            not_summing.append(row["level"])
        nxt_cost = nxt["cost_to_next"]
        nxt_is_last = index + 2 == len(table)  # its cost belongs to cost-null
        if (not nxt_is_last and cost is not None and nxt_cost is not None
                and nxt_cost < cost):
            falling.append(nxt["level"])
    if not_rising:
        report.fail("total-not-rising", path,
                    "total_xp does not rise strictly at levels %s" % _ranges(not_rising),
                    ident)
    if not_summing:
        report.fail("total-not-summing", path,
                    "total_xp + cost_to_next != next total_xp at levels %s"
                    % _ranges(not_summing), ident)
    if falling:
        report.fail("cost-falls", path,
                    "cost_to_next falls at levels %s" % _ranges(falling), ident)
    for message in null_cost:
        report.fail("cost-null", path, message, ident)

    # Recompute from the constants.
    constants = data["formula"]["constants"]
    computed = recompute(constants)
    cost_diff, total_diff = [], []
    for level in range(1, MAX_LEVEL + 1):
        row = rows_by_level.get(level)
        if row is None:
            continue
        want_cost, want_total = computed[level]
        if level < MAX_LEVEL and row["cost_to_next"] != want_cost:
            cost_diff.append((level, row["cost_to_next"], want_cost))
        if row["total_xp"] != want_total:
            total_diff.append((level, row["total_xp"], want_total))
    for field, diffs in (("cost_to_next", cost_diff), ("total_xp", total_diff)):
        if diffs:
            level, stated, want = diffs[0]
            report.fail("recompute-mismatch", path,
                        "%s differs from formula.constants at levels %s; first: level %d "
                        "states %s, formula gives %s"
                        % (field, _ranges([d[0] for d in diffs]), level, stated, want),
                        ident)

    # Band arithmetic, computed from the table and the rate targets.
    checkpoints_block = data["band_checkpoints"]
    xp_per_day = checkpoints_block["main_skill_xp_per_day_at_reference_rate"]
    targets = data["band_xp_rate_targets"]
    expected_keys = set(band_key(a, b) for a, b in ZONE_BANDS)
    stated_keys = set(k for k in targets if k != "_note")
    for key in sorted(expected_keys - stated_keys):
        report.fail("rate-target-missing", path,
                    "band_xp_rate_targets has no %r" % key, ident)
    for key in sorted(stated_keys - expected_keys):
        report.fail("rate-target-unexpected", path,
                    "band_xp_rate_targets has %r, which is not a GDD section 6 zone band"
                    % key, ident)

    computed_bands = []  # (start, end, total, band_xp, rate, days, elapsed)
    elapsed = 0.0
    complete = True
    for start, end in ZONE_BANDS:
        key = band_key(start, end)
        if start not in rows_by_level or end not in rows_by_level or key not in targets:
            complete = False
            break
        total = rows_by_level[end]["total_xp"]
        band_xp = total - rows_by_level[start]["total_xp"]
        rate = targets[key]
        days = band_xp / (xp_per_day * rate)
        elapsed += days
        computed_bands.append((start, end, total, band_xp, rate, days, elapsed))

    checkpoints = checkpoints_block["checkpoints"]
    stated_levels = [cp["level"] for cp in checkpoints]
    wanted_levels = [end for _start, end in ZONE_BANDS]
    if stated_levels != wanted_levels:
        report.fail("checkpoint-levels", path,
                    "checkpoints are at levels %s; GDD section 6 bands end at %s"
                    % (stated_levels, wanted_levels), ident)

    if complete:
        for start, end, total, band_xp, rate, days, run_elapsed in computed_bands:
            cp = next((c for c in checkpoints if c["level"] == end), None)
            if cp is None:
                continue
            label = "checkpoint level %d" % end
            _exact(report, path, ident, label, "band", cp["band"], "%d to %d" % (start, end))
            _exact(report, path, ident, label, "total_xp", cp["total_xp"], total)
            _exact(report, path, ident, label, "band_xp", cp["band_xp"], band_xp)
            _near(report, path, ident, label, "band_rate_multiplier",
                  cp["band_rate_multiplier"], rate)
            _near(report, path, ident, label, "band_days_at_own_rate",
                  cp["band_days_at_own_rate"], days)
            _near(report, path, ident, label, "gap_days",
                  cp["gap_days"], days - cp["target_band_days"])
            _near(report, path, ident, label, "elapsed_days", cp["elapsed_days"], run_elapsed)
            _near(report, path, ident, label, "gap_elapsed_days",
                  cp["gap_elapsed_days"], run_elapsed - cp["target_elapsed_days"])
            _near(report, path, ident, label, "elapsed_days_if_held_at_reference_rate",
                  cp["elapsed_days_if_held_at_reference_rate"], total / xp_per_day)

        # Band length against two weeks.
        for start, end, _total, _bxp, _rate, days, _el in computed_bands:
            if BAND_DAYS_TOLERANCE is None:
                report.warn("band-tolerance-unset", path,
                            "band %d to %d takes %.2f days at its own rate; not compared "
                            "with %d days because BAND_DAYS_TOLERANCE is unset"
                            % (start, end, days, TARGET_BAND_DAYS), ident)
            elif abs(days - TARGET_BAND_DAYS) > BAND_DAYS_TOLERANCE:
                report.fail("band-days", path,
                            "band %d to %d takes %.2f days at its own rate; must be within "
                            "%s of %d"
                            % (start, end, days, BAND_DAYS_TOLERANCE, TARGET_BAND_DAYS),
                            ident)

        days_to_70 = next(el for s, e, _t, _b, _r, _d, el in computed_bands if e == 70)
        if days_to_70 <= LEVEL_70_FLOOR_DAYS:
            report.fail("level-70-too-fast", path,
                        "level 70 is reachable in %.2f days; %d days or fewer is a failure "
                        "(work order 001)" % (days_to_70, LEVEL_70_FLOOR_DAYS), ident)
    else:
        report.fail("bands-not-computable", path,
                    "cannot compute band days: the table or band_xp_rate_targets lacks a "
                    "zone band's levels or rate", ident)


def _exact(report, path, ident, label, field, stated, want):
    if stated != want:
        report.fail("checkpoint-mismatch", path,
                    "%s %s states %s; table gives %s" % (label, field, stated, want), ident)


def _near(report, path, ident, label, field, stated, want):
    if abs(stated - want) > rounding_tolerance(stated):
        report.fail("checkpoint-mismatch", path,
                    "%s %s states %s; table and rate targets give %.4f"
                    % (label, field, stated, want), ident)


def _ranges(levels):
    levels = sorted(set(levels))
    spans = []
    for level in levels:
        if spans and level == spans[-1][1] + 1:
            spans[-1][1] = level
        else:
            spans.append([level, level])
    return ", ".join(str(a) if a == b else "%d-%d" % (a, b) for a, b in spans)


def run(root):
    report = lib.Report(CHECK)
    schema = lib.load_schemas("content")[CHECKABLE_SCHEMA]
    found = 0
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error or not isinstance(data, dict):
            continue  # the schema check reports unparseable files
        declared = data.get("schema")
        if isinstance(declared, str) and declared.startswith(SCHEMA_PREFIX):
            found += 1
            check_file(report, path, data, schema)
    report.note("%d tuning.xp_curve file(s) examined" % found)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
