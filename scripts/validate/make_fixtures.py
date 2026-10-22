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
def curve(ident, base=2000, ratio=1.04, end=5, power=2, rates=(0.71, 2.5, 6.7), xpd=5000, assumptions=None):
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
        "assumptions": assumptions or {"_note": "Fixture values.", "CHECKINS_PER_DAY": 3},
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
def row(ident, path, pointer=None, result="pass", waiver=None, revision=1, kind="tuning"):
    return {"id": ident, "type": kind, "path": path, "status": "drafted", "drafted_by": "draftsman",
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
    row("fixture.fail.revised_part", "content/tuning/revised.json", "/part", revision=3),
    dict(row("fixture.fail.newline_run", CP, "/formula"),
         validators={"result": "pass", "run": "2026-10-21T22:00:00Z\n", "checks": ["schema"], "waiver": None})]})
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

# ---- work order 003: items and actions
# Fixture item and action files. Zone "global" (a permitted zone) with names
# prefixed fixture_, so no fixture copies real content. Numbers are synthetic and set against the fixture curve above.
def items(*entries, schema="item/1"):
    return {"schema": schema, "items": [dict(id=i, name=n, flavour=f) for i, n, f in entries]}
def act(ident, skill, level, seconds, xp, inputs=(), outputs=()):
    return dict(id=ident, skill=skill, level_required=level, seconds=seconds, xp=xp,
                inputs=[dict(item=i, qty=q) for i, q in inputs],
                outputs=[dict(item=i, qty=q) for i, q in outputs])
def actions(*entries, schema="action/1"):
    return {"schema": schema, "actions": list(entries)}
ORE, INGOT = "item.global.fixture_copper_ore", "item.global.fixture_brass_ingot"
GOOD_ITEMS = items((ORE, "Copper Ore", "Fixture ore, dug for a validator."),
                   (INGOT, "Brass Ingot", "Fixture ingot, smelted for a validator."))
GOOD_ACTIONS = actions(act("action.global.fixture_dig_ore", "prospecting", 1, 54, 10, outputs=[(ORE, 1)]),
                       act("action.global.fixture_smelt_ingot", "smithing", 1, 54, 10, [(ORE, 2)], [(INGOT, 1)]))
IP, AP = "content/items/fixture.json", "content/actions/fixture.json"

# schema: item/1 and action/1 accepted where they belong, refused elsewhere.
put("schema/pass/" + IP, GOOD_ITEMS)
put("schema/pass/" + AP, GOOD_ACTIONS)
S = "schema/fail/content/"
put(S + "items/bad.json", {"schema": "item/1", "price": 5, "items": [
    dict(id="items.fixture.bad_prefix", name="Bad Prefix", flavour="Fine."),
    dict(id="item.global.fixture_long_flavour", name="Long Flavour",
         flavour="one two three four five six seven eight nine ten eleven twelve thirteen "
                 "fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone"),
    dict(id="item.global.fixture_two_lines", name="Two Lines", flavour="First line.\nSecond line."),
    dict(id="item.global.fixture_trailing_newline", name="Trailing\n", flavour="Ends in a newline.\n"),
    dict(id="item.global.fixture_no_name", flavour="No name.", stats={"hp": 1}),
    dict(id="item.fixture.unknown_zone", name="Unknown Zone", flavour="Zone not on the list.")]})
put(S + "actions/bad.json", {"schema": "action/1", "actions": [
    act("action.global.fixture_bad_skill", "alchemy", 1, 10, 1),
    act("action.global.fixture_dashed_skill", "tea-blending", 1, 10, 1),
    act("action.global.fixture_level_zero", "smithing", 0, 10, 1),
    act("action.global.fixture_level_high", "smithing", 101, 10, 1),
    act("action.global.fixture_level_fraction", "smithing", 2.5, 10, 1),
    act("action.global.fixture_no_time", "smithing", 1, 0, 1),
    act("action.global.fixture_negative_xp", "smithing", 1, 10, -1),
    act("action.global.fixture_zero_qty", "smithing", 1, 10, 1, [(ORE, 0)]),
    act("action.global.fixture_bad_ref", "smithing", 1, 10, 1, outputs=[("action.global.fixture_bad_skill", 1)]),
    act("action.global.fixture_combat", "melee", 1, 10, 1),
    act("action.global.fixture_combat_2", "aetherics", 1, 10, 1),
    act("action.foundry.fixture_unknown_zone", "smithing", 1, 10, 1, [("item.foundry.fixture_ore", 1)]),
    dict(id="action.Fixture.bad_id", skill="smithing", level_required=1, seconds=10, xp=1,
         inputs=[{"item": ORE}], outputs=None, crowns=3)]})
put(S + "actions/misplaced.json", items(("item.global.fixture_misplaced", "Misplaced", "Item file in the actions directory.")))
put(S + "tuning/stray.json", actions(act("action.global.fixture_stray", "smithing", 1, 10, 1)))

# provenance: item and action rows with pointers pass; an item with no row fails.
put("provenance/pass/" + IP, GOOD_ITEMS)
put("provenance/pass/" + AP, GOOD_ACTIONS)
put("provenance/pass/content/provenance.json", {"schema": "provenance/2", "rows": [
    row("fixture.pass.xp_curve", CP, result="waived", waiver=W),
    row("fixture.pass.xp_curve_ref", CP, "/reference_action"),
    row(ORE, IP, "/items/0", revision=None, kind="item"),
    row(INGOT, IP, "/items/1", revision=None, kind="item"),
    row("action.global.fixture_dig_ore", AP, "/actions/0", revision=None, kind="action"),
    row("action.global.fixture_smelt_ingot", AP, "/actions/1", revision=None, kind="action")]})
put("provenance/fail/content/items/orphan.json",
    items(("item.global.fixture_orphan", "Orphan", "An item with no register row.")))

# references: every named item exists under content/items/.
put("references/pass/" + IP, GOOD_ITEMS)
put("references/pass/" + AP, GOOD_ACTIONS)
R = "references/fail/content/"
put(R + "items/fixture.json", GOOD_ITEMS)
put(R + "tuning/stray-items.json", items(("item.global.fixture_stray", "Stray", "Defined outside content/items/.")))
put(R + "actions/fixture.json", actions(
    act("action.global.fixture_ok", "smithing", 1, 54, 10, [(ORE, 2)], [(INGOT, 1)]),
    act("action.global.fixture_ghost_input", "smithing", 1, 54, 10, [("item.global.fixture_ghost", 1)], [(INGOT, 1)]),
    act("action.global.fixture_stray_output", "tinkering", 1, 54, 10, [(INGOT, 1)], [("item.global.fixture_stray", 1)]),
    act("action.global.fixture_action_as_item", "tinkering", 1, 54, 10, [("action.global.fixture_ok", 1)])))

# pacing: fixture curve (band XP 49,482 / 175,485 / 467,809) with fixture
# assumptions of 10 h a day at a 0.5 share, so 5 band-skill hours a day,
# deliberately not the real curve's 12 x 0.70.
PA = {"_note": "Fixture values.", "BAND_SKILL_QUEUE_HOURS_PER_DAY": 10, "MAIN_COMBAT_SKILL_SHARE": 0.5}
PC = curve("fixture.pacing.curve", assumptions=PA)
put("pacing/pass/" + CP, PC)
put("pacing/pass/" + AP, actions(
    # smithing: band 1 climbs from slightly under to over the reference, band 2
    # has its own action at level 20, band 3 has none (NOTE).
    act("action.global.fixture_smelt_a", "smithing", 1, 54, 9.5),
    act("action.global.fixture_smelt_b", "smithing", 12, 54, 11.5),
    act("action.global.fixture_smelt_c", "smithing", 20, 54, 37.6),
    # prospecting: one level-1 action across band 1.
    act("action.global.fixture_dig_a", "prospecting", 1, 60, 11.8)))
put("pacing/fail/" + CP, PC)
put("pacing/fail/" + AP, actions(
    act("action.global.fixture_slow", "smithing", 1, 54, 5),                 # about 28 days
    act("action.global.fixture_fast", "tinkering", 1, 54, 30),               # about 5 days
    act("action.global.fixture_late_start", "tailoring", 3, 54, 10),         # band 1: WARN
    act("action.global.fixture_cook_a", "cooking", 1, 54, 10.6),             # band 1 passes
    act("action.global.fixture_cook_b", "cooking", 30, 54, 50)))             # band 2 too slow: 20-29 on cook_a
put("pacing/fail/content/actions/broken.json", actions(act("action.global.fixture_broken", "smithing", 0, 54, 10)))
put("pacing/fail/content/actions/future.json", actions(act("action.global.fixture_future", "smithing", 1, 54, 10), schema="action/2"))
put("pacing/fail-no-curve/" + AP, actions(act("action.global.fixture_no_curve", "smithing", 1, 54, 10)))
put("pacing/fail-assumptions/" + CP, curve("fixture.pacing.curve",
    assumptions={"_note": "Fixture values.", "BAND_SKILL_QUEUE_HOURS_PER_DAY": 0}))
put("pacing/fail-assumptions/" + AP, actions(act("action.global.fixture_no_rate", "smithing", 1, 54, 10)))
put("pacing/fail-many-curves/" + CP, PC)
put("pacing/fail-many-curves/content/tuning/curve-2.json", curve("fixture.pacing.curve_2", assumptions=PA))
put("pacing/fail-many-curves/" + AP, actions(act("action.global.fixture_two_curves", "smithing", 1, 54, 10)))

# Q8: "$" means end of string (ECMA-262), so a trailing newline is refused.
n = curve("fixture.fail.newline\n"); n["reference_action"]["id"] = "fixture.fail.newline_ref"
put("schema/fail/content/tuning/newline.json", n)
