"""Check: drops, the zone economy, Ledger Pages and the Crown faucet (work
order 007, scopes 1, 2, 4 and 5).

Shape is the schema check's job and whether each named monster and item
exists is the references check's job. This check reads only drop files that
match drops/1 and economy files that match tuning.economy/1 or
tuning.economy/2 (work order 013: /2 is /1 plus grocer_price, and /1 stays
accepted until the Rustmoor file migrates); a file that
declares drops/* or tuning.economy/* but does not match fails here as
not-checkable, because every rule below would be computed without it.

Drop tables (drops/1):
- crowns.max >= crowns.min, and qty_max >= qty_min in every entry;
- one table per monster, across every drop file;
- first_kill is empty unless the monster is a boss (GDD section 6: bosses
  are fought on purpose; work order 007: "bosses only");
- every zone_pity item is one that some non-boss table in the same file has
  in its entries (Jeremy, answer to work order 007 Q6).

zone_pity is an ordered list (GDD section 5, revised: "A zone's drop pages
arrive in a fixed order on one shared pity timer"). The game keeps ONE
counter per zone, advanced by any kill in the zone; the pages are delivered
in list order, and each entry's kills is the most kills the counter may run
before that entry's page arrives. This check reads each entry's kills against
LEDGER_PITY_MAX_KILLS and does not check the order itself: any order is a
valid design choice.

Economy files (tuning.economy/1 and /2):
- one file per zone, and the zone in the id is the file's "zone";
- collector_price and collector_weekly_cap are null together or set together;
- a bound item has no collector price (work order 007: "A bound item cannot
  be traded or sold");
- grocer-arbitrage (work order 013, scope 3): no collector pays as much as
  the grocer charges for the same item, so nobody can buy from the grocer
  and sell to a collector at a profit. Compared across every checkable
  economy file, not only within one row: an item's lowest grocer_price
  anywhere must be above its every collector_price anywhere. A breach is a
  FAIL on each file involved.

Ledger Pages, any item whose id contains "ledger_page" (an item defined in an
item file, or named by a drop table, a zone_pity entry or an economy file);
GDD section 5. None of these rules applies to the "global" zone (Jeremy,
answer to work order 007 Q8): a page whose id is item.global.* is not checked
for binding, and a table whose monster is monster.global.* is left out of
every rule below.
- it is listed in its zone's economy file (the zone is the second part of the
  item id), bound, with no collector price;
- for every zone that has a drop table (the zone of the table's monster):
  exactly LEDGER_DROPS_PER_ZONE distinct Ledger Pages appear in the entries of
  that zone's non-boss monsters' tables, and each has a zone_pity entry of at
  most LEDGER_PITY_MAX_KILLS kills in the file that holds its table (the one
  shared timer counts any kill in the zone: GDD section 5, revised);
- every boss of such a zone has a drop table whose first_kill holds exactly
  LEDGER_BOSS_FIRST_KILL Ledger Page. Other, non-page items may sit in
  first_kill beside it, and may also be in the boss's entries (a boss's
  signature drop, such as Scrapjaw's Cleaver: GDD section 6);
- Jeremy's answer to work order 007 Q7: no Ledger Page is in a boss's
  entries; no Ledger Page appears in more than one table (entries or
  first_kill); no Ledger Page appears in more than one zone's drops.

Crown faucet (NOTE lines only, no thresholds). For each zone band the combat
pacing check checks, at each level, the non-boss monster that check picks
(highest combat XP per hour, ties to the lower id); its Crowns per hour from
the mean of crowns.min and crowns.max; and Crowns per week at the curve's
BAND_SKILL_QUEUE_HOURS_PER_DAY with no main-skill share, since every kill
drops Crowns. Each boss with a drop table is reported on its own line, as
Crowns per winning attempt, and is never added to the per-hour figures
(Jeremy, answer to work order 007 Q11). For each economy file, the most
collectors pay one player a week: the sum over items of collector_price x
collector_weekly_cap.

Crown sink, the grocer's counter (NOTE lines only, no thresholds; work order
013, scope 4). For each zone with a band (ZONE_BAND) whose band the faucet
reports, at each level L of the band:
- the tier is the non-boss monster the faucet picks at L. Its Rations per
  hour are the combat model's, for the combat check's reference player at
  the monster's level (check_combat.Reference), Rations stocked:
  rations_per_kill = monster_dps x t_fight / RATION_HEAL_HP
  (combat.json kill_time.stocked), times 3600 / the floored expected seconds
  per kill, max(seconds_per_kill, computed) (kill_time.floor). Only a
  monster/2 monster has the stats for this;
- Cooking is levelled at the pacing rate, so the player's Cooking level is L
  and the recipe is the Cooking action pacing picks at L (highest XP per
  hour, ties to the lower id). Its Crowns per Ration are the sum over inputs
  of qty x the item's grocer_price, divided by the sum of its output qty.
  Every Cooking output counts as a Ration (GDD section 6 Skills table:
  Cooking produces "Healing rations"). The grocer_price used is the lowest
  any checkable economy file gives the item; an input with none costs the
  grocer nothing and is counted at 0, and the line says so;
- combat hours at L are cost_to_next(L) / (the tier's XP per hour x
  MAIN_COMBAT_SKILL_SHARE), the pacing check's band time; band days are
  their sum / BAND_SKILL_QUEUE_HOURS_PER_DAY, as pacing reports them.
Two sink figures are reported side by side, never added, because which one
the 90% rule counts is open (work order 013 hand-back):
- eating: Rations eaten x their recipe's Crowns per Ration, summed over the
  band, and per week (band total x 7 / combat band days);
- levelling Cooking: the grocer Crowns of every Cooking action pacing's
  Cooking levelling performs over the band (cost_to_next(L) / XP per action
  actions at each L), and per week (total x 7 / Cooking band days), with the
  Rations those actions make beside the Rations eaten.
Each is shown with its ratio to the faucet per week: the band's kill Crowns
(per level as above, per week the same way) plus the zone's collector
weekly maximum. The GDD's 90% sink rule (GDD section 6, The Crown budget) is
reported, not enforced, until Calibrating, the main sink, exists.

Usage: python3 scripts/validate/check_drops.py [--root DIR]
"""

import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_combat  # noqa: E402
import check_pacing  # noqa: E402
from check_references import item_ids  # noqa: E402
from check_xp_curve import ZONE_BANDS  # noqa: E402

CHECK = "drops"

DROPS_SCHEMA_PREFIX = "drops/"
CHECKABLE_DROPS_SCHEMA = "drops/1"
ECONOMY_SCHEMA_PREFIX = "tuning.economy/"
# Work order 013: /2 adds grocer_price; /1 stays accepted until the
# draftsman migrates the Rustmoor file.
CHECKABLE_ECONOMY_SCHEMAS = ("tuning.economy/1", "tuning.economy/2")
MONSTERS_DIR = "content/monsters/"
MONSTER_SCHEMA_PREFIX = "monster/"

# GDD section 5, Ledger Pages: "12 as rare zone drops (4 per zone). Each zone
# drop ..." and, revised by Jeremy (work order 007, after Q6): "A zone's drop
# pages arrive in a fixed order on one shared pity timer, which guarantees
# the next page within 1,000 kills of any monster in that zone".
LEDGER_MARK = "ledger_page"
LEDGER_DROPS_PER_ZONE = 4
LEDGER_PITY_MAX_KILLS = 1000
# GDD section 5: "3 from boss first-kills" (one per zone boss); work order 007.
LEDGER_BOSS_FIRST_KILL = 1
# Jeremy, answer to work order 007 Q8: the Ledger Page rules skip this zone.
LEDGER_EXEMPT_ZONES = ("global",)

# GDD section 6, combat table: the band each zone covers. Used only to label
# the collector figure; "global" has no band.
ZONE_BAND = {"rustmoor": (1, 20), "cinderworks": (20, 45), "thunderhead": (45, 70)}

# Read from the curve file's "assumptions"; never copied here. Work order 007:
# "use the full 12 combat hours for Crowns", so no share is applied.
HOURS_PER_DAY_KEY = check_pacing.HOURS_PER_DAY_KEY
DAYS_PER_WEEK = 7

_ZONE_ID = re.compile(r"^(?:item|monster|drops|tuning)\.([a-z]+)\.")


def zone_of(ident):
    match = _ZONE_ID.match(ident) if isinstance(ident, str) else None
    return match.group(1) if match else None


def is_ledger_page(ident):
    return isinstance(ident, str) and LEDGER_MARK in ident


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def _load(report, root, schemas, prefix, checkable, what):
    """[(path, data)] for every file declaring prefix* that matches checkable."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue  # the schema check reports unparseable files
        declared = _declared(data)
        if not declared.startswith(prefix):
            continue
        if isinstance(checkable, str):
            checkable = (checkable,)
        if declared not in checkable:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked"
                        % (declared, " or ".join(checkable)))
            continue
        errors = lib.validate(data, schemas[declared])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "%s leave it out" % (declared, len(errors), what))
            continue
        out.append((path, data))
    return out


def load_monsters(root):
    """{monster id: monster dict}, read leniently from monster files under
    content/monsters/. The schema and pacing checks report their shape."""
    out = {}
    for path in lib.content_files(root):
        if not path.startswith(MONSTERS_DIR):
            continue
        data, error = lib.load_json(root, path)
        if error or not _declared(data).startswith(MONSTER_SCHEMA_PREFIX):
            continue
        monsters = data.get("monsters")
        for monster in monsters if isinstance(monsters, list) else []:
            if isinstance(monster, dict) and isinstance(monster.get("id"), str):
                out.setdefault(monster["id"], monster)
    return out


def _is_boss(monster):
    return isinstance(monster, dict) and monster.get("boss") is True


# --------------------------------------------------------------------------
# Drop tables and economy files
# --------------------------------------------------------------------------


def check_tables(report, drop_files, tables, monsters):
    """drop_files: [(path, data)]; tables: [(path, index, table)]."""
    for path, data in drop_files:
        dropped = set()
        for table in data["tables"]:
            if not _is_boss(monsters.get(table["monster"])):
                dropped.update(e["item"] for e in table["entries"])
        for slot, entry in enumerate(data["zone_pity"]):
            if entry["item"] not in dropped:
                report.fail("zone-pity-not-dropped", path,
                            "/zone_pity/%d names %s, which no non-boss table in this "
                            "file drops" % (slot, entry["item"]), data["id"])
    by_monster = {}
    for path, index, table in tables:
        ident = table["monster"]
        by_monster.setdefault(ident, []).append((path, index))
        crowns = table["crowns"]
        if crowns["max"] < crowns["min"]:
            report.fail("crowns-range", path,
                        "/tables/%d/crowns: max %s is below min %s"
                        % (index, crowns["max"], crowns["min"]), ident)
        for slot, entry in enumerate(table["entries"]):
            if entry["qty_max"] < entry["qty_min"]:
                report.fail("qty-range", path,
                            "/tables/%d/entries/%d (%s): qty_max %s is below qty_min %s"
                            % (index, slot, entry["item"], entry["qty_max"],
                               entry["qty_min"]), ident)
        monster = monsters.get(ident)
        if table["first_kill"] and monster is not None and not _is_boss(monster):
            report.fail("first-kill-not-boss", path,
                        "/tables/%d/first_kill lists %s, but %s is not a boss; "
                        "first-kill items are for bosses only"
                        % (index, ", ".join(table["first_kill"]), ident), ident)
    for ident in sorted(by_monster):
        places = by_monster[ident]
        if len(places) > 1:
            where = ", ".join("%s#/tables/%d" % place for place in places)
            for path in sorted(set(p for p, _ in places)):
                report.fail("duplicate-table", path,
                            "monster has %d drop tables: %s; one per monster"
                            % (len(places), where), ident)


def check_economy(report, economies):
    """economies: [(path, data)]. Returns {zone: [(path, data)]}."""
    by_zone = {}
    for path, data in economies:
        by_zone.setdefault(data["zone"], []).append((path, data))
        if zone_of(data["id"]) != data["zone"]:
            report.fail("economy-id-zone", path,
                        "id names zone %s but \"zone\" is %s"
                        % (zone_of(data["id"]), data["zone"]), data["id"])
        for item in sorted(data["items"]):
            row = data["items"][item]
            price, cap = row["collector_price"], row["collector_weekly_cap"]
            if (price is None) != (cap is None):
                report.fail("collector-pair", path,
                            "/items/%s: collector_price is %s and collector_weekly_cap "
                            "is %s; both null or both set"
                            % (item, _text(price), _text(cap)), item)
            if row["bound"] and price is not None:
                report.fail("bound-but-priced", path,
                            "/items/%s: bound, so it cannot be sold, but "
                            "collector_price is %s" % (item, price), item)
    for zone in sorted(by_zone):
        files = by_zone[zone]
        if len(files) > 1:
            for path, _data in files:
                report.fail("economy-per-zone", path,
                            "zone %s has %d economy files (%s); one per zone"
                            % (zone, len(files), ", ".join(p for p, _ in files)))
    return by_zone


def check_grocer(report, economies):
    """Work order 013, scope 3: no collector pays as much as the grocer
    charges for the same item, in any pair of checkable economy files."""
    grocer, collector = {}, {}
    for path, data in economies:
        for item in sorted(data["items"]):
            row = data["items"][item]
            if row.get("grocer_price") is not None:
                grocer.setdefault(item, []).append((row["grocer_price"], path))
            if row["collector_price"] is not None:
                collector.setdefault(item, []).append((row["collector_price"], path))
    for item in sorted(grocer):
        for price, gpath in grocer[item]:
            for paid, cpath in collector.get(item, []):
                if paid < price:
                    continue
                message = ("/items/%s: the grocer sells it at %s Crowns (%s) and a "
                           "collector pays %s Crowns (%s); a collector must pay less "
                           "than the grocer charges, or buying from the grocer and "
                           "selling to the collector is a profit"
                           % (item, price, gpath, paid, cpath))
                for path in sorted(set((gpath, cpath))):
                    report.fail("grocer-arbitrage", path, message, item)


def grocer_prices(economies):
    """{item: lowest grocer_price in any checkable economy file}."""
    out = {}
    for _path, data in economies:
        for item, row in data["items"].items():
            price = row.get("grocer_price")
            if price is not None and (item not in out or price < out[item]):
                out[item] = price
    return out


def _text(value):
    return "null" if value is None else str(value)


# --------------------------------------------------------------------------
# Ledger Pages
# --------------------------------------------------------------------------


def check_ledger(report, root, drop_files, tables, economy_by_zone, monsters):
    pages = {}  # page id -> where it was seen first
    for ident, path in item_ids(root).items():
        if is_ledger_page(ident):
            pages.setdefault(ident, path)
    for path, data in drop_files:
        named = [p["item"] for p in data["zone_pity"]]
        for table in data["tables"]:
            named += [e["item"] for e in table["entries"]] + list(table["first_kill"])
        for ident in named:
            if is_ledger_page(ident):
                pages.setdefault(ident, path)
    for zone in economy_by_zone:
        for path, data in economy_by_zone[zone]:
            for ident in data["items"]:
                if is_ledger_page(ident):
                    pages.setdefault(ident, path)

    for page in sorted(pages):
        zone = zone_of(page)
        if zone in LEDGER_EXEMPT_ZONES:
            continue
        files = economy_by_zone.get(zone, [])
        listed = [(p, d["items"][page]) for p, d in files if page in d["items"]]
        if not listed:
            report.fail("ledger-not-bound", files[0][0] if files else pages[page],
                        "zone %s: Ledger Page %s is not listed in the zone's economy "
                        "file%s, so it is not bound"
                        % (zone, page, "" if files else " (the zone has none)"), page)
            continue
        for path, row in listed:
            if row["bound"] is not True:
                report.fail("ledger-not-bound", path,
                            "zone %s: Ledger Page %s has bound %s; Ledger Pages are "
                            "bound" % (zone, page, _text(row["bound"]).lower()), page)
            if row["collector_price"] is not None:
                report.fail("ledger-priced", path,
                            "zone %s: Ledger Page %s has collector_price %s; Ledger "
                            "Pages have none" % (zone, page, row["collector_price"]),
                            page)

    pity_by_file = {}
    for path, data in drop_files:
        for entry in data["zone_pity"]:
            pity_by_file.setdefault(path, {}).setdefault(entry["item"], []).append(entry["kills"])

    by_zone = {}
    for path, index, table in tables:
        zone = zone_of(table["monster"])
        if zone is not None and zone not in LEDGER_EXEMPT_ZONES:
            by_zone.setdefault(zone, []).append((path, index, table))

    # Q7: where each page appears, across every checked zone.
    seen = {}  # page -> [(zone, path, index, monster, field)]
    for zone in sorted(by_zone):
        for path, index, table in by_zone[zone]:
            boss = _is_boss(monsters.get(table["monster"]))
            for field in ("entries", "first_kill"):
                items = ([e["item"] for e in table["entries"]] if field == "entries"
                         else table["first_kill"])
                for item in sorted(set(items)):
                    if not is_ledger_page(item):
                        continue
                    seen.setdefault(item, []).append(
                        (zone, path, index, table["monster"], field))
                    if boss and field == "entries":
                        report.fail("ledger-in-boss-entries", path,
                                    "zone %s: Ledger Page %s is in the entries of boss "
                                    "%s (/tables/%d); a boss gives its page on first "
                                    "kill only" % (zone, item, table["monster"], index),
                                    item)
    for page in sorted(seen):
        places = seen[page]
        where = ", ".join("%s#/tables/%d/%s (%s)" % (p, i, f, m) for _z, p, i, m, f in places)
        tables_of = set((p, i) for _z, p, i, _m, _f in places)
        zones = sorted(set(z for z, _p, _i, _m, _f in places))
        paths = ", ".join(sorted(set(p for _z, p, _i, _m, _f in places)))
        if len(tables_of) > 1:
            report.fail("ledger-many-tables", paths,
                        "zone %s: Ledger Page %s appears in %d tables: %s; one only"
                        % (", ".join(zones), page, len(tables_of), where), page)
        if len(zones) > 1:
            report.fail("ledger-many-zones", paths,
                        "zones %s: Ledger Page %s drops in %d zones: %s; one only"
                        % (", ".join(zones), page, len(zones), where), page)

    for zone in sorted(by_zone):
        zone_tables = by_zone[zone]
        zone_paths = ", ".join(sorted(set(p for p, _, _ in zone_tables)))
        dropped = {}  # page -> files whose non-boss tables drop it
        for path, index, table in zone_tables:
            monster = monsters.get(table["monster"])
            if monster is None or _is_boss(monster):
                continue  # unknown monsters are the references check's job
            for item in set(e["item"] for e in table["entries"]):
                if is_ledger_page(item):
                    dropped.setdefault(item, set()).add(path)
        for page in sorted(dropped):
            for path in sorted(dropped[page]):
                kills = pity_by_file.get(path, {}).get(page)
                if not kills:
                    report.fail("ledger-no-pity", path,
                                "zone %s: Ledger Page %s drops from a non-boss table in "
                                "this file but has no zone_pity entry; at most %d kills "
                                "required" % (zone, page, LEDGER_PITY_MAX_KILLS), page)
                elif max(kills) > LEDGER_PITY_MAX_KILLS:
                    report.fail("ledger-pity-too-long", path,
                                "zone %s: Ledger Page %s has zone_pity %s kills; at "
                                "most %d" % (zone, page, max(kills),
                                             LEDGER_PITY_MAX_KILLS), page)
        if len(dropped) != LEDGER_DROPS_PER_ZONE:
            report.fail("ledger-drop-count", zone_paths,
                        "zone %s: %d Ledger Page(s) drop from non-boss monsters (%s); "
                        "exactly %d required"
                        % (zone, len(dropped), ", ".join(sorted(dropped)) or "none",
                           LEDGER_DROPS_PER_ZONE))

        bosses = sorted(i for i, m in monsters.items()
                        if zone_of(i) == zone and _is_boss(m))
        if not bosses:
            report.fail("ledger-boss-page", zone_paths,
                        "zone %s has drop tables but no boss monster, so no boss "
                        "gives a Ledger Page on first kill" % zone)
        for boss in bosses:
            own = [(p, i, t) for p, i, t in zone_tables if t["monster"] == boss]
            if not own:
                report.fail("ledger-boss-page", zone_paths,
                            "zone %s: boss %s has no drop table, so gives no Ledger "
                            "Page on first kill; exactly %d required"
                            % (zone, boss, LEDGER_BOSS_FIRST_KILL), boss)
                continue
            for path, index, table in own:
                given = [i for i in table["first_kill"] if is_ledger_page(i)]
                if len(given) != LEDGER_BOSS_FIRST_KILL:
                    report.fail("ledger-boss-page", path,
                                "zone %s: boss %s gives %d Ledger Page(s) in first_kill "
                                "(/tables/%d: %s); exactly %d required"
                                % (zone, boss, len(given), index,
                                   ", ".join(given) or "none", LEDGER_BOSS_FIRST_KILL),
                                boss)
    return len(pages)


# --------------------------------------------------------------------------
# Crown faucet report
# --------------------------------------------------------------------------


def faucet_report(report, root, schemas, tables, economy_by_zone):
    # Pacing's own loaders, so the faucet uses the monsters and the curve the
    # pacing check uses. Their failures are the pacing check's to report.
    scratch = lib.Report(check_pacing.CHECK)
    _files, monsters = check_pacing.load_monsters(scratch, root, schemas)
    hours_per_day = None
    if monsters:
        _path, curve = check_pacing.load_curve(scratch, root, schemas)
        if curve is not None:
            value = curve.get("assumptions", {}).get(HOURS_PER_DAY_KEY)
            if check_pacing._positive_number(value):
                hours_per_day = value

    per_kill = {}
    crowns_range = {}
    for _path, _index, table in tables:
        crowns = table["crowns"]
        per_kill.setdefault(table["monster"], (crowns["min"] + crowns["max"]) / 2.0)
        crowns_range.setdefault(table["monster"], (crowns["min"], crowns["max"]))
    speed = dict((m["id"], m["seconds_per_kill"]) for _p, m in monsters)

    if tables:
        if hours_per_day is None:
            report.note("Crown faucet: no valid curve with a positive assumptions.%s; "
                        "Crowns per week not computed (see the pacing check)"
                        % HOURS_PER_DAY_KEY)
        else:
            report.note("Crown faucet: %s combat hours a day from the curve, no "
                        "main-skill share; Crowns per kill is the mean of min and max"
                        % _num(hours_per_day))
        pool = check_pacing.monster_pool(monsters)
        for start, end in ZONE_BANDS:
            _band_faucet(report, pool.entries, start, end, per_kill, speed,
                         hours_per_day)
        for _path, monster in sorted(monsters, key=lambda pm: pm[1]["id"]):
            ident = monster["id"]
            if monster["boss"] and ident in per_kill:
                low, high = crowns_range[ident]
                report.note("Crown faucet boss %s (level %s): %s Crowns per winning "
                            "attempt (%d to %d); a separate queue item, not in the "
                            "per-hour figures" % (ident, monster["level"],
                                                  _num(per_kill[ident]), low, high))

    for zone in sorted(economy_by_zone):
        for path, data in economy_by_zone[zone]:
            priced = [(i, r) for i, r in sorted(data["items"].items())
                      if r["collector_price"] is not None
                      and r["collector_weekly_cap"] is not None]
            total = sum(r["collector_price"] * r["collector_weekly_cap"] for _i, r in priced)
            band = ZONE_BAND.get(zone)
            report.note("Crown faucet zone %s (%s), %s: collectors pay at most %s Crowns "
                        "per player per week, from %d item(s) with a collector price"
                        % (zone, "band %d to %d" % band if band else "no zone band",
                           path, _num(total), len(priced)))
    return per_kill


def _band_faucet(report, entries, start, end, per_kill, speed, hours_per_day):
    label = "Crown faucet band %d to %d" % (start, end)
    if not [e for e in entries if start <= e[2] < end]:
        report.note("%s: no non-boss monsters unlocked inside the band; not reported "
                    "(as in the pacing check)" % label)
        return
    if check_pacing.best_entry(entries, start) is None:
        report.note("%s: no non-boss monster unlocked at level %d; not reported "
                    "(as in the pacing check)" % (label, start))
        return
    spans = []
    for level in range(start, end):
        ident = check_pacing.best_entry(entries, level)[1]
        if spans and spans[-1][0] == ident:
            spans[-1][2] = level
        else:
            spans.append([ident, level, level])
    parts = []
    for ident, first, last in spans:
        levels = "levels %s" % (first if first == last else "%d-%d" % (first, last))
        if ident not in per_kill:
            parts.append("%s (%s): no drop table, Crowns unknown" % (ident, levels))
            continue
        per_hour = per_kill[ident] * 3600.0 / speed[ident]
        text = "%s (%s): %s Crowns a kill, %.1f Crowns/h" % (
            ident, levels, _num(per_kill[ident]), per_hour)
        if hours_per_day is not None:
            text += ", %.0f Crowns/week" % (per_hour * hours_per_day * DAYS_PER_WEEK)
        parts.append(text)
    report.note("%s: %s" % (label, "; ".join(parts)))


# --------------------------------------------------------------------------
# Crown sink report: the grocer's counter (work order 013, scope 4)
# --------------------------------------------------------------------------

COOKING = "cooking"


class _Combat:
    """The combat check's model, gear and reference player, loaded once, for
    Rations eaten per hour. Every load failure is the combat or pacing
    check's to report; here it only makes a figure "not computed"."""

    def __init__(self, root, schemas, curve):
        scratch = lib.Report(check_combat.CHECK)
        self.c = None
        self.why = None
        self.cache = {}
        _path, c = check_combat.load_model(scratch, root, schemas)
        if c is None:
            self.why = "no single valid %s combat model" % check_combat.MODEL_SCHEMA
            return
        if c[check_combat.RATION_KEY] is None:
            self.why = "%s is null in the combat model" % check_combat.RATION_KEY
            return
        self.c = c
        _n, gear = check_combat.load_gear(scratch, root, schemas)
        self.gearset = check_combat.GearSet(gear)
        self.boss_drops = check_combat.load_boss_drops(root)
        self.sec_of = check_combat.secondary_levels(curve, c)

    def rations_per_hour(self, monster):
        """(Rations eaten per hour, None) or (None, why not)."""
        ident = monster["id"]
        if ident not in self.cache:
            self.cache[ident] = self._rations(monster)
        return self.cache[ident]

    def _rations(self, m):
        if self.c is None:
            return None, self.why
        if "hp" not in m:
            return None, "%s has no combat stats (monster/1)" % m["id"]
        c, heal = self.c, self.c[check_combat.RATION_KEY]
        ref = check_combat.Reference(c, self.sec_of, self.gearset, self.boss_drops, m)
        if not ref.level_ok:
            return None, "%s: level %d is not in the curve table" % (m["id"], m["level"])
        if ref.player is None:
            return None, ("%s: the reference player has no %s weapon (see the combat "
                          "check)" % (m["id"], m["weakness"]))
        fight = check_combat.Fight(c, ref.player, m, heal)
        if not fight.damaging():
            return None, "%s: the reference player's mean swing is 0" % m["id"]
        f = fight.drag()
        if f >= 1:
            return None, "%s: the stocked fight never ends (f >= 1)" % m["id"]
        t_fight = fight.t_pure() / (1 - f)
        per_kill = fight.m_dps * t_fight / heal
        seconds = max(m["seconds_per_kill"], c["BETWEEN_KILLS_S"] + t_fight)
        return per_kill * 3600.0 / seconds, None


def _recipe_cost(action, prices):
    """(Crowns of grocer ingredients per action, Rations made per action,
    [inputs with no grocer_price])."""
    crowns, unpriced = 0, []
    for stack in action["inputs"]:
        if stack["item"] in prices:
            crowns += stack["qty"] * prices[stack["item"]]
        else:
            unpriced.append(stack["item"])
    made = sum(stack["qty"] for stack in action["outputs"])
    return crowns, made, unpriced


def _ranges(levels):
    """"1-4, 7" from [1, 2, 3, 4, 7]."""
    out = []
    for level in sorted(levels):
        if out and out[-1][1] == level - 1:
            out[-1][1] = level
        else:
            out.append([level, level])
    return ", ".join(str(a) if a == b else "%d-%d" % (a, b) for a, b in out)


def _pct(part, whole):
    return "%.1f%%" % (100.0 * part / whole) if whole else "no faucet"


def sink_report(report, root, schemas, per_kill, economies, economy_by_zone):
    prices = grocer_prices(economies)
    if not prices:
        if economies:
            report.note("Crown sink, grocer: no checkable economy file gives any item a "
                        "grocer_price; nothing to report")
        return
    report.note("Crown sink, grocer: %d item(s) with a grocer_price (%s)"
                % (len(prices), ", ".join("%s %s" % (i, prices[i]) for i in sorted(prices))))
    scratch = lib.Report(check_pacing.CHECK)
    _f, monsters = check_pacing.load_monsters(scratch, root, schemas)
    _f, actions = check_pacing.load_actions(scratch, root, schemas)
    curve_path, curve = check_pacing.load_curve(scratch, root, schemas)
    inputs = check_pacing.curve_inputs(scratch, curve_path, curve) if curve else None
    if inputs is None:
        report.note("Crown sink, grocer: no valid curve with the pacing assumptions; "
                    "not computed (see the pacing check)")
        return
    hours_per_day = curve["assumptions"][HOURS_PER_DAY_KEY]
    share = curve["assumptions"][check_pacing.SHARE_KEY]
    costs = inputs[2]
    combat = _Combat(root, schemas, curve)
    by_id = dict((m["id"], m) for _p, m in monsters)
    pool = check_pacing.monster_pool(monsters).entries
    cooking = [(p, a) for p, a in actions if a["skill"] == COOKING]
    cook_pool = check_pacing.action_pool(COOKING, cooking).entries
    recipes = dict((a["id"], a) for _p, a in cooking)
    for zone in sorted(ZONE_BAND, key=lambda z: ZONE_BAND[z]):
        start, end = ZONE_BAND[zone]
        _zone_sink(report, zone, start, end, pool, cook_pool, recipes, by_id, per_kill,
                   prices, costs, hours_per_day, share, combat,
                   economy_by_zone.get(zone, []))
    report.note("Crown sink, grocer: the 90% sink rule (GDD section 6, The Crown budget) "
                "is reported, not enforced, until Calibrating, the main sink, exists")


def _zone_sink(report, zone, start, end, pool, cook_pool, recipes, by_id, per_kill,
               prices, costs, hours_per_day, share, combat, econ_files):
    label = "Crown sink zone %s (band %d to %d), grocer" % (zone, start, end)
    if not [e for e in pool if start <= e[2] < end] or \
            check_pacing.best_entry(pool, start) is None:
        report.note("%s: not reported, as the faucet band is not" % label)
        return
    week = hours_per_day * DAYS_PER_WEEK
    spans = []  # [monster, recipe, first, last]
    combat_hours = eaten = eat_crowns = faucet = 0.0
    eat_missing, faucet_missing, unpriced = set(), set(), set()
    no_recipe = []
    for level in range(start, end):
        _p, mid, _l, xph = check_pacing.best_entry(pool, level)
        cook = check_pacing.best_entry(cook_pool, level)
        rid = cook[1] if cook else None
        if spans and spans[-1][0] == mid and spans[-1][1] == rid:
            spans[-1][3] = level
        else:
            spans.append([mid, rid, level, level])
        hours = costs[level] / (xph * share)
        combat_hours += hours
        rate, why = combat.rations_per_hour(by_id[mid])
        if rid is None:
            no_recipe.append(level)
        elif rate is None:
            eat_missing.add(why)
        else:
            crowns, made, missing = _recipe_cost(recipes[rid], prices)
            unpriced.update(missing)
            eaten += rate * hours
            eat_crowns += rate * hours * crowns / made
        if mid in per_kill:
            faucet += per_kill[mid] * 3600.0 / by_id[mid]["seconds_per_kill"] * hours
        else:
            faucet_missing.add(mid)

    if no_recipe:
        eat_missing.add("no Cooking action unlocked at level%s %s"
                        % ("" if len(no_recipe) == 1 else "s", _ranges(no_recipe)))
    parts = []
    for mid, rid, first, last in spans:
        levels = "levels %s" % (first if first == last else "%d-%d" % (first, last))
        rate, why = combat.rations_per_hour(by_id[mid])
        text = "%s (%s)" % (mid, levels)
        if mid in per_kill:
            kill_week = per_kill[mid] * 3600.0 / by_id[mid]["seconds_per_kill"] * week
            text += ", kill faucet %.0f Crowns/week" % kill_week
        else:
            kill_week = None
            text += ", no drop table"
        if rate is None:
            parts.append("%s: Rations not computed, %s" % (text, why))
            continue
        text += ", %.2f Rations/h eaten" % rate
        if rid is None:
            parts.append("%s; no Cooking action unlocked" % text)
            continue
        crowns, made, _missing = _recipe_cost(recipes[rid], prices)
        per_ration = float(crowns) / made
        eat_week = rate * week * per_ration
        text += ("; recipe %s, %s Crowns a Ration; eating %.0f Crowns/week"
                 % (rid, _num(round(per_ration, 3)), eat_week))
        if kill_week:
            text += ", %s of the kill faucet" % _pct(eat_week, kill_week)
        parts.append(text)
    report.note("%s, by tier: %s" % (label, "; ".join(parts)))

    combat_days = combat_hours / hours_per_day
    collectors = sum(r["collector_price"] * r["collector_weekly_cap"]
                     for _path, data in econ_files for r in data["items"].values()
                     if r["collector_price"] is not None
                     and r["collector_weekly_cap"] is not None)
    if faucet_missing:
        faucet_text = ("kill faucet not computed (no drop table: %s)"
                       % ", ".join(sorted(faucet_missing)))
        faucet_week = None
    else:
        kill_week = faucet * DAYS_PER_WEEK / combat_days
        faucet_week = kill_week + collectors
        faucet_text = ("faucet %.0f Crowns/week = kills %.0f + collectors' weekly maximum "
                       "%.0f (%s)" % (faucet_week, kill_week, collectors,
                                      ", ".join(p for p, _d in econ_files)
                                      or "no economy file for the zone"))
    report.note("%s: band %.2f combat days at %s combat hours a day; %s"
                % (label, combat_days, _num(hours_per_day), faucet_text))

    if eat_missing:
        report.note("%s, eating: not computed (%s)" % (label, "; ".join(sorted(eat_missing))))
    else:
        eat_week = eat_crowns * DAYS_PER_WEEK / combat_days
        report.note("%s, eating: %.0f Rations eaten over the band, %.0f Crowns of "
                    "ingredients, %.0f Crowns/week, %s of the faucet"
                    % (label, eaten, eat_crowns, eat_week,
                       _pct(eat_week, faucet_week) if faucet_week else "faucet unknown"))

    own = [e for e in cook_pool if start <= e[2] < end]
    if not own or check_pacing.best_entry(cook_pool, start) is None:
        report.note("%s, levelling Cooking: not computed; pacing does not check Cooking "
                    "in this band (%s)"
                    % (label, "no Cooking action unlocked inside the band" if not own
                       else "none unlocked at level %d" % start))
    else:
        cook_hours = made_total = level_crowns = 0.0
        for level in range(start, end):
            _p, rid, _l, xph = check_pacing.best_entry(cook_pool, level)
            action = recipes[rid]
            count = float(costs[level]) / action["xp"]
            crowns, made, missing = _recipe_cost(action, prices)
            unpriced.update(missing)
            cook_hours += costs[level] / xph
            made_total += count * made
            level_crowns += count * crowns
        cook_days = cook_hours / (hours_per_day * share)
        level_week = level_crowns * DAYS_PER_WEEK / cook_days
        report.note("%s, levelling Cooking: %.2f Cooking band days (as pacing), %.0f "
                    "Rations made%s, %.0f Crowns of ingredients, %.0f Crowns/week, %s of "
                    "the faucet"
                    % (label, cook_days, made_total,
                       "" if eat_missing else " against %.0f eaten" % eaten,
                       level_crowns, level_week,
                       _pct(level_week, faucet_week) if faucet_week else "faucet unknown"))
    if unpriced:
        report.note("%s: Cooking inputs with no grocer_price, counted at 0 Crowns: %s"
                    % (label, ", ".join(sorted(unpriced))))


def _num(value):
    return ("%d" % value) if float(value).is_integer() else ("%s" % value)


# --------------------------------------------------------------------------


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    drop_files = _load(report, root, schemas, DROPS_SCHEMA_PREFIX,
                       CHECKABLE_DROPS_SCHEMA, "the drop, Ledger Page and faucet rules")
    economies = _load(report, root, schemas, ECONOMY_SCHEMA_PREFIX,
                      CHECKABLE_ECONOMY_SCHEMAS, "the economy, Ledger Page and faucet rules")
    tables = [(path, index, table) for path, data in drop_files
              for index, table in enumerate(data["tables"])]
    monsters = load_monsters(root)

    check_tables(report, drop_files, tables, monsters)
    economy_by_zone = check_economy(report, economies)
    check_grocer(report, economies)
    pages = check_ledger(report, root, drop_files, tables, economy_by_zone, monsters)
    report.note("%d checkable drop file(s), %d drop table(s), %d checkable economy "
                "file(s), %d Ledger Page item(s)%s"
                % (len(drop_files), len(tables), len(economies), pages,
                   "; nothing to check" if not (tables or economies or pages) else ""))
    per_kill = faucet_report(report, root, schemas, tables, economy_by_zone)
    sink_report(report, root, schemas, per_kill, economies, economy_by_zone)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
