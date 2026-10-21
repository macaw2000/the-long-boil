"""Regenerates the committed fixtures under scripts/validate/fixtures/.

The curves here use synthetic constants on purpose, so no fixture copies the
real content. After regenerating, refresh each fail fixture's expected.txt
with:  python3 scripts/validate/run.py --refresh-expected
and read the diff before committing it.

Usage: python3 scripts/validate/make_fixtures.py
"""
import json, math, os, sys
F = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
def rhu(x): return int(math.floor(x + 0.5))
def curve(ident, base=2000, ratio=1.04, end=5, power=2, rates=(0.71, 2.5, 6.7), xpd=5000):
    c = dict(base=base, ratio=ratio, opening_end=end, opening_power=power)
    table, tot = [], 0
    for L in range(1, 100):
        cost = rhu(base * ratio ** (L - 1) * min(1.0, (L / end) ** power))
        table.append(dict(level=L, cost_to_next=cost, total_xp=tot)); tot += cost
    table.append(dict(level=100, cost_to_next=None, total_xp=tot))
    T = {r["level"]: r["total_xp"] for r in table}
    cps, el = [], 0.0
    for (a, b), m in zip(((1, 20), (20, 45), (45, 70)), rates):
        bx = T[b] - T[a]; days = bx / (xpd * m); el += days; tgt = 14 * len(cps) + 14
        cps.append(dict(level=b, total_xp=T[b], band="%d to %d" % (a, b), band_xp=bx,
            band_rate_multiplier=m, band_days_at_own_rate=round(days, 2), target_band_days=14,
            gap_days=round(days - 14, 2), elapsed_days=round(el, 2), target_elapsed_days=tgt,
            gap_elapsed_days=round(el - tgt, 2),
            elapsed_days_if_held_at_reference_rate=round(T[b] / xpd, 1)))
    return {
        "schema": "tuning.xp_curve/1", "id": ident, "revision": 1,
        "source": "Validator fixture. Not game content.",
        "applies_to": "Validator fixture.",
        "assumptions": {"_note": "Fixture values.", "CHECKINS_PER_DAY": 3},
        "formula": {"shape": "fixture hybrid", "level_cost": "cost(L) = round_half_up(base * ratio^(L-1) * min(1, (L/opening_end)^opening_power))",
                    "total_xp": "sum of cost(k) for k < L", "join": "fixture", "constants": c,
                    "derived": True, "_derivation": "Fixture constants, chosen to differ from the real curve."},
        "reference_action": {"id": ident + "_ref", "action": "fixture action", "skill": "smithing",
                             "xp": 10, "seconds_per_action": 60, "purpose": "Fixture.", "derived": True},
        "band_checkpoints": {"main_skill_xp_per_day_at_reference_rate": xpd, "checkpoints": cps},
        "band_xp_rate_targets": {"band_1_to_20": rates[0], "band_20_to_45": rates[1], "band_45_to_70": rates[2]},
        "day2_check": {"noncombat_xp_each": 1, "noncombat_level_each": 1, "main_combat_xp": 1, "main_combat_level": 1,
                       "other_combat_xp_each": 1, "other_combat_level_each": 1, "untouched_skills_at_level_1": 6,
                       "total_level_at_48h": 16, "passes_50": False},
        "day7_check": {"main_combat_level_at_day_7": 5.0, "gap_levels": -7.0},
        "table": table,
    }
def row(ident, path, pointer=None, result="pass", waiver=None, revision=1):
    return {"id": ident, "type": "tuning", "path": path, "status": "drafted", "drafted_by": "draftsman",
            "model": None, "patch": None, "revision": revision, "work_order": "docs/work-orders/002-validators.md",
            "pointer": pointer,
            "validators": {"result": result, "run": "2026-10-21T22:00:00Z" if result in ("pass", "fail") else None,
                           "checks": ["schema", "provenance"] if result in ("pass", "fail") else None, "waiver": waiver},
            "review": None, "approved_by": None, "approved_at": None,
            "history": [{"at": "2026-10-21T22:00:00Z", "status": "drafted", "by": "draftsman"}]}
def put(rel, obj):
    p = os.path.join(F, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as fh:
        if isinstance(obj, str): fh.write(obj)
        else: json.dump(obj, fh, indent=1); fh.write("\n")
W = {"by": "docs/work-orders/001-xp-curve.md", "reason": "Fixture waiver."}
CP = "content/tuning/curve.json"

# ---- schema
put("schema/pass/" + CP, curve("fixture.pass.xp_curve"))
put("schema/pass/content/provenance.json", {"schema": "provenance/2", "rows": [
    row("fixture.pass.xp_curve", CP), row("fixture.pass.xp_curve_ref", CP, "/reference_action")]})
put("schema/fail/content/tuning/broken.json", "{ \"schema\": \"tuning.xp_curve/1\", \n")
put("schema/fail/content/tuning/no-schema.json", {"id": "fixture.fail.no_schema"})
put("schema/fail/content/tuning/old.json", {"schema": "tuning.xp_curve/0", "id": "fixture.fail.old"})
put("schema/fail/content/tuning/unknown.json", {"schema": "monster/9", "id": "fixture.fail.unknown", "parts": [{"id": 7}]})
s = curve("fixture.fail.shape"); s["status"] = "drafted"; s["validators"] = "none"
s["formula"]["BASE"] = s["formula"]["constants"].pop("base")
put("schema/fail/content/tuning/shape.json", s)
d = curve("fixture.fail.shape"); d["reference_action"]["id"] = "fixture.fail.old"
put("schema/fail/content/tuning/dupe.json", d)
put("schema/fail/content/provenance.json", "{ \"schema\": \"provenance/2\", \"rows\": [ \n")

# ---- provenance
put("provenance/pass/" + CP, curve("fixture.pass.xp_curve"))
put("provenance/pass/content/provenance.json", {"schema": "provenance/2", "rows": [
    row("fixture.pass.xp_curve", CP, result="waived", waiver=W),
    row("fixture.pass.xp_curve_ref", CP, "/reference_action")]})
put("provenance/fail/" + CP, curve("fixture.fail.curve"))
put("provenance/fail/content/tuning/orphan.json", {"schema": "tuning.xp_curve/1", "id": "fixture.fail.orphan", "revision": 1})
put("provenance/fail/content/tuning/twice.json", {"schema": "tuning.xp_curve/1", "id": "fixture.fail.twice", "revision": 1})
put("provenance/fail/content/provenance.json", {"schema": "provenance/2", "rows": [
    row("fixture.fail.curve", CP, result="skipped"),
    row("fixture.fail.curve_ref", CP, "/nowhere", result="waived"),
    row("fixture.fail.twice", "content/tuning/twice.json", result="pass", waiver=W),
    row("fixture.fail.twice", "content/tuning/twice.json"),
    row("fixture.fail.ghost", "content/tuning/missing.json"),
    row("fixture.fail.revised", "content/tuning/revised.json", revision=2),
    row("fixture.fail.revised_part", "content/tuning/revised.json", "/part", revision=3)]})
put("provenance/fail/content/tuning/revised.json", {"schema": "tuning.xp_curve/1", "id": "fixture.fail.revised",
    "revision": 3, "part": {"id": "fixture.fail.revised_part", "revision": 5}})

# ---- xp_curve
put("xp_curve/pass/" + CP, curve("fixture.pass.xp_curve"))
X = "xp_curve/fail/content/tuning/"
put(X + "old.json", {"schema": "tuning.xp_curve/0", "id": "fixture.fail.old"})
s = curve("fixture.fail.shape"); del s["table"]; put(X + "shape.json", s)
g = curve("fixture.fail.gaps"); g["table"] = [r for r in g["table"] if r["level"] != 45]; g["table"][0]["total_xp"] = 5
put(X + "gaps.json", g)
put(X + "falls.json", curve("fixture.fail.falls", ratio=0.99, rates=(0.5, 0.5, 0.5)))
t = curve("fixture.fail.sum"); t["table"][29]["total_xp"] = t["table"][28]["total_xp"]; t["table"][99]["cost_to_next"] = 5
put(X + "sum.json", t)
r = curve("fixture.fail.recompute"); r["formula"]["constants"]["base"] = 2001; put(X + "recompute.json", r)
c = curve("fixture.fail.checkpoint"); cp = c["band_checkpoints"]["checkpoints"]
cp[0]["band_days_at_own_rate"] = 99.0; cp[0]["band_rate_multiplier"] = 2.0; cp[1]["band"] = "21 to 45"; cp[1]["total_xp"] = 1; c["band_xp_rate_targets"]["band_70_to_100"] = 9.0
del cp[2]; put(X + "checkpoint.json", c)
put(X + "slow.json", curve("fixture.fail.slow", rates=(0.5, 2.5, 6.7)))
put(X + "fast.json", curve("fixture.fail.fast", rates=(10.0, 30.0, 80.0)))
