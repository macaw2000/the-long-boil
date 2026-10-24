"""Check: Work Orders (work order 022, part 1).

Shape is the schema check's job, whether each asked item exists is the
references check's, the request line's word limit and banned words are the
style check's, and its reveal words are the reveal check's. This check reads
only Work Order files that match work_order/1 and tuning files that match
tuning.work_orders/1; a file that declares either family but does not match
fails here as not-checkable, because every rule below would be computed
without it.

For every Work Order (work_order/1):

- id-form: the id's zone part is a zone, and its faction part is the seal
  without its "favour." prefix (wo.rustmoor.board.x carries favour.board);
- the seal is a Favour quality in docs/canon/qualities.json (the "favour"
  group), and one a player has met by the order's act (ACT_NEW_SEALS: an act
  allows its own new seals and every earlier act's). An act with no entry
  fails as seals-unset rather than being guessed;
- reward.favour is FAVOUR_PER_ORDER;
- reward.crowns is at or below the zone's crown_ceiling, read from the
  zone's tuning.work_orders/* file. A zone with no such file, or a null
  ceiling, fails every order in it (crown-ceiling-unset): the draftsman
  derives the number (work order 022, part 2), this check never invents it;
- band.min <= band.max, and the band lies inside its zone's band
  (check_drops.ZONE_BAND, GDD section 6). A zone with no band fails as
  zone-band-unset;
- each item is asked at most once;
- each asked item is unbound: some economy file (tuning.economy/1 or /2)
  lists it, and none lists it as bound. An item no economy file lists fails
  as bound-unknown, since nothing says it is tradable;
- each asked item is made or dropped in the order's zone at or below the
  band (work order 022: "made or dropped in the order's zone at or below its
  band"). A source is an action of the order's zone (action.<zone>.*) whose
  skill is one of the zone's Work Order skills (ORDER_SKILLS; Rustmoor's are
  the five work order 022 names) and that outputs the item, or a drop table
  of a monster of the order's zone whose entries hold the item. A first-kill
  item is given once and is not a source. A source's level is the action's
  level_required or the monster's level, raised to the level its inputs need:
  each input must itself be made or dropped in the zone, or sold by the
  zone's grocer (grocer_price set in the zone's economy file; the grocer is
  never locked, so level 0). The item's level is its cheapest source's. It
  must be at most band[BAND_EDGE], the band's min, so a player at the bottom
  of the band can fill the order. Curios, story rewards and items bought
  only on the Exchange have no source and fail as no-source, which is how
  "no order asks for Curios ... or anything from the Exchange alone" is
  enforced. The grocer is not a source for an asked item itself: an order
  asks for what the zone's skills make or gather, or monster drops.

For every tuning.work_orders/1 file: the id's zone is its "zone", and a zone
has at most one such file.

When content/work_orders/ holds no orders, nothing above runs and the check
passes; the tuning files are still checked.

Usage: python3 scripts/validate/check_work_orders.py [--root DIR]
"""

import re
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import story  # noqa: E402
from check_drops import (  # noqa: E402
    CHECKABLE_ECONOMY_SCHEMAS, ECONOMY_SCHEMA_PREFIX, ZONE_BAND, _load, load_monsters,
    zone_of)
from check_references import item_ids  # noqa: E402

CHECK = "work_orders"

WORK_ORDER_PREFIX = "work_order/"
CHECKABLE_WORK_ORDER = ("work_order/1",)
TUNING_PREFIX = "tuning.work_orders/"
CHECKABLE_TUNING = ("tuning.work_orders/1",)
ACTION_PREFIX = "action/"
CHECKABLE_ACTION = ("action/1",)
DROPS_PREFIX = "drops/"
CHECKABLE_DROPS = ("drops/1",)

# Work order 022, "Seals in Act I": only factions a Layer 1 player has met.
# Act -> the seals first met in that act; an act allows its own and every
# earlier act's. Acts 2 and 3 are not set: the Chapel, the Polytechnic, the
# Vapourists and the Thunderhead "come with later acts", but which act each
# arrives in is not settled. Add an entry when it is.
ACT_NEW_SEALS = {
    1: ("favour.board", "favour.stokers", "favour.counting_house", "favour.gaugers"),
}

# The registry group whose names are faction seals.
SEAL_GROUP = "favour"

# Work order 022, part 1: "Favour per order is 1".
FAVOUR_PER_ORDER = 1

# Work order 022, "What an order asks": "items the Rustmoor skills make or
# gather (Smithing, Prospecting, Scavenging, Tinkering, Cooking)". Other zones
# are not set.
ORDER_SKILLS = {
    "rustmoor": ("smithing", "prospecting", "scavenging", "tinkering", "cooking"),
}

# Work order 022: "at or below its band", with each order sized "at the low
# end of its band" (part 2), so a player at the band's minimum must be able
# to fill it: an item's level may be at most the band's min (coordinator,
# 24 October 2026).
BAND_EDGE = "min"

# The grocer is never locked (GDD section 6), so a grocer input needs no level.
GROCER_LEVEL = 0

_ACTION_ZONE = re.compile(r"^action\.([a-z]+)\.")


def _action_zone(ident):
    match = _ACTION_ZONE.match(ident) if isinstance(ident, str) else None
    return match.group(1) if match else None


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def allowed_seals(act):
    """The seals allowed in act, or None when an act up to it is not set."""
    if not all(a in ACT_NEW_SEALS for a in range(1, act + 1)):
        return None
    out = []
    for a in range(1, act + 1):
        out.extend(ACT_NEW_SEALS[a])
    return out


class Sources:
    """Where each item is made or dropped, per zone."""

    def __init__(self, actions, drop_files, monsters, economies):
        self.made = {}     # (zone, item) -> [(level, label, [inputs])]
        self.grocer = set()  # (zone, item)
        for _path, data in actions:
            for action in data["actions"]:
                zone = _action_zone(action["id"])
                if action["skill"] not in ORDER_SKILLS.get(zone, ()):
                    continue
                inputs = [s["item"] for s in action["inputs"]]
                for stack in action["outputs"]:
                    self.made.setdefault((zone, stack["item"]), []).append(
                        (action["level_required"], action["id"], inputs))
        for _path, data in drop_files:
            for table in data["tables"]:
                monster = monsters.get(table["monster"])
                level = monster.get("level") if isinstance(monster, dict) else None
                if not _whole(level):
                    continue  # the schema and pacing checks report the monster
                zone = zone_of(table["monster"])
                for entry in table["entries"]:
                    self.made.setdefault((zone, entry["item"]), []).append(
                        (level, "a drop of %s" % table["monster"], []))
        for _path, data in economies:
            for item, row in data["items"].items():
                if row.get("grocer_price") is not None:
                    self.grocer.add((data["zone"], item))

    def level(self, zone, item, as_input=False, visiting=None):
        """(level, how) for the cheapest way to get item in zone, or None."""
        visiting = visiting or set()
        if (zone, item) in visiting:
            return None
        best = None
        if as_input and (zone, item) in self.grocer:
            best = (GROCER_LEVEL, "the grocer")
        for level, label, inputs in self.made.get((zone, item), []):
            need, ok = level, True
            for name in inputs:
                got = self.level(zone, name, True, visiting | {(zone, item)})
                if got is None:
                    ok = False
                    break
                need = max(need, got[0])
            if ok and (best is None or need < best[0]):
                best = (need, label)
        return best


def bound_states(economies):
    """{item: [(path, bound)]} across every checkable economy file."""
    out = {}
    for path, data in economies:
        for item, row in data["items"].items():
            out.setdefault(item, []).append((path, row["bound"]))
    return out


def check_tuning(report, tunings):
    """Returns {zone: (path or paths, crown_ceiling, file count)}; the ceiling
    is None when the zone has more than one file, since which one rules is
    unknown."""
    by_zone = {}
    for path, data in tunings:
        id_zone = data["id"].split(".")[1]
        if id_zone != data["zone"]:
            report.fail("tuning-id-zone", path, "id names zone %s but \"zone\" is %s"
                        % (id_zone, data["zone"]), data["id"])
        by_zone.setdefault(data["zone"], []).append((path, data))
    out = {}
    for zone in sorted(by_zone):
        files = by_zone[zone]
        if len(files) > 1:
            for path, data in files:
                report.fail("tuning-per-zone", path,
                            "zone %s has %d Work Order tuning files (%s); one per zone"
                            % (zone, len(files), ", ".join(p for p, _ in files)), data["id"])
            out[zone] = (", ".join(p for p, _ in files), None, len(files))
            continue
        path, data = files[0]
        out[zone] = (path, data["crown_ceiling"], 1)
    return out


def check_order(report, path, data, ctx):
    ident = data["id"]
    _wo, zone, faction, _name = ident.split(".")
    seal = data["seal"]

    if seal != "favour." + faction:
        report.fail("id-form", path, "id's faction part is %r but seal is %r; it must be %r"
                    % (faction, seal, "favour." + faction), ident)

    if seal not in ctx["seals"]:
        report.fail("seal-unknown", path, "seal %r is not in the %r group of %s"
                    % (seal, SEAL_GROUP, story.REGISTRY_PATH), ident)
    allowed = allowed_seals(data["act"])
    if allowed is None:
        report.fail("seals-unset", path,
                    "act %d has no seal list (ACT_NEW_SEALS sets acts %s); the seals met "
                    "by act %d are not settled" % (data["act"],
                    ", ".join(str(a) for a in sorted(ACT_NEW_SEALS)), data["act"]), ident)
    elif seal not in allowed:
        report.fail("seal-act", path, "seal %r is not one a player has met by act %d; "
                    "allowed: %s" % (seal, data["act"], ", ".join(allowed)), ident)

    favour = data["reward"]["favour"]
    if favour != FAVOUR_PER_ORDER:
        report.fail("favour", path, "/reward/favour is %d; every order pays %d"
                    % (favour, FAVOUR_PER_ORDER), ident)

    crowns = data["reward"]["crowns"]
    tuning = ctx["ceilings"].get(zone)
    if tuning is None or tuning[1] is None:
        if tuning is None:
            where = "zone %s has no %s* file under content/tuning/" % (zone, TUNING_PREFIX)
        elif tuning[2] > 1:
            where = "zone %s has %d Work Order tuning files (%s)" % (zone, tuning[2], tuning[0])
        else:
            where = "%s has crown_ceiling null" % tuning[0]
        report.fail("crown-ceiling-unset", path,
                    "/reward/crowns is %d but no Crown ceiling is set: %s"
                    % (crowns, where), ident)
    elif crowns > tuning[1]:
        report.fail("crown-ceiling", path, "/reward/crowns is %d; the ceiling in %s is %d"
                    % (crowns, tuning[0], tuning[1]), ident)

    band = data["band"]
    if band["min"] > band["max"]:
        report.fail("band-range", path, "/band: min %d is above max %d"
                    % (band["min"], band["max"]), ident)
    zone_band = ZONE_BAND.get(zone)
    if zone_band is None:
        report.fail("zone-band-unset", path, "zone %s has no level band "
                    "(check_drops.ZONE_BAND)" % zone, ident)
    elif band["min"] < zone_band[0] or band["max"] > zone_band[1]:
        report.fail("band-outside-zone", path, "/band is %d to %d; zone %s covers %d to %d"
                    % (band["min"], band["max"], zone, zone_band[0], zone_band[1]), ident)

    skills_set = zone in ORDER_SKILLS
    if not skills_set:
        report.fail("zone-skills-unset", path,
                    "zone %s has no Work Order skill list (ORDER_SKILLS sets %s), so no "
                    "asked item can be sourced" % (zone, ", ".join(sorted(ORDER_SKILLS))), ident)

    seen = {}
    for slot, stack in enumerate(data["asks"]):
        item = stack["item"]
        pointer = "/asks/%d" % slot
        if item in seen:
            report.fail("duplicate-ask", path, "%s asks for %s again (first at /asks/%d); "
                        "ask once with the total qty" % (pointer, item, seen[item]), ident)
            continue
        seen[item] = slot
        if item not in ctx["items"]:
            continue  # the references check reports it
        states = ctx["bound"].get(item)
        if not states:
            report.fail("bound-unknown", path,
                        "%s asks for %s, which no economy file lists, so nothing says it "
                        "is unbound" % (pointer, item), ident)
        else:
            bound_in = [p for p, b in states if b]
            if bound_in:
                report.fail("bound-item", path, "%s asks for %s, which is bound in %s"
                            % (pointer, item, ", ".join(bound_in)), ident)
        if not skills_set:
            continue
        got = ctx["sources"].level(zone, item)
        if got is None:
            report.fail("no-source", path,
                        "%s asks for %s, which no %s action (%s) makes and no %s monster's "
                        "drop table drops" % (pointer, item, zone,
                                              ", ".join(ORDER_SKILLS[zone]), zone), ident)
        elif got[0] > band[BAND_EDGE]:
            report.fail("above-band", path,
                        "%s asks for %s, first made or dropped in %s at level %d (%s); "
                        "band %s is %d" % (pointer, item, zone, got[0], got[1], BAND_EDGE,
                                           band[BAND_EDGE]), ident)


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    orders = _load(report, root, schemas, WORK_ORDER_PREFIX, CHECKABLE_WORK_ORDER,
                   "the Work Order rules")
    tunings = _load(report, root, schemas, TUNING_PREFIX, CHECKABLE_TUNING,
                    "the Crown ceiling rule")
    ceilings = check_tuning(report, tunings)
    if not orders:
        report.note("0 checkable Work Order(s), %d Work Order tuning file(s); nothing to check"
                    % len(tunings))
        return report

    names, _types, error = story.load_registry(root)
    if error:
        report.fail("registry-unreadable", story.REGISTRY_PATH, error)
        return report
    economies = _load(report, root, schemas, ECONOMY_SCHEMA_PREFIX, CHECKABLE_ECONOMY_SCHEMAS,
                      "the unbound and grocer rules")
    actions = _load(report, root, schemas, ACTION_PREFIX, CHECKABLE_ACTION,
                    "the made-in-zone rule")
    drop_files = _load(report, root, schemas, DROPS_PREFIX, CHECKABLE_DROPS,
                       "the dropped-in-zone rule")
    ctx = {
        "seals": sorted(n for n, kind in names.items() if kind == SEAL_GROUP),
        "ceilings": ceilings,
        "items": item_ids(root),
        "bound": bound_states(economies),
        "sources": Sources(actions, drop_files, load_monsters(root), economies),
    }
    for path, data in orders:
        check_order(report, path, data, ctx)
    by_seal = {}
    for _path, data in orders:
        by_seal[data["seal"]] = by_seal.get(data["seal"], 0) + 1
    report.note("%d checkable Work Order(s) (%s), %d Work Order tuning file(s)"
                % (len(orders), ", ".join("%s %d" % (s, by_seal[s]) for s in sorted(by_seal)),
                   len(tunings)))
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
