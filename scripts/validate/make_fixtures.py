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

# ---- work order 005: monsters and combat pacing
# Zone "global" with names prefixed fixture_, so no fixture copies real
# content. Numbers are synthetic and set against the fixture pacing curve PC
# (5 band-skill hours a day, reference 600 XP/h).
def mon(ident, level, xp, seconds, boss=False, weakness="melee", name=None, flavour="Fixture monster, kept for a validator."):
    return dict(id=ident, name=name or ident.rsplit(".", 1)[1].replace("_", " ").title(), flavour=flavour,
                level=level, boss=boss, weakness=weakness, xp=xp, seconds_per_kill=seconds)
def monsters(*entries, schema="monster/1"):
    return {"schema": schema, "monsters": list(entries)}
MP = "content/monsters/fixture.json"

# schema: monster/1 accepted under content/monsters/, refused elsewhere.
put("schema/pass/" + MP, monsters(
    mon("monster.global.fixture_rat", 1, 6, 36),
    mon("monster.global.fixture_gull", 8, 8, 36, weakness="marksmanship"),
    mon("monster.global.fixture_jaw", 15, 400, 300, boss=True, weakness="aetherics")))
put(S + "monsters/bad.json", {"schema": "monster/1", "drops": [], "monsters": [
    mon("monsters.global.fixture_bad_prefix", 1, 1, 10),
    mon("monster.foundry.fixture_unknown_zone", 1, 1, 10),
    mon("monster.global.fixture_long_flavour", 1, 1, 10,
        flavour="one two three four five six seven eight nine ten eleven twelve thirteen "
                "fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone"),
    mon("monster.global.fixture_two_lines", 1, 1, 10, flavour="First line.\nSecond line."),
    mon("monster.global.fixture_level_zero", 0, 1, 10),
    mon("monster.global.fixture_level_high", 101, 1, 10),
    mon("monster.global.fixture_level_fraction", 2.5, 1, 10),
    mon("monster.global.fixture_boss_string", 1, 1, 10, boss="yes"),
    mon("monster.global.fixture_bad_weakness", 1, 1, 10, weakness="pressure"),
    mon("monster.global.fixture_capital_weakness", 1, 1, 10, weakness="Melee"),
    mon("monster.global.fixture_zero_xp", 1, 0, 10),
    mon("monster.global.fixture_negative_time", 1, 1, -5),
    dict(mon("monster.global.fixture_hit_points", 1, 1, 10), hp=12),
    {k: v for k, v in mon("monster.global.fixture_no_time", 1, 1, 10).items() if k != "seconds_per_kill"}]})
put(S + "monsters/misplaced.json", items(("item.global.fixture_misplaced_in_monsters", "Misplaced", "Item file in the monsters directory.")))
put(S + "tuning/stray-monsters.json", monsters(mon("monster.global.fixture_stray", 1, 1, 10)))

# pacing pass: band 1 climbs from slightly under the reference (600 XP/h) to
# slightly over; band 2 has its own monster at level 20; band 3 has none
# (NOTE). The level-1 boss pays far more per hour than anything else: if
# bosses counted, band 1 would be about 2 days and fail.
put("pacing/pass/" + MP, monsters(
    mon("monster.global.fixture_rat", 1, 5.5, 36),
    mon("monster.global.fixture_big_rat", 8, 7.5, 36, weakness="marksmanship"),
    mon("monster.global.fixture_wraith", 20, 25, 36, weakness="aetherics"),
    mon("monster.global.fixture_rat_king", 1, 500, 60, boss=True)))
# pacing fail-combat: band 1 is WARN (no non-boss monster at level 1; the
# level-1 boss does not cover it); band 2 runs on the level-2 monster until 25
# and is far too slow, and a fast level-20 boss does not rescue it; a file of
# monster/2 and a file that does not match monster/1 are not-checkable.
FC = "pacing/fail-combat/"
put(FC + CP, PC)
put(FC + MP, monsters(
    mon("monster.global.fixture_late_rat", 2, 6, 36),
    mon("monster.global.fixture_slow_wraith", 25, 10, 36, weakness="aetherics"),
    mon("monster.global.fixture_first_boss", 1, 500, 60, boss=True),
    mon("monster.global.fixture_fast_boss", 20, 5000, 60, boss=True)))
put(FC + "content/monsters/future.json", monsters(mon("monster.global.fixture_future", 1, 10, 36), schema="monster/2"))
put(FC + "content/monsters/broken.json", monsters(mon("monster.global.fixture_broken", 0, 10, 36)))

# ---- work order 007: drops, zone economy, Ledger Pages, Crown faucet
# (with Jeremy's answers to its Q1, Q6, Q7, Q8, Q11 and Q12).
# Ledger Page fixtures use thunderhead and cinderworks, since the rules skip
# "global"; every name is prefixed fixture_, so no fixture copies real
# content. Numbers are synthetic; the faucet figures are set against the
# fixture pacing curve PC (10 combat hours a day, deliberately not the real 12).
def table(monster, cmin, cmax, entries=(), first_kill=()):
    return dict(monster=monster, crowns=dict(min=cmin, max=cmax),
                entries=[dict(item=i, chance=c, qty_min=a, qty_max=b) for i, c, a, b in entries],
                first_kill=list(first_kill))
def drops(ident, *tables, pity=(), schema="drops/1"):
    return {"schema": schema, "id": ident, "tables": list(tables),
            "zone_pity": [dict(item=i, kills=k) for i, k in pity]}
def econ(zone, rows, schema="tuning.economy/1", ident=None):
    return {"schema": schema, "id": ident or "tuning.%s.economy" % zone, "zone": zone,
            "items": {i: dict(bound=b, collector_price=p, collector_weekly_cap=c) for i, b, p, c in rows},
            "anchors": {"_note": "Fixture values, not game content."}}
DP = "content/drops/fixture.json"
TEP, GEP = "content/tuning/economy-thunderhead.json", "content/tuning/economy-global.json"
PAGE = ["item.thunderhead.fixture_ledger_page_%d" % n for n in range(1, 6)]
GPAGE = "item.global.fixture_ledger_page_free"
MEMO = "item.thunderhead.fixture_harpy_memo"
CLEAVER = "item.thunderhead.fixture_rat_king_cleaver"
RAT, BIG, WRAITH, MOTH, KING = ("monster.thunderhead.fixture_rat", "monster.thunderhead.fixture_big_rat",
    "monster.thunderhead.fixture_wraith", "monster.thunderhead.fixture_moth", "monster.thunderhead.fixture_rat_king")
GRUB = "monster.global.fixture_grub"
LEDGER_ITEMS = items(*([(ORE, "Copper Ore", "Fixture ore, dug for a validator."),
                        (INGOT, "Brass Ingot", "Fixture ingot, smelted for a validator."),
                        (MEMO, "Harpy Memo", "Fixture curio, chewed for a validator."),
                        (CLEAVER, "Rat King Cleaver", "Fixture boss drop, kept for a validator."),
                        (GPAGE, "Free Page", "Fixture page in the global zone, which the page rules skip.")]
                       + [(p, "Ledger Page %d" % n, "Fixture page, torn for a validator.")
                          for n, p in enumerate(PAGE, 1)]))
LEDGER_MONSTER_LIST = [
    mon(RAT, 1, 5.5, 36), mon(BIG, 8, 7.5, 36, weakness="marksmanship"),
    mon(WRAITH, 20, 25, 36, weakness="aetherics"), mon(MOTH, 30, 40, 36),
    mon(KING, 1, 500, 60, boss=True), mon(GRUB, 50, 1, 3600)]
LEDGER_MONSTERS = monsters(*LEDGER_MONSTER_LIST)
# Faucet (100 kills an hour each, 70 combat hours a week): rat 3 Crowns a kill,
# 300/h, 21,000/week, levels 1-7; big rat 5.5, 550/h, 38,500/week, levels
# 8-19; wraith 10, 1,000/h, 70,000/week, levels 20-29; moth has no table,
# levels 30-44; the global grub (level 50, 1 XP an hour) puts band 45 to 70
# in the report, but the moth still pays more XP an hour, so the moth is the
# pick there too (as in pacing) and the band reads "no drop table". Bosses,
# each on its own line: the rat king 65 Crowns per winning attempt (50 to
# 80), the global grub king 9. Collectors (thunderhead): 40 x 5 +
# 12 x 10 = 320; global: 3 x 50 = 150.
LEDGER_TABLES = [
    table(RAT, 2, 4, [(ORE, 0.5, 1, 2), (PAGE[0], 0.002, 1, 1), (PAGE[1], 0.002, 1, 1)]),
    table(BIG, 4, 7, [(PAGE[2], 0.002, 1, 1), (MEMO, 0.05, 1, 1)]),
    table(WRAITH, 10, 10, [(PAGE[3], 0.001, 1, 1)]),
    # The boss's signature item sits in first_kill beside its one page and
    # also in its entries; this passes.
    table(KING, 50, 80, [(INGOT, 1.0, 1, 3), (CLEAVER, 0.05, 1, 1)], first_kill=[CLEAVER, PAGE[4]])]
# Ordered, on one shared zone timer (GDD section 5, revised): page 3 first,
# then 1, 2, 4. Page 4 sits exactly on the 1,000-kill limit.
LEDGER_PITY = [(PAGE[2], 600), (PAGE[0], 800), (PAGE[1], 900), (PAGE[3], 1000)]
LEDGER_DROPS = drops("drops.thunderhead.fixture", *LEDGER_TABLES, pity=LEDGER_PITY)
# global: the page rules do not apply, so an unbound global page that drops
# from two tables with no pity passes.
GLOBAL_DROPS = drops("drops.global.fixture",
    table(GRUB, 2, 2, [(GPAGE, 0.5, 1, 1)]),
    table("monster.global.fixture_grub_king", 9, 9, [(GPAGE, 1.0, 1, 1)], first_kill=[GPAGE]))
GLOBAL_MONSTER = mon("monster.global.fixture_grub_king", 60, 1, 3600, boss=True)
LEDGER_ECON = econ("thunderhead", [(p, True, None, None) for p in PAGE]
                   + [(MEMO, False, 40, 5), (ORE, False, None, None), (INGOT, False, 12, 10)])
# Q12: an "id" in anchors is not a content id, so this one, which repeats an
# item id, is neither a duplicate nor an id the register must hold.
GLOBAL_ECON = econ("global", [(ORE, False, 3, 50)])
GLOBAL_ECON["anchors"] = {"_note": "Fixture values.", "example": {"id": ORE}}

# schema: drops/1 under content/drops/, tuning.economy/1 under content/tuning/.
put("schema/pass/" + DP, drops("drops.global.fixture",
    table("monster.global.fixture_rat", 0, 3, [(ORE, 1, 1, 2), (INGOT, 0.01, 1, 1)]),
    table("monster.global.fixture_jaw", 40, 40, first_kill=[INGOT]), pity=[(INGOT, 200)]))
put("schema/pass/" + GEP, GLOBAL_ECON)
bad = drops("drop.global.fixture_bad",
    table("monsters.global.fixture_bad_prefix", -1, 2.5),
    table("monster.global.fixture_rat", 0, 1, [(ORE, 0, 0, 1), (INGOT, 1.5, 1, 1.5), ("action.global.fixture_x", 0.5, 1, 1)],
          first_kill=[7]),
    {"monster": "monster.global.fixture_no_max", "crowns": {"min": 0}, "entries": [], "first_kill": [],
     "pity": [{"item": ORE, "kills": 10}]}, pity=[(ORE, 0)])
put(S + "drops/bad.json", bad)
put(S + "drops/no-id.json", {"schema": "drops/1", "tables": []})
put(S + "tuning/economy-bad.json", {"schema": "tuning.economy/1", "id": "tuning.foundry.economy", "zone": "foundry",
    "price_list": [], "items": {
    ORE: dict(bound="yes", collector_price=0, collector_weekly_cap=2.5),
    INGOT: dict(bound=False, collector_price=None)}})
put(S + "tuning/economy-no-id.json", {"schema": "tuning.economy/1", "zone": "global", "items": {}, "anchors": {}})
# Q12 is narrow: "anchors" in any other schema is not exempt, so this id
# duplicates the curve's.
put(S + "tuning/anchored.json", {"schema": "monster/9", "anchors": {"id": "fixture.fail.old"}})
put(S + "tuning/stray-drops.json", drops("drops.global.fixture_stray", table("monster.global.fixture_stray_drop", 0, 0)))
put(S + "drops/misplaced.json", items(("item.global.fixture_misplaced_in_drops", "Misplaced", "Item file in the drops directory.")))
put(S + "actions/stray-economy.json", econ("global", [(ORE, False, None, None)], ident="tuning.global.economy_stray"))

# provenance: drop and economy files carry ids the register must hold; an id
# inside an economy file's anchors does not need a row.
put("provenance/pass/" + DP, drops("drops.global.fixture", table("monster.global.fixture_rat", 1, 1)))
put("provenance/pass/" + GEP, GLOBAL_ECON)
put("provenance/pass/content/provenance.json", {"schema": "provenance/2", "rows": [
    row("fixture.pass.xp_curve", CP, result="waived", waiver=W),
    row("fixture.pass.xp_curve_ref", CP, "/reference_action"),
    row(ORE, IP, "/items/0", revision=None, kind="item"),
    row(INGOT, IP, "/items/1", revision=None, kind="item"),
    row("action.global.fixture_dig_ore", AP, "/actions/0", revision=None, kind="action"),
    row("action.global.fixture_smelt_ingot", AP, "/actions/1", revision=None, kind="action"),
    row("drops.global.fixture", DP, revision=None, kind="drops"),
    row("tuning.global.economy", GEP, revision=None)]})
put("provenance/fail/" + DP, drops("drops.global.fixture_orphan", table("monster.global.fixture_rat", 1, 1)))
put("provenance/fail/" + GEP, econ("global", []))

# references: drop tables and zone_pity name monsters and items that exist;
# economy files name items that exist.
put("references/pass/" + MP, LEDGER_MONSTERS)
put("references/pass/" + DP, drops("drops.thunderhead.fixture", table(RAT, 1, 2, [(ORE, 0.5, 1, 1)]),
                                   table(KING, 9, 9, first_kill=[INGOT]), pity=[(ORE, 10)]))
put("references/pass/" + TEP, econ("thunderhead", [(ORE, False, 2, 10), (INGOT, False, None, None)]))
put(R + "monsters/fixture.json", LEDGER_MONSTERS)
put(R + "drops/fixture.json", drops("drops.thunderhead.fixture",
    table(RAT, 1, 2, [(ORE, 0.5, 1, 1)]),
    table("monster.thunderhead.fixture_ghost_monster", 1, 2),
    table("monster.global.fixture_stray_monster", 1, 2),
    table(BIG, 1, 2, [("item.thunderhead.fixture_ghost_entry", 0.5, 1, 1)]),
    table(KING, 9, 9, first_kill=["item.thunderhead.fixture_ghost_first", INGOT]),
    pity=[("item.thunderhead.fixture_ghost_pity", 10)]))
put(R + "tuning/stray-monsters.json", monsters(mon("monster.global.fixture_stray_monster", 1, 1, 10)))
put(R + "tuning/economy-thunderhead.json", econ("thunderhead", [(ORE, False, 2, 10),
    ("item.thunderhead.fixture_ghost_priced", False, 3, 1), (RAT, False, None, None)]))

# drops pass: thunderhead keeps every rule; global breaks the page rules,
# which do not apply to it. The faucet NOTE lines are pinned in
# expected-notes.txt.
put("drops/pass/" + CP, PC)
put("drops/pass/" + IP, LEDGER_ITEMS)
put("drops/pass/" + MP, monsters(*(LEDGER_MONSTER_LIST + [GLOBAL_MONSTER])))
put("drops/pass/" + DP, LEDGER_DROPS)
put("drops/pass/content/drops/global.json", GLOBAL_DROPS)
put("drops/pass/" + TEP, LEDGER_ECON)
put("drops/pass/" + GEP, GLOBAL_ECON)
# Created empty once; run.py --refresh-expected fills it. Never overwritten
# here, so regenerating keeps the pinned figures for the diff to show.
if not os.path.exists(os.path.join(F, "drops/pass/expected-notes.txt")):
    put("drops/pass/expected-notes.txt", "")

# drops fail: the drop-table, zone_pity and economy rules, on top of a zone
# that keeps the Ledger Page rules, plus files that are not checkable.
DF = "drops/fail/"
CRAB = "monster.thunderhead.fixture_crab"
put(DF + CP, PC)
put(DF + IP, LEDGER_ITEMS)
put(DF + MP, monsters(*(LEDGER_MONSTER_LIST + [mon(CRAB, 3, 6, 36)])))
put(DF + DP, drops("drops.thunderhead.fixture", *(LEDGER_TABLES + [
    table(CRAB, 5, 2, [(ORE, 0.5, 3, 1)], first_kill=[INGOT])]),
    # INGOT drops only from the boss; MEMO from no table in this file.
    pity=LEDGER_PITY + [(INGOT, 50)]))
put(DF + "content/drops/dupe.json", drops("drops.thunderhead.fixture_dupe", table(RAT, 1, 1, [(MEMO, 0.1, 1, 1)]),
                                         pity=[(MEMO, 20), (ORE, 20)]))
put(DF + "content/drops/future.json", drops("drops.global.fixture_future", table("monster.global.fixture_future", 1, 1), schema="drops/2"))
put(DF + "content/drops/broken.json", drops("drops.global.fixture_broken", table("monster.global.fixture_broken", 1, 1, [(ORE, 0, 1, 1)])))
put(DF + TEP, econ("thunderhead", [(p, True, None, None) for p in PAGE]
                  + [(MEMO, False, 40, None), (ORE, True, 5, 5), (INGOT, False, None, 10)]))
put(DF + "content/tuning/economy-thunderhead-2.json", econ("thunderhead", [], ident="tuning.cinderworks.economy"))
b = econ("cinderworks", []); del b["anchors"]
put(DF + "content/tuning/economy-broken.json", b)

# drops fail-ledger: every Ledger Page rule broken, across thunderhead,
# cinderworks and rustmoor (fixture names only).
DL = "drops/fail-ledger/"
T = ["item.thunderhead.fixture_ledger_page_t%d" % n for n in range(1, 8)]
LOOSE = "item.thunderhead.fixture_ledger_page_loose"
C = ["item.cinderworks.fixture_ledger_page_c%d" % n for n in range(1, 6)]
HARPY, GULL, BARON = ("monster.thunderhead.fixture_harpy", "monster.thunderhead.fixture_gull",
                      "monster.thunderhead.fixture_baron")
SOOT, BELLOWS = "monster.cinderworks.fixture_soot", "monster.cinderworks.fixture_bellows"
SCRAP = "monster.rustmoor.fixture_scrap_rat"
put(DL + IP, items(*[(p, "Page", "Fixture page, torn for a validator.") for p in T + [LOOSE] + C]))
put(DL + MP, monsters(mon(HARPY, 45, 90, 36), mon(GULL, 50, 90, 36), mon(BARON, 60, 900, 60, boss=True),
                      mon(SOOT, 20, 25, 36), mon(BELLOWS, 40, 900, 60, boss=True),
                      mon(SCRAP, 2, 6, 36)))
put(DL + "content/drops/thunderhead.json", drops("drops.thunderhead.fixture",
    # t1 to t3 drop from non-boss tables (3 pages, not 4); t2 has no zone_pity;
    # t3's is 1,001, one over the limit. t3 also drops from the gull (two tables). t4 is in the
    # boss's entries; the boss gives two pages on first kill, t5 and t1 (t1
    # now in two tables as well).
    table(HARPY, 1, 2, [(T[0], 0.002, 1, 1), (T[1], 0.002, 1, 1), (T[2], 0.002, 1, 1)]),
    table(GULL, 1, 2, [(T[2], 0.002, 1, 1)]),
    table(BARON, 9, 9, [(T[3], 0.01, 1, 1)], first_kill=[T[4], T[0]]),
    pity=[(T[0], 400), (T[2], 1001)]))
put(DL + "content/drops/cinderworks.json", drops("drops.cinderworks.fixture",
    # five pages drop, each with pity; the boss has no table. c1 also drops
    # in rustmoor (two zones).
    table(SOOT, 1, 2, [(p, 0.001, 1, 1) for p in C]),
    pity=[(p, 100) for p in C]))
put(DL + "content/drops/rustmoor.json", drops("drops.rustmoor.fixture",
    # rustmoor: one page (another zone's), with pity; no boss.
    table(SCRAP, 1, 2, [(C[0], 0.001, 1, 1)]), pity=[(C[0], 100)]))
put(DL + TEP, econ("thunderhead", [(T[0], True, None, None), (T[1], False, None, None),
                                   (T[2], True, 30, 1), (T[3], True, None, None), (T[5], True, None, None),
                                   (T[6], True, None, None)]))

# ---- work order 010: combat model, monster/2, gear/1, the combat check
# A synthetic model (every constant differs from content/tuning/combat.json),
# set against the fixture pacing curve PC. Monster stats are solved here, by
# this file's own arithmetic, from combat.json's solving_for_011 and boss
# target, so the check's arithmetic is not checked against itself. Zone
# "global", names prefixed fixture_, so no fixture copies real content.
CMV = dict(PLAYER_ATTACK_INTERVAL_S=2.5, BETWEEN_KILLS_S=5, KNOCKOUT_RESPAWN_S=30,
           REFERENCE_RATION_TRIGGER_HP_FRACTION=0.5, HP_BASE=500, HP_PER_VITALITY=50,
           DAMAGE_PER_STYLE_LEVEL=8, PRESSURE_DAMAGE_PER_LEVEL=0.02, HIT_CHANCE_BASE=0.7,
           HIT_CHANCE_PER_POINT=0.03, HIT_CHANCE_MIN=0.1, HIT_CHANCE_MAX=0.9,
           CRIT_CHANCE_PER_PRECISION=0.01, CRIT_CHANCE_CAP=0.4, CRIT_MULTIPLIER=2.0,
           ARMOUR_HALF_POINT=50, WEAKNESS_MULTIPLIER=1.5, REFERENCE_DAMAGE_SHARE_PER_KILL=0.3,
           BOSS_TARGET_WIN_CHANCE=0.5, BOSS_RATION_CAP_PER_ATTEMPT=2, MAIN_COMBAT_SKILL_SHARE=0.4,
           OTHER_COMBAT_SKILLS_SHARE_EACH=0.1, CALIBRATION_STEP=None, RATION_HEAL_HP=250)
def model(ident="tuning.global.fixture_combat", schema="tuning.combat/1", **override):
    v = dict(CMV, **override)
    consts = {k: {"value": x, "basis": "open" if x is None else "proposal", "note": "Fixture value."}
              for k, x in v.items() if x is not ...}
    prose = {"_note": "Fixture; the formulas are the ones tuning.combat/1 fixes."}
    return {"schema": schema, "id": ident, "revision": 1,
            "source": "Validator fixture. Not game content.", "applies_to": "Validator fixture.",
            "basis_key": {"proposal": "fixture"}, "units": {"HP_DAMAGE_SCALE": 10, "basis": "proposal"},
            "constants": consts, "skills": prose, "player_formulas": prose, "gear": prose,
            "monster_stats_shape": prose, "reference_player": prose, "weakness": prose,
            "kill_time": prose, "rations": prose, "boss": prose, "combat_xp_split": prose,
            "settled_points": [], "open_questions": []}
CM = model()
CMP = "content/tuning/combat.json"
GP = "content/gear/fixture.json"
PCT = dict((r["level"], r["total_xp"]) for r in PC["table"])
def sec_level(L):
    allowed = PCT[L] * CMV["OTHER_COMBAT_SKILLS_SHARE_EACH"] / CMV["MAIN_COMBAT_SKILL_SHARE"]
    return max(s for s in PCT if PCT[s] <= allowed)
def ref(L, power, acc, matched, armour_pts, evasion=None):
    """The reference player's figures at level L, by combat.json's formulas."""
    v, S = CMV, sec_level(L)
    max_hp = v["HP_BASE"] + v["HP_PER_VITALITY"] * S
    crit = min(v["CRIT_CHANCE_CAP"], v["CRIT_CHANCE_PER_PRECISION"] * S)
    accuracy = L + S + acc
    ev = accuracy if evasion is None else evasion
    hit = min(v["HIT_CHANCE_MAX"], max(v["HIT_CHANCE_MIN"], v["HIT_CHANCE_BASE"] + v["HIT_CHANCE_PER_POINT"] * (accuracy - ev)))
    mx = (power + v["DAMAGE_PER_STYLE_LEVEL"] * L) * (1 + v["PRESSURE_DAMAGE_PER_LEVEL"] * S) * (v["WEAKNESS_MULTIPLIER"] if matched else 1)
    mean = hit * mx / 2 * (1 + (v["CRIT_MULTIPLIER"] - 1) * crit)
    arm = S + armour_pts
    taken = 1 - arm / (arm + v["ARMOUR_HALF_POINT"])
    return dict(S=S, max_hp=max_hp, mean=mean, taken=taken, evasion=ev)
def solve_kill(ident, L, spk, weakness, power, acc, armour_pts, hit_chance=0.6, interval=2.0, xp=10, **extra):
    v, r = CMV, ref(L, power, acc, True, armour_pts)
    fight = spk - v["BETWEEN_KILLS_S"]
    m_dps = v["REFERENCE_DAMAGE_SHARE_PER_KILL"] * r["max_hp"] / fight
    max_hit = rhu(m_dps * interval / (hit_chance * r["taken"] / 2))
    m_dps = hit_chance * max_hit * r["taken"] / 2 / interval  # after rounding
    f = m_dps * v["PLAYER_ATTACK_INTERVAL_S"] / v["RATION_HEAL_HP"]
    hp = rhu(r["mean"] / v["PLAYER_ATTACK_INTERVAL_S"] * fight * (1 - f))
    return dict(mon(ident, L, xp, spk, weakness=weakness), hp=hp, max_hit=max_hit, hit_chance=hit_chance,
                attack_interval_s=interval, evasion=r["evasion"], **extra)
def solve_boss(ident, L, spk, weakness, power, acc, armour_pts, hit_chance=0.7, interval=3.0, xp=400):
    v, r = CMV, ref(L, power, acc, True, armour_pts)
    n, ai = v["BOSS_RATION_CAP_PER_ATTEMPT"], v["PLAYER_ATTACK_INTERVAL_S"]
    m_p = spk - v["BETWEEN_KILLS_S"]
    hp = rhu((m_p - n * ai) * r["mean"] / ai)
    pool = r["max_hp"] + n * v["RATION_HEAL_HP"]
    max_hit = rhu(2 * (interval * pool / m_p) / (hit_chance * r["taken"]))
    return dict(mon(ident, L, xp, spk, boss=True, weakness=weakness), hp=hp, max_hit=max_hit,
                hit_chance=hit_chance, attack_interval_s=interval, evasion=r["evasion"])
def wrow(n, power, acc): return dict(calibration=n, power=power, accuracy=acc)
def arow(n, armour): return dict(calibration=n, armour=armour)
def weapon(item, style, level, power, acc, rows=None):
    return dict(item=item, slot="weapon", style=style, level_required=level,
                stats_by_calibration=rows or [wrow(0, power, acc)] + [None] * 20)
def armour(item, level, points, rows=None):
    return dict(item=item, slot="armour", level_required=level,
                stats_by_calibration=rows or [arow(0, points)] + [None] * 20)
def gearfile(ident, *entries, schema="gear/1"):
    return {"schema": schema, "id": ident, "gear": list(entries)}
def monsters2(*entries): return monsters(*entries, schema="monster/2")
WPN = dict(melee=("item.global.fixture_spanner", 30, 2), marksmanship=("item.global.fixture_rifle", 20, 6),
           aetherics=("item.global.fixture_coil", 40, 0))
COAT = "item.global.fixture_coat"
# Ten: an aetherics monster at level 10. Boss: a marksmanship boss at 15.
# With the fixture shares (0.1 / 0.4), the secondary level is sec_level(L).
TEN = solve_kill("monster.global.fixture_tin_rat", 10, 120, "aetherics", 40, 0, 10)
BOSS = solve_boss("monster.global.fixture_jaw_king", 15, 200, "marksmanship", 20, 6, 10)
GOOD_GEAR = gearfile("gear.global.fixture",
    weapon(WPN["melee"][0], "melee", 1, *WPN["melee"][1:]),
    weapon(WPN["marksmanship"][0], "marksmanship", 5, *WPN["marksmanship"][1:],
           rows=[wrow(n, 20 + 2 * n, 6 + n) for n in range(21)]),
    weapon(WPN["aetherics"][0], "aetherics", 10, *WPN["aetherics"][1:]),
    # A weaker aetherics weapon: never the best, so the check must pick the coil.
    weapon("item.global.fixture_wand", "aetherics", 1, 5, 0),
    # Needs level 11: not available against a level-10 monster.
    weapon("item.global.fixture_big_coil", "aetherics", 11, 400, 50),
    armour(COAT, 1, 10),
    # Fortitude 60: above every reference player's Fortitude here, never worn.
    armour("item.global.fixture_plate", 60, 500))

# schema: tuning.combat/1, monster/2 and gear/1 accepted where they belong.
put("schema/pass/" + CMP, CM)
put("schema/pass/content/monsters/combat.json", monsters2(dict(TEN, id="monster.global.fixture_schema_tin_rat"), BOSS))
put("schema/pass/" + GP, GOOD_GEAR)
bm = model("tuning.global.fixture_combat_bad")
bm["constants"]["HP_BASE"]["value"] = None            # only the open values may be null
bm["constants"]["CRIT_MULTIPLIER"]["value"] = "1.5"   # a string is not machine-readable
del bm["constants"]["ARMOUR_HALF_POINT"]               # every formula constant is required
bm["constants"]["SPARE"] = {"value": 1, "basis": "proposal"}
bm["constants"]["HIT_CHANCE_MAX"]["basis"] = "guess"
bm["constants"]["RATION_HEAL_HP"]["value"] = 0
del bm["units"]["HP_DAMAGE_SCALE"]
bm["status"] = "drafted"                              # the register owns status
put(S + "tuning/combat-bad.json", bm)
put(S + "tuning/combat-no-heal.json", model("tuning.global.fixture_combat_no_heal", RATION_HEAL_HP=...))
# The revision-2 file's current header: tuning.combat/0 is not accepted.
put(S + "tuning/combat-old.json", model("tuning.global.fixture_combat_old", schema="tuning.combat/0"))
b2 = lambda i, **kw: dict(dict(TEN, id="monster.global.fixture_" + i), **kw)
nohp = b2("no_hp"); del nohp["hp"]
put(S + "monsters/bad-2.json", monsters2(nohp, b2("fraction_hp", hp=10.5), b2("zero_hit", hit_chance=0),
    b2("sure_hit", hit_chance=1.2), b2("no_interval", attack_interval_s=0), b2("zero_max_hit", max_hit=0),
    b2("negative_evasion", evasion=-1), b2("armoured", armour=5)))
put(S + "gear/bad.json", {"schema": "gear/1", "id": "gear.foundry.fixture_bad", "gear": [
    dict(weapon("item.global.fixture_short", "melee", 1, 1, 1), stats_by_calibration=[wrow(0, 1, 1)] * 20),
    dict(weapon("item.global.fixture_sling", "pressure", 0, 1, 1)),
    dict(armour("items.global.fixture_hat", 1, 1), slot="trinket"),
    dict(armour("item.global.fixture_cape", 1, 1), rows=None,
         stats_by_calibration=[dict(arow(0, 1), weight=3)] + [None] * 20),
    {"item": "item.global.fixture_no_rows", "slot": "armour", "level_required": 1}]})
put(S + "tuning/stray-gear.json", gearfile("gear.global.fixture_stray"))
put(S + "gear/misplaced.json", items(("item.global.fixture_misplaced_in_gear", "Misplaced", "Item file in the gear directory.")))

# pacing: monster/2 is read like monster/1. The slow crab pays far less per
# hour than the wraith, so the bands are unchanged.
put("pacing/pass/content/monsters/combat.json", monsters2(
    dict(solve_kill("monster.global.fixture_slow_crab", 20, 36, "melee", 30, 2, 10), xp=1)))
put(FC + "content/monsters/future.json", monsters(mon("monster.global.fixture_future", 1, 10, 36), schema="monster/3"))
nh = dict(TEN, id="monster.global.fixture_no_stats"); del nh["hp"]
put(FC + "content/monsters/broken-2.json", monsters2(nh))

# combat pass: the solved monster and boss, with a monster/1 file skipped;
# both are within tolerance, so every line is a NOTE, pinned in
# expected-notes.txt. Two far stronger weapons would break both targets if
# they counted: a thunderhead coil (another zone) and the boss's own
# first-kill rifle.
JAW_RIFLE = "item.global.fixture_jaw_rifle"
PASS_GEAR = dict(GOOD_GEAR, gear=GOOD_GEAR["gear"] + [
    weapon("item.thunderhead.fixture_far_coil", "aetherics", 1, 999, 50),
    weapon(JAW_RIFLE, "marksmanship", 1, 999, 50)])
put("combat/pass/" + CP, PC)
put("combat/pass/" + CMP, CM)
put("combat/pass/" + GP, PASS_GEAR)
put("combat/pass/" + DP, drops("drops.global.fixture", table(BOSS["id"], 1, 1, first_kill=[JAW_RIFLE])))
put("combat/pass/" + MP, monsters2(TEN, BOSS))
put("combat/pass/content/monsters/old.json", monsters(mon("monster.global.fixture_old_rat", 1, 6, 36)))
if not os.path.exists(os.path.join(F, "combat/pass/expected-notes.txt")):
    put("combat/pass/expected-notes.txt", "")

# combat fail: every gear rule broken in one file, a gear/2 and a broken gear
# file, monsters on and off target (bracketing the 5% kill-time and 0.05
# win-chance tolerances), one whose only weakness gear is in another zone
# (no_rifle), a boss whose only weakness gear is its own drop,
# one the Ration cannot keep pace with, and a level-1 monster below the
# armour's Fortitude.
CF = "combat/fail/"
put(CF + CP, PC)
put(CF + CMP, CM)
put(CF + GP, gearfile("gear.global.fixture",
    weapon(WPN["melee"][0], "melee", 1, *WPN["melee"][1:]),
    weapon(WPN["aetherics"][0], "aetherics", 1, *WPN["aetherics"][1:]),
    armour(COAT, sec_level(10), 10)))
put(CF + "content/gear/broken-rules.json", gearfile("gear.global.fixture_broken_rules",
    {k: v for k, v in weapon("item.global.fixture_no_style", "melee", 1, 9, 9).items() if k != "style"},
    dict(armour("item.global.fixture_styled_coat", 1, 9), style="melee"),
    dict(weapon("item.global.fixture_null_zero", "marksmanship", 1, 9, 9), stats_by_calibration=[None] * 21),
    weapon("item.global.fixture_shuffled", "marksmanship", 1, 9, 9,
           rows=[wrow(0, 9, 9), wrow(2, 9, 9)] + [None] * 19),
    weapon("item.global.fixture_mixed", "marksmanship", 1, 9, 9,
           rows=[dict(calibration=0, power=9, armour=3)] + [None] * 20),
    armour("item.global.fixture_spiked", 1, 9, rows=[dict(calibration=0, armour=9, power=4)] + [None] * 20),
    # Twice in one file: one entry per item, and neither is used.
    weapon("item.global.fixture_twice", "marksmanship", 1, 99, 99),
    weapon("item.global.fixture_twice", "marksmanship", 1, 99, 99)))
put(CF + "content/gear/far.json", gearfile("gear.thunderhead.fixture_far",
    weapon("item.thunderhead.fixture_far_rifle", "marksmanship", 1, 20, 6)))
OWN = "item.global.fixture_own_wand"
# Level 15, so only the level-15 own king could use it.
put(CF + "content/gear/own.json", gearfile("gear.global.fixture_own", weapon(OWN, "marksmanship", 15, 20, 6)))
put(CF + DP, drops("drops.global.fixture", table("monster.global.fixture_own_king", 1, 1, [(OWN, 0.1, 1, 1)])))
put(CF + "content/gear/future.json", gearfile("gear.global.fixture_future", schema="gear/2"))
put(CF + "content/gear/broken.json", gearfile("gear.global.fixture_broken", weapon("item.global.fixture_short_rows", "melee", 1, 1, 1, rows=[wrow(0, 1, 1)])))
TK = solve_boss("monster.global.fixture_tough_king", 10, 200, "aetherics", 40, 0, 10)
ON = solve_kill("monster.global.fixture_on_target", 10, 120, "aetherics", 40, 0, 10)
put(CF + MP, monsters2(
    ON,
    dict(ON, id="monster.global.fixture_too_tough", hp=ON["hp"] * 2),
    # 3.8% slow: within the 5% tolerance (a NOTE). 6.7% slow: outside it.
    dict(ON, id="monster.global.fixture_bit_tough", hp=rhu(ON["hp"] * 1.04)),
    dict(ON, id="monster.global.fixture_rather_tough", hp=rhu(ON["hp"] * 1.07)),
    # Thunderhead: uses thunderhead's rifle (its own zone) and finds no
    # thunderhead armour. The global no_rifle above may not use that rifle.
    dict(ON, id="monster.thunderhead.fixture_far_rat", weakness="marksmanship"),
    # Its only rifle is its own drop.
    dict(solve_boss("monster.global.fixture_own_king", 15, 200, "marksmanship", 20, 6, 10)),
    # 10% more hp than its solved value: the win chance falls below 0.45.
    dict(TK, hp=rhu(TK["hp"] * 1.1)),
    # Dies in half the time: the floored time is exactly the target, the
    # computed time is not, and the comparison uses the computed time.
    dict(ON, id="monster.global.fixture_too_soft", hp=ON["hp"] // 2),
    dict(ON, id="monster.global.fixture_no_rifle", weakness="marksmanship"),
    dict(ON, id="monster.global.fixture_glutton", max_hit=ON["max_hit"] * 60),
    dict(solve_kill("monster.global.fixture_level_one", 1, 60, "melee", 30, 2, 0)),
    dict(solve_boss("monster.global.fixture_soft_king", 10, 200, "aetherics", 40, 0, 10), hp=50)))

nh2 = dict(ON, id="monster.global.fixture_no_evasion"); del nh2["evasion"]
put(CF + "content/monsters/broken.json", monsters2(nh2))

# combat fail-model: monster/2 monsters, but the only model declares
# tuning.combat/0, as content/tuning/combat.json revision 2 does today.
FM = "combat/fail-model/"
put(FM + CP, PC)
put(FM + CMP, model(schema="tuning.combat/0"))
put(FM + GP, GOOD_GEAR)
put(FM + MP, monsters2(TEN))

# combat fail-ration-open: the model's RATION_HEAL_HP is null (open), so no stocked kill time or boss win chance is computed; the
# unrationed NOTE lines still are. The level-10 marksmanship monster has no
# rifle at its level.
FR = "combat/fail-ration-open/"
put(FR + CP, PC)
put(FR + CMP, model(RATION_HEAL_HP=None))
put(FR + GP, GOOD_GEAR)
put(FR + MP, monsters2(TEN, BOSS, dict(TEN, id="monster.global.fixture_rifle_shy", level=4, weakness="marksmanship")))

# references: every gear entry's item is an item under content/items/
# (Jeremy, answer to work order 010).
put("references/pass/" + GP, gearfile("gear.global.fixture", weapon(INGOT, "melee", 1, 10, 0)))
put(R + "gear/fixture.json", gearfile("gear.global.fixture", weapon(INGOT, "melee", 1, 10, 0),
    armour("item.global.fixture_ghost_coat", 1, 5), armour("item.global.fixture_stray", 1, 5)))
