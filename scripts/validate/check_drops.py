"""Check: drops, the zone economy, Ledger Pages and the Crown faucet (work
order 007, scopes 1, 2, 4 and 5).

Shape is the schema check's job and whether each named monster and item
exists is the references check's job. This check reads only drop files that
match drops/1 and economy files that match tuning.economy/1; a file that
declares drops/* or tuning.economy/* but does not match fails here as
not-checkable, because every rule below would be computed without it.

Drop tables (drops/1):
- crowns.max >= crowns.min, and qty_max >= qty_min in every entry;
- one table per monster, across every drop file;
- first_kill is empty unless the monster is a boss (GDD section 6: bosses
  are fought on purpose; work order 007: "bosses only");
- every zone_pity item is one that some non-boss table in the same file has
  in its entries (Jeremy, answer to work order 007 Q6).

Economy files (tuning.economy/1):
- one file per zone, and the zone in the id is the file's "zone";
- collector_price and collector_weekly_cap are null together or set together;
- a bound item has no collector price (work order 007: "A bound item cannot
  be traded or sold").

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
  most LEDGER_PITY_MAX_KILLS kills in the file that holds its table (pity
  counts any kill in the zone: Jeremy, answer to work order 007 Q6);
- every boss of such a zone has a drop table whose first_kill holds exactly
  LEDGER_BOSS_FIRST_KILL Ledger Page;
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
collector_weekly_cap. The GDD's 90% sink rule is not checked: no sinks exist
yet.

Usage: python3 scripts/validate/check_drops.py [--root DIR]
"""

import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_pacing  # noqa: E402
from check_references import item_ids  # noqa: E402
from check_xp_curve import ZONE_BANDS  # noqa: E402

CHECK = "drops"

DROPS_SCHEMA_PREFIX = "drops/"
CHECKABLE_DROPS_SCHEMA = "drops/1"
ECONOMY_SCHEMA_PREFIX = "tuning.economy/"
CHECKABLE_ECONOMY_SCHEMA = "tuning.economy/1"
MONSTERS_DIR = "content/monsters/"
MONSTER_SCHEMA_PREFIX = "monster/"

# GDD section 5, Ledger Pages: "12 as rare zone drops (4 per zone). Each zone
# drop has a pity timer that guarantees the next page within 500 kills".
LEDGER_MARK = "ledger_page"
LEDGER_DROPS_PER_ZONE = 4
LEDGER_PITY_MAX_KILLS = 500
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
        if declared != checkable:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked" % (declared, checkable))
            continue
        errors = lib.validate(data, schemas[checkable])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "%s leave it out" % (checkable, len(errors), what))
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
    if tables or economy_by_zone:
        report.note("Crown faucet: the 90% sink rule (GDD section 6) is not checked; "
                    "no sinks exist yet")


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


def _num(value):
    return ("%d" % value) if float(value).is_integer() else ("%s" % value)


# --------------------------------------------------------------------------


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    drop_files = _load(report, root, schemas, DROPS_SCHEMA_PREFIX,
                       CHECKABLE_DROPS_SCHEMA, "the drop, Ledger Page and faucet rules")
    economies = _load(report, root, schemas, ECONOMY_SCHEMA_PREFIX,
                      CHECKABLE_ECONOMY_SCHEMA, "the economy, Ledger Page and faucet rules")
    tables = [(path, index, table) for path, data in drop_files
              for index, table in enumerate(data["tables"])]
    monsters = load_monsters(root)

    check_tables(report, drop_files, tables, monsters)
    economy_by_zone = check_economy(report, economies)
    pages = check_ledger(report, root, drop_files, tables, economy_by_zone, monsters)
    report.note("%d checkable drop file(s), %d drop table(s), %d checkable economy "
                "file(s), %d Ledger Page item(s)%s"
                % (len(drop_files), len(tables), len(economies), pages,
                   "; nothing to check" if not (tables or economies or pages) else ""))
    faucet_report(report, root, schemas, tables, economy_by_zone)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
