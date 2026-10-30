"""Check: the combat model against monster stats and gear (work order 010).

Reads every constant from the one content file whose schema is
tuning.combat/1 (content/tuning/combat.json) and the secondary level from the
one valid tuning.xp_curve/1 curve. No simulation: the closed forms are used as
written, with continuous moments (combat.json units.closed_forms_for_checks,
settled with revision 2).

Gear files (gear/1 and gear/2, under content/gear/), checked whether or not
any monster uses them, by the rules in scripts/validate/gear.py (row order,
row +0 present, which stats each slot's rows carry, style only on weapons,
skill only on tools, one entry per item). A gear/* file that is neither
version, or does not match it, fails as not-checkable. Gear entries that
break a rule are left out of the reference gear.

Monsters on monster/2 (monster/1 files are counted and skipped; they carry no
combat stats until work order 011 moves them). For each one, the reference
player at the monster's level L (combat.json reference_player):

- main style skill at L, the style being the monster's weakness; Vitality,
  Pressure, Precision, Fortitude and the two other styles at the curve's
  secondary level S, the highest S with
  total_xp(S) <= total_xp(L) * OTHER_COMBAT_SKILLS_SHARE_EACH / MAIN_COMBAT_SKILL_SHARE;
- reference gear (Jeremy, answers to work order 010): only gear whose item
  is in the monster's zone (the zone in the item id, item.<zone>.<name>,
  equals the one in the monster id) counts, and a boss's own drops (any item
  in a drops/* table for that boss, in its entries or first_kill) never count
  for that boss;
- weapon: of that gear, the +0 weapon of the monster's weakness style with
  level_required <= L that gives the highest mean swing damage against this
  monster (ties to the lower item id). Only weakness-style weapons count for
  the reference player. None is a FAIL (no-weakness-gear): the target cannot
  be reached;
- the one exception (combat.json boss.reference_weapon, revision 8, work
  order 025): a boss listed there, {monster id: {"item": item id, ...}}, keys
  starting with "_" being prose, is fought with that item at +0 instead of
  the best weapon. The listed item must be a gear weapon entry that keeps
  the gear rules (reference-weapon-missing), of the boss's weakness style
  (reference-weapon-style), with level_required <= the boss's level
  (reference-weapon-level), and not one of the boss's own drops
  (reference-weapon-own-drop). Each broken rule is a FAIL and the boss's win
  chance is not computed. A listed id that is not a monster/2 boss is a FAIL
  (reference-weapon-not-boss), as is an entry without an "item" id
  (reference-weapon-shape). The zone rule above is not applied to the listed
  item;
- the six other combat slots (combat.json revision 10, gear.reference_gear):
  of that gear, in each of off_hand, head, body, hands and feet the +0 piece
  with the most armour, and in charm the +0 piece with the most accuracy,
  whose level_required is at or below the reference player's combat level,
  the highest of Melee, Marksmanship and Aetherics, which is L
  (gear.combat_level.reference). Ties go to the lower item id. A slot with
  no such piece is empty and gives 0; one WARN per monster (empty-slots)
  names the empty slots. A boss's six are what work order 025's Act I walk
  holds (boss.reference_weapon._non_weapon_slots); none are listed yet, so
  they are empty, with an empty-slots WARN saying so;
- the legacy armour slot (gear.legacy_armour_slot, until the Cinderworks
  armour moves into slots): of that gear, the +0 armour piece with the most
  armour whose level_required is at or below the player's Fortitude, S, as
  in revision 9. None gives 0, without a WARN: no new gear is drafted on it;
- the player's armour is Fortitude plus the sum of the five armour slots and
  the legacy piece; their accuracy is style level plus Precision plus the
  weapon's and the Charm's accuracy;
- Rations stocked, healing RATION_HEAL_HP each. While it is null (open,
  Cooking work order), everything that needs it is a WARN
  (ration-heal-open), not computed.

Non-boss monsters: the stocked computed seconds per kill,
BETWEEN_KILLS_S + t_pure / (1 - f), must be within
KILL_TIME_TOLERANCE_FRACTION of seconds_per_kill. This compares the
unfloored time, as combat.json kill_time.target states the target. The
floored expected time is printed beside it, by kill_time.floor (revision
10):

  expected = max(computed, seconds_per_kill x max(KILL_TIME_CAP_FRACTION,
                                                 min(1, gear_ratio)))

gear_ratio = T_own / T_ref (kill_time.floor.gear_ratio): T_own is the
stocked computed time with the loadout shown; T_ref is the fastest of the
three styles' reference loadouts for the same player's levels, Rations
stocked: in each style s, the +0 weapon of s with level_required <= the
player's level in s and the highest mean swing (style level s in max_hit and
accuracy), plus the best +0 piece in each of off_hand, head, body, hands,
feet and charm at or below combat level. T_ref draws on every zone, boss
drops included, and leaves out the legacy armour slot. A style with no
weapon is left out of the minimum. For the reference player gear_ratio is at
least 1, so expected is max(computed, seconds_per_kill), as before revision
10. Bosses keep the old floor: a won
attempt is never shorter than seconds_per_kill. KILL_TIME_CAP_FRACTION is
read from combat.json kill_time.floor.KILL_TIME_CAP_FRACTION.value (not yet a
constant, as the model says); with monster/2 monsters, anything but a number
in (0, 1] there is a FAIL (kill-time-cap), and every floored time then uses
gear_ratio 1. Comparing the floored time instead would let a monster that
dies too fast pass, since the floor lifts it to exactly the target. f >= 1
is a FAIL (ration-diverges): the stocked fight never ends.

Bosses: the win chance with BOSS_RATION_CAP_PER_ATTEMPT Rations must be within
WIN_CHANCE_TOLERANCE of BOSS_TARGET_WIN_CHANCE.

Both tolerances were set by Jeremy in answer to work order 010. If either is
ever set back to None, its comparisons become WARN lines, not enforced, as
check_xp_curve does with BAND_DAYS_TOLERANCE. Within tolerance is a NOTE.

NOTE lines, per monster: the kill time (bosses: the win chance) with each
unmatched style's best weapon from the same reference gear, Rations stocked.
These are for information only and never feed the reference player; for a
boss with a listed reference weapon, the win chance with the best weapon
(the one gear.reference_gear would pick), Rations stocked; and the matched
kill time (win chance) without Rations. Each kill time is shown computed and
floored. For a non-boss monster, when gear beyond the reference exists, one
more NOTE shows the cap at work (over-geared): the same player with the best
piece in every slot from any zone and at any calibration row that is not
null, under the same level gates, its gear_ratio and its expected time. It is
printed only when gear_ratio < 1.

With no monster/2 monsters there is nothing to check, and neither the model
nor the curve is needed.

Usage: python3 scripts/validate/check_combat.py [--root DIR]
"""

import math
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_pacing  # noqa: E402
import gear as gearlib  # noqa: E402

CHECK = "combat"

MODEL_PREFIX = "tuning.combat/"
MODEL_SCHEMA = "tuning.combat/1"
MONSTER_PREFIX = "monster/"
COMBAT_MONSTER_SCHEMA = "monster/2"
DROPS_PREFIX = "drops/"

# combat.json revision 10, kill_time.floor: over-gearing may beat
# seconds_per_kill down to this fraction of it. Settled at 0.75, but not yet
# a constant (tuning.combat/1 allows no new one), so it is read from
# kill_time.floor.KILL_TIME_CAP_FRACTION.value, where the model keeps it.
CAP_KEY = "KILL_TIME_CAP_FRACTION"

# The slots worn by combat level, and the legacy one worn by Fortitude.
ARMOUR_SLOTS = gearlib.ARMOUR_SLOTS
COMBAT_LEVEL_SLOTS = gearlib.COMBAT_LEVEL_SLOTS
LEGACY_ARMOUR = gearlib.LEGACY_ARMOUR

# GDD section 6: "Monsters are weak to Melee, Marksmanship, or Aetherics".
STYLES = ("melee", "marksmanship", "aetherics")
# Work order 010, scope 3: exactly 21 calibration rows, +0 to +20.
CALIBRATION_ROWS = 21

# How far the reference player's stocked computed seconds per kill may fall
# from seconds_per_kill, as a fraction of seconds_per_kill, compared on the
# unfloored computed time. Set by Jeremy in answer to work order 010.
KILL_TIME_TOLERANCE_FRACTION = 0.05

# How far a boss's win chance may fall from BOSS_TARGET_WIN_CHANCE, in
# probability, absolute: 0.05 around a 0.5 target is 45% to 55%. Set by
# Jeremy in answer to work order 010.
WIN_CHANCE_TOLERANCE = 0.05

# combat.json constants the formulas read, every one required by
# tuning.combat/1 as a number.
RATION_KEY = "RATION_HEAL_HP"


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------


def _declared(data):
    declared = data.get("schema") if isinstance(data, dict) else None
    return declared if isinstance(declared, str) else ""


def _files(root, prefix):
    """[(path, data, declared)] for every content file declaring prefix*."""
    out = []
    for path in lib.content_files(root):
        data, error = lib.load_json(root, path)
        if error:
            continue  # the schema check reports unparseable files
        declared = _declared(data)
        if declared.startswith(prefix):
            out.append((path, data, declared))
    return out


load_gear = gearlib.load_gear  # the drops check reads gear through here


class GearSet:
    """The gear that keeps the gear rules, any zone, by slot.

    weapons: [(item, style, level_required, power, accuracy)] at +0;
    legacy: [(item, level_required, armour)] at +0, the legacy armour slot;
    pieces: {slot: [(item, level_required, stat)]} at +0 for each slot worn
    by combat level, stat being armour (charm: accuracy);
    best_rows: the same three, but each entry at every calibration row that
    is not null, for the over-geared NOTE ((item, calibration) in place of
    item)."""

    def __init__(self, gear):
        self.weapons, self.legacy, self.pieces = [], [], dict((s, []) for s in COMBAT_LEVEL_SLOTS)
        self.cal_weapons, self.cal_legacy = [], []
        self.cal_pieces = dict((s, []) for s in COMBAT_LEVEL_SLOTS)
        self.tools = 0
        for _path, e in gear:
            slot, item, req = e["slot"], e["item"], e["level_required"]
            if slot == gearlib.TOOL:
                self.tools += 1
                continue
            for n, row in enumerate(e["stats_by_calibration"]):
                if row is None:
                    continue
                if slot == gearlib.WEAPON:
                    found = (e["style"], req, row["power"], row["accuracy"])
                    if n == 0:
                        self.weapons.append((item,) + found)
                    self.cal_weapons.append(((item, n),) + found)
                elif slot == LEGACY_ARMOUR:
                    if n == 0:
                        self.legacy.append((item, req, row["armour"]))
                    self.cal_legacy.append(((item, n), req, row["armour"]))
                else:
                    stat = row[gearlib.ROW_STATS[slot][0]]
                    if n == 0:
                        self.pieces[slot].append((item, req, stat))
                    self.cal_pieces[slot].append(((item, n), req, stat))
        for listed in [self.weapons, self.legacy, self.cal_weapons, self.cal_legacy] + \
                list(self.pieces.values()) + list(self.cal_pieces.values()):
            listed.sort()

    def slot_count(self, slot):
        return len(self.pieces[slot])


def load_cap(report, path, data):
    """KILL_TIME_CAP_FRACTION from the model's kill_time.floor, or None after
    a FAIL (kill-time-cap)."""
    floor = data.get("kill_time", {}).get("floor") if isinstance(data.get("kill_time"), dict) else None
    entry = floor.get(CAP_KEY) if isinstance(floor, dict) else None
    value = entry.get("value") if isinstance(entry, dict) else None
    if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 < value <= 1:
        return value
    report.fail("kill-time-cap", path,
                "kill_time.floor.%s.value is %r; the kill-time rule needs a number in "
                "(0, 1] (combat.json revision 10), so every floored time here uses "
                "gear_ratio 1 and no over-geared time is shown"
                % (CAP_KEY, value), data.get("id"))
    return None


def zone_of(ident):
    """The zone in an id of the form <kind>.<zone>.<name>, or None."""
    parts = ident.split(".") if isinstance(ident, str) else []
    return parts[1] if len(parts) >= 3 else None


def load_boss_drops(root):
    """{monster id: set of item ids in its drop tables' entries and
    first_kill}, read leniently from every drops/* file; the schema,
    references and drops checks report their shape."""
    out = {}
    for _path, data, _declared in _files(root, DROPS_PREFIX):
        tables = data.get("tables")
        for table in tables if isinstance(tables, list) else []:
            if not isinstance(table, dict) or not isinstance(table.get("monster"), str):
                continue
            got = out.setdefault(table["monster"], set())
            entries = table.get("entries")
            for entry in entries if isinstance(entries, list) else []:
                if isinstance(entry, dict) and isinstance(entry.get("item"), str):
                    got.add(entry["item"])
            first = table.get("first_kill")
            for item in first if isinstance(first, list) else []:
                if isinstance(item, str):
                    got.add(item)
    return out


def load_monsters(report, root, schemas):
    """Returns (monster/1 file count, [(path, monster)] on monster/2)."""
    old_files, out = 0, []
    for path, data, declared in _files(root, MONSTER_PREFIX):
        if declared == "monster/1":
            old_files += 1
            continue
        if declared != COMBAT_MONSTER_SCHEMA:
            continue  # the schema and pacing checks report unknown versions
        errors = lib.validate(data, schemas[COMBAT_MONSTER_SCHEMA])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "its monsters are not combat-checked"
                        % (COMBAT_MONSTER_SCHEMA, len(errors)))
            continue
        for monster in data["monsters"]:
            out.append((path, monster))
    return old_files, out


def load_model(report, root, schemas):
    """Returns (path, constants) where constants maps NAME -> value, or
    (None, None) after reporting why."""
    path, data = load_model_file(report, root, schemas)
    if data is None:
        return None, None
    return path, dict((k, v["value"]) for k, v in data["constants"].items())


def load_reference_weapons(report, path, data, monsters):
    """{boss id: item id} from the model's boss.reference_weapon (revision 8,
    work order 025). Keys starting with "_" are prose. An entry that is not
    {"item": "<id>", ...}, or that names no monster/2 boss, is a FAIL and is
    left out."""
    boss = data.get("boss")
    listed = boss.get("reference_weapon") if isinstance(boss, dict) else None
    if listed is None:
        return {}
    if not isinstance(listed, dict):
        report.fail("reference-weapon-shape", path,
                    "boss.reference_weapon must be an object of {monster id: {\"item\": "
                    "item id}}", data.get("id"))
        return {}
    bosses = set(m["id"] for _p, m in monsters if m["boss"])
    others = set(m["id"] for _p, m in monsters if not m["boss"])
    out = {}
    for ident in sorted(listed):
        if ident.startswith("_"):
            continue
        entry = listed[ident]
        if not isinstance(entry, dict) or not isinstance(entry.get("item"), str):
            report.fail("reference-weapon-shape", path,
                        "boss.reference_weapon[%r] must be an object with an \"item\" id"
                        % ident, ident)
            continue
        if ident not in bosses:
            report.fail("reference-weapon-not-boss", path,
                        "boss.reference_weapon lists %s, which is %s; only a boss's "
                        "reference weapon can be set"
                        % (ident, "not a boss" if ident in others
                           else "no monster on %s" % COMBAT_MONSTER_SCHEMA), ident)
            continue
        out[ident] = entry["item"]
    return out


def load_model_file(report, root, schemas):
    """Returns (path, data) for the one valid model file, or (None, None)
    after reporting why."""
    found, bad = [], []
    for path, data, declared in _files(root, MODEL_PREFIX):
        if declared == MODEL_SCHEMA and not lib.validate(data, schemas[MODEL_SCHEMA]):
            found.append((path, data))
        else:
            bad.append(path)
    if len(found) == 1:
        return found[0]
    if not found:
        report.fail("no-model", ", ".join(bad) or "-",
                    "monster/2 monsters exist but no file is a valid %s model%s"
                    % (MODEL_SCHEMA,
                       " (these declare tuning.combat/* but are not a valid %s; see the "
                       "schema check)" % MODEL_SCHEMA if bad else ""))
    else:
        report.fail("many-models", ", ".join(p for p, _ in found),
                    "%d valid %s files; the combat check needs exactly one"
                    % (len(found), MODEL_SCHEMA))
    return None, None


def secondary_levels(curve, c):
    """{L: S} from the curve table (combat.json reference_player)."""
    total = dict((row["level"], row["total_xp"]) for row in curve["table"])
    ratio = c["OTHER_COMBAT_SKILLS_SHARE_EACH"] / c["MAIN_COMBAT_SKILL_SHARE"]
    out = {}
    for level in sorted(total):
        allowed = total[level] * ratio
        out[level] = max(s for s in total if total[s] <= allowed)
    return out


# --------------------------------------------------------------------------
# The model's closed forms (combat.json player_formulas, monster_stats_shape,
# kill_time, boss)
# --------------------------------------------------------------------------


class Player:
    def __init__(self, c, level, secondary, weapon, armour_points, charm_accuracy=0):
        self.level = level
        self.secondary = secondary
        self.weapon = weapon  # (item, style, power, accuracy)
        self.max_hp = c["HP_BASE"] + c["HP_PER_VITALITY"] * secondary
        self.crit = min(c["CRIT_CHANCE_CAP"], c["CRIT_CHANCE_PER_PRECISION"] * secondary)
        self.pressure_mult = 1 + c["PRESSURE_DAMAGE_PER_LEVEL"] * secondary
        self.armour = secondary + armour_points
        self.charm_accuracy = charm_accuracy


def swing(c, player, monster):
    """(mean, second moment) of the player's swing damage against monster."""
    _item, style, power, accuracy_bonus = player.weapon
    accuracy = player.level + player.secondary + accuracy_bonus + player.charm_accuracy
    hit = c["HIT_CHANCE_BASE"] + c["HIT_CHANCE_PER_POINT"] * (accuracy - monster["evasion"])
    hit = min(c["HIT_CHANCE_MAX"], max(c["HIT_CHANCE_MIN"], hit))
    max_hit = (power + c["DAMAGE_PER_STYLE_LEVEL"] * player.level) * player.pressure_mult
    if style == monster["weakness"]:
        max_hit *= c["WEAKNESS_MULTIPLIER"]
    mean = hit * (max_hit / 2.0) * (1 + (c["CRIT_MULTIPLIER"] - 1) * player.crit)
    second = hit * (max_hit ** 2 / 3.0) * (1 - player.crit
                                           + c["CRIT_MULTIPLIER"] ** 2 * player.crit)
    return mean, second


def monster_swing(c, player, monster):
    """(mean, second moment) of the monster's swing damage after armour."""
    taken = 1 - player.armour / (player.armour + c["ARMOUR_HALF_POINT"])
    top = monster["max_hit"] * taken
    mean = monster["hit_chance"] * top / 2.0
    second = monster["hit_chance"] * top ** 2 / 3.0
    return mean, second


class Fight:
    """One reference fight's figures. Times are None when not computable."""

    def __init__(self, c, player, monster, heal):
        self.mean, self.second = swing(c, player, monster)
        self.m_mean, self.m_second = monster_swing(c, player, monster)
        self.m_dps = self.m_mean / monster["attack_interval_s"]
        self.heal = heal
        self.c, self.player, self.monster = c, player, monster

    def damaging(self):
        return self.mean > 0 and self.player.max_hp > 0

    def t_pure(self):
        return self.monster["hp"] / (self.mean / self.c["PLAYER_ATTACK_INTERVAL_S"])

    def drag(self):
        return self.m_dps * self.c["PLAYER_ATTACK_INTERVAL_S"] / self.heal

    def stocked(self):
        """Computed seconds per kill with Rations, or None if f >= 1."""
        f = self.drag()
        if f >= 1:
            return None
        return self.c["BETWEEN_KILLS_S"] + self.t_pure() / (1 - f)

    def unstocked(self):
        """(computed seconds per kill, knockouts per kill) without Rations."""
        t = self.t_pure()
        k = self.m_dps * t / self.player.max_hp
        return self.c["BETWEEN_KILLS_S"] + t + k * (self.c["KNOCKOUT_RESPAWN_S"] + t / 2), k

    def win_chance(self, rations):
        """(P, BETWEEN_KILLS_S + m_p) for a boss fight with n Rations."""
        c, interval = self.c, self.c["PLAYER_ATTACK_INTERVAL_S"]
        hp = self.monster["hp"]
        n = rations
        m_p = interval * hp / self.mean + n * interval
        v_p = interval ** 2 * hp * (self.second - self.mean ** 2) / self.mean ** 3
        pool = self.player.max_hp + n * (self.heal if n else 0)
        b_interval = self.monster["attack_interval_s"]
        m_b = b_interval * pool / self.m_mean
        v_b = b_interval ** 2 * pool * (self.m_second - self.m_mean ** 2) / self.m_mean ** 3
        z = (m_b - m_p) / math.sqrt(v_p + v_b)
        return 0.5 * (1 + math.erf(z / math.sqrt(2))), c["BETWEEN_KILLS_S"] + m_p


# --------------------------------------------------------------------------
# Per monster
# --------------------------------------------------------------------------


def _best_weapon(c, weapons, style, player_args, monster):
    """The weapon of style with level_required <= the player's level (the
    first of player_args) and the highest mean swing against monster; ties
    to the lower item id. None if there is none. weapons are (item, style,
    level_required, power, accuracy); item may be (item, calibration)."""
    level, secondary, armour_points, charm = player_args
    best = None
    for item, wstyle, required, power, accuracy in weapons:
        if wstyle != style or required > level:
            continue
        weapon = (item, wstyle, power, accuracy)
        mean, _ = swing(c, Player(c, level, secondary, weapon, armour_points, charm), monster)
        key = (-mean, item)
        if best is None or key < best[0]:
            best = (key, weapon)
    return best[1] if best else None


def _best_piece(pieces, gate, keep=None):
    """(item, stat) of the piece with the highest stat and level_required <=
    gate, ties to the lower item; None if none. pieces are (item,
    level_required, stat)."""
    best = None
    for item, required, stat in pieces:
        if required > gate or (keep is not None and not keep(item)):
            continue
        if best is None or (-stat, item) < (-best[1], best[0]):
            best = (item, stat)
    return best


def _label(item):
    """An item id, or "<id> +<n>" for a calibrated row."""
    return item if isinstance(item, str) else "%s +%d" % item


class Loadout:
    """The non-weapon slots of one loadout: legacy, (item, armour) or None,
    the legacy armour slot (worn by Fortitude); slots, {slot: (item, stat) or
    None} for each slot worn by combat level. armour_points is the legacy
    piece plus the five armour slots; charm is the Charm's accuracy."""

    def __init__(self, legacy, slots):
        self.legacy = legacy
        self.slots = slots
        self.armour_points = legacy[1] if legacy else 0
        for slot in ARMOUR_SLOTS:
            if slots.get(slot):
                self.armour_points += slots[slot][1]
        self.charm = slots[gearlib.CHARM][1] if slots.get(gearlib.CHARM) else 0

    def empty(self):
        return [s for s in COMBAT_LEVEL_SLOTS if not self.slots.get(s)]

    def args(self, level, secondary):
        return (level, secondary, self.armour_points, self.charm)

    def text(self):
        """", armour X" exactly as before revision 10 when no slot worn by
        combat level is filled; otherwise every slot, the empty ones named."""
        legacy = _label(self.legacy[0]) if self.legacy else "none"
        filled = [s for s in COMBAT_LEVEL_SLOTS if self.slots.get(s)]
        if not filled:
            return ", armour %s" % legacy
        out = ", legacy armour %s" % legacy
        for s in filled:
            out += ", %s %s" % (s, _label(self.slots[s][0]))
        if self.empty():
            out += " (empty: %s)" % ", ".join(self.empty())
        return out + "; armour points %s, charm accuracy %s" % (
            _num(self.armour_points), _num(self.charm))


def _loadout(legacy, pieces, sec, combat_level, keep=None):
    return Loadout(_best_piece(legacy, sec, keep),
                   dict((s, _best_piece(pieces[s], combat_level, keep))
                        for s in COMBAT_LEVEL_SLOTS))


def expected_seconds(computed, target, ratio, cap, boss):
    """kill_time.floor (revision 10): max(computed, seconds_per_kill x
    max(cap, min(1, gear_ratio))). Bosses, an unset cap or an unknown ratio
    keep the old floor, max(computed, seconds_per_kill)."""
    if boss or cap is None or ratio is None or ratio >= 1:
        return max(target, computed)
    return max(computed, target * max(cap, ratio))


def _times(seconds, target, ratio=None, cap=None, boss=False):
    return "computed %.1f s, floored %.1f s" % (
        seconds, expected_seconds(seconds, target, ratio, cap, boss))


class Reference:
    """The reference player's setup against one monster (the rules in this
    module's docstring), shared with the drops check's grocer sink report
    (work order 013) so both read the same player. level_ok is False when the
    monster's level is not in the curve table; weapon is None when no
    weakness-style weapon qualifies, or when the boss's listed reference
    weapon breaks a rule (listed_problems, [(rule, text)]); armour is the
    legacy armour piece, or None. loadout holds every non-weapon slot; a
    boss's six slots worn by combat level are empty (boss_slots_empty) until
    work order 030 records what work order 025's Act I walk holds.
    best_weapon is the gear.reference_gear weapon, which is the weapon unless
    the boss is in reference_weapons ({boss id: item id}, combat.json
    boss.reference_weapon); listed is that item, or None.

    reference_time is the gear_ratio denominator (combat.json
    kill_time.floor, Jeremy, 30 October 2026): the fastest of the three
    styles' reference loadouts for the player's own levels, each the best +0
    weapon of that style at or below the player's level in it plus the best
    +0 piece in each of the six other gear.loadout slots (not the legacy
    armour slot), all from any zone, boss drops counting like any other
    piece, Rations stocked (kill_time.floor.gear_ratio.T_ref and .pool). None
    for a boss, or when no style's loadout can be computed."""

    def __init__(self, c, sec_of, gearset, boss_drops, m, reference_weapons=None):
        ident, level = m["id"], m["level"]
        self.zone = zone_of(ident)
        self.banned = boss_drops.get(ident, set()) if m["boss"] else set()

        def keep(item):
            return zone_of(item) == self.zone and item not in self.banned
        self.weapons = [w for w in gearset.weapons if keep(w[0])]
        self.level_ok = level in sec_of
        self.armour = self.weapon = self.player = self.best_weapon = None
        self.loadout = None
        self.reference_time = None
        self.boss_slots_empty = bool(m["boss"])
        self.listed = (reference_weapons or {}).get(ident) if m["boss"] else None
        self.listed_problems = []
        if not self.level_ok:
            return
        self.sec = sec_of[level]
        # combat_level = max(melee, marksmanship, aetherics): main at L, the
        # other two at S <= L (gear.combat_level.reference).
        self.combat_level = max(level, self.sec)
        pieces = gearset.pieces
        if m["boss"]:
            pieces = dict((s, []) for s in COMBAT_LEVEL_SLOTS)
        self.loadout = _loadout(gearset.legacy, pieces, self.sec, self.combat_level, keep)
        self.armour = self.loadout.legacy
        self.armour_points = self.loadout.armour_points
        self.charm = self.loadout.charm
        self.args = self.loadout.args(level, self.sec)
        self.best_weapon = _best_weapon(c, self.weapons, m["weakness"], self.args, m)
        if self.listed is None:
            self.weapon = self.best_weapon
        else:
            self.weapon = self._listed_weapon(gearset.weapons, m)
        if self.weapon is not None:
            self.player = Player(c, level, self.sec, self.weapon, self.armour_points,
                                 self.charm)
        if not m["boss"] and c[RATION_KEY] is not None:
            self.reference_time = self._reference_time(c, gearset, m)

    def _reference_time(self, c, gearset, m):
        level, sec = m["level"], self.sec
        # T_ref counts only gear.loadout's six slots; the legacy slot does not.
        every = _loadout([], gearset.pieces, sec, self.combat_level)
        times = []
        for style in STYLES:
            style_level = level if style == m["weakness"] else sec
            args = every.args(style_level, sec)
            w = _best_weapon(c, gearset.weapons, style, args, m)
            if w is None:
                continue
            fight = Fight(c, Player(c, style_level, sec, w, every.armour_points, every.charm),
                          m, c[RATION_KEY])
            seconds = fight.stocked() if fight.damaging() else None
            if seconds is not None:
                times.append(seconds)
        return min(times) if times else None

    def gear_ratio(self, seconds):
        """Stocked computed seconds with some loadout / reference_time, or
        None when either is unknown."""
        if seconds is None or not self.reference_time:
            return None
        return seconds / self.reference_time

    def _listed_weapon(self, all_weapons, m):
        """The listed weapon as (item, style, power, accuracy), or None after
        recording each rule it breaks in listed_problems."""
        item = self.listed
        found = [w for w in all_weapons if w[0] == item]
        if not found:
            self.listed_problems.append((
                "reference-weapon-missing",
                "boss.reference_weapon is %s, which has no gear weapon entry that "
                "keeps the gear rules" % item))
            return None
        _item, style, required, power, accuracy = found[0]
        if style != m["weakness"]:
            self.listed_problems.append((
                "reference-weapon-style",
                "boss.reference_weapon %s has style %s; the boss is weak to %s"
                % (item, style, m["weakness"])))
        if required > m["level"]:
            self.listed_problems.append((
                "reference-weapon-level",
                "boss.reference_weapon %s needs level %d; the boss is level %d"
                % (item, required, m["level"])))
        if item in self.banned:
            self.listed_problems.append((
                "reference-weapon-own-drop",
                "boss.reference_weapon %s is in this boss's own drop table; a boss's "
                "own drops never count for it" % item))
        if self.listed_problems:
            return None
        return (item, style, power, accuracy)


def check_monster(report, c, sec_of, gearset, boss_drops, path, m,
                  reference_weapons=None, cap=None):
    ident, level, style = m["id"], m["level"], m["weakness"]
    ref = Reference(c, sec_of, gearset, boss_drops, m, reference_weapons)
    zone, banned, weapons = ref.zone, ref.banned, ref.weapons
    target = m["seconds_per_kill"]
    heal = c[RATION_KEY]
    if not ref.level_ok:
        report.fail("level-off-curve", path,
                    "level %d is not in the curve table" % level, ident)
        return
    sec, loadout = ref.sec, ref.loadout
    empty = loadout.empty()
    if m["boss"]:
        report.warn("empty-slots", path,
                    "a boss's %s are what work order 025's Act I walk holds "
                    "(boss.reference_weapon._non_weapon_slots), and none are listed yet "
                    "(work order 030); they are empty and give 0" % ", ".join(empty), ident)
    elif empty:
        report.warn("empty-slots", path,
                    "no +0 %s piece with level_required <= %d (the reference player's "
                    "combat level at level %d) in %s; %s 0"
                    % (zone, ref.combat_level, level, ", ".join(empty),
                       "it gives" if len(empty) == 1 else "they give"), ident)
    args, weapon = ref.args, ref.weapon
    if ref.listed_problems:
        for rule, text in ref.listed_problems:
            report.fail(rule, path, "%s; its win chance is not computed" % text, ident)
        return
    if weapon is None:
        report.fail("no-weakness-gear", path,
                    "no +0 %s %s weapon with level_required <= %d%s, so the reference "
                    "player cannot fight it matched and its target cannot be reached"
                    % (zone, style, level,
                       ", leaving out the boss's own drops" if banned else ""), ident)
        return
    player = ref.player
    fight = Fight(c, player, m, heal)
    if not fight.damaging():
        report.fail("no-damage", path,
                    "the reference player's mean swing with %s is 0 (or max_hp is 0); "
                    "nothing can be computed" % weapon[0], ident)
        return
    who = ("reference player main %s %d, other six %d, max_hp %s, %s%s%s"
           % (style, level, sec, _num(player.max_hp), weapon[0],
              " (boss.reference_weapon)" if ref.listed else "", loadout.text()))
    heal_open = ("%s is %s in the combat model (Cooking work order)"
                 % (RATION_KEY, "null" if heal is None else heal))

    def make(w, lo=loadout, lvl=level):
        return Player(c, lvl, sec, w, lo.armour_points, lo.charm)

    if m["boss"]:
        _check_boss(report, c, path, m, fight, who, heal, heal_open)
    else:
        _check_kill(report, path, m, fight, who, heal, heal_open, ref, cap)

    # NOTE lines: each unmatched style, Rations stocked; matched without Rations.
    for other in STYLES:
        if other == style:
            continue
        w = _best_weapon(c, weapons, other, args, m)
        label = "%s: unmatched (%s), Rations stocked" % (ident, other)
        if w is None:
            report.note("%s: no +0 %s %s weapon at level %d" % (label, zone, other, level))
            continue
        uf = Fight(c, make(w), m, heal)
        if not uf.damaging():
            report.note("%s with %s: mean swing is 0" % (label, w[0]))
        elif heal is None:
            report.note("%s with %s: not computed, %s" % (label, w[0], heal_open))
        elif m["boss"]:
            p, t = uf.win_chance(c["BOSS_RATION_CAP_PER_ATTEMPT"])
            report.note("%s with %s: win chance %.3f" % (label, w[0], p))
        else:
            s = uf.stocked()
            report.note("%s with %s: %s" % (
                label, w[0], "never ends (f >= 1)" if s is None
                else _times(s, target, ref.gear_ratio(s), cap)))
    if ref.listed:
        best = ref.best_weapon
        label = ("%s: matched with the best weapon (gear.reference_gear), Rations stocked"
                 % ident)
        if best is None:
            report.note("%s: no +0 %s %s weapon with level_required <= %d%s"
                        % (label, zone, style, level,
                           ", leaving out the boss's own drops" if banned else ""))
        else:
            bf = Fight(c, make(best), m, heal)
            if not bf.damaging():
                report.note("%s with %s: mean swing is 0" % (label, best[0]))
            elif heal is None and c["BOSS_RATION_CAP_PER_ATTEMPT"] > 0:
                report.note("%s with %s: not computed, %s" % (label, best[0], heal_open))
            else:
                p, t = bf.win_chance(c["BOSS_RATION_CAP_PER_ATTEMPT"])
                report.note("%s with %s: win chance %.3f" % (label, best[0], p))
    if m["boss"]:
        p, t = fight.win_chance(0)
        report.note("%s: matched, without Rations: win chance %.3f" % (ident, p))
    else:
        # gear_ratio compares stocked fights with the same gear: 1 here.
        s, k = fight.unstocked()
        report.note("%s: matched, without Rations: %s, %.2f knockouts per kill"
                    % (ident, _times(s, target), k))
        _over_geared(report, c, gearset, ref, m, heal, cap)


def _over_geared(report, c, gearset, ref, m, heal, cap):
    """The NOTE showing kill_time.floor's cap at work: the same player with
    the best piece in every slot from any zone at any calibration row that is
    not null, under the same gates. Printed only when gear_ratio < 1."""
    if heal is None or cap is None or not ref.reference_time:
        return
    level, sec = m["level"], ref.sec
    lo = _loadout(gearset.cal_legacy, gearset.cal_pieces, sec, ref.combat_level)
    w = _best_weapon(c, gearset.cal_weapons, m["weakness"], lo.args(level, sec), m)
    if w is None:
        return
    fight = Fight(c, Player(c, level, sec, w, lo.armour_points, lo.charm), m, heal)
    seconds = fight.stocked() if fight.damaging() else None
    ratio = ref.gear_ratio(seconds)
    if ratio is None or ratio >= 1 - 1e-9:
        return
    target = m["seconds_per_kill"]
    report.note("%s: over-geared (the best piece in every slot, any zone, any calibration), "
                "Rations stocked with %s%s: %s against seconds_per_kill %s; gear_ratio %.3f "
                "against the reference %.1f s, %s %s"
                % (m["id"], _label(w[0]), lo.text(), _times(seconds, target, ratio, cap),
                   _num(target), ratio, ref.reference_time,
                   "capped at" if ratio < cap else "above", CAP_KEY + " " + _num(cap)))


def _check_kill(report, path, m, fight, who, heal, heal_open, ref=None, cap=None):
    ident, target = m["id"], m["seconds_per_kill"]
    if heal is None:
        report.warn("ration-heal-open", path,
                    "kill time with Rations stocked not computed: %s; %s"
                    % (heal_open, who), ident)
        return
    seconds = fight.stocked()
    if seconds is None:
        report.fail("ration-diverges", path,
                    "f = monster_dps x PLAYER_ATTACK_INTERVAL_S / %s = %.3f, at least 1, "
                    "so the stocked fight never ends; %s" % (RATION_KEY, fight.drag(), who),
                    ident)
        return
    off = (seconds - target) / target
    ratio = ref.gear_ratio(seconds) if ref is not None else None
    text = ("matched, Rations stocked: %s against seconds_per_kill %s (off by %+.1f%%); %s"
            % (_times(seconds, target, ratio, cap), _num(target), off * 100, who))
    if KILL_TIME_TOLERANCE_FRACTION is None:
        report.warn("kill-time-tolerance-unset", path,
                    "%s; not enforced because KILL_TIME_TOLERANCE_FRACTION is unset" % text,
                    ident)
    elif abs(off) > KILL_TIME_TOLERANCE_FRACTION:
        report.fail("kill-time", path, "%s; must be within %s%%"
                    % (text, _num(KILL_TIME_TOLERANCE_FRACTION * 100)), ident)
    else:
        report.note("%s: %s" % (ident, text))


def _check_boss(report, c, path, m, fight, who, heal, heal_open):
    ident = m["id"]
    want = c["BOSS_TARGET_WIN_CHANCE"]
    cap = c["BOSS_RATION_CAP_PER_ATTEMPT"]
    if heal is None and cap > 0:
        report.warn("ration-heal-open", path,
                    "win chance with %d Rations not computed: %s; %s"
                    % (cap, heal_open, who), ident)
        return
    p, seconds = fight.win_chance(cap)
    text = ("matched, %d Rations: win chance %.3f against BOSS_TARGET_WIN_CHANCE %s "
            "(off by %+.3f); won attempt %s against seconds_per_kill %s; %s"
            % (cap, p, _num(want), p - want, _times(seconds, m["seconds_per_kill"]),
               _num(m["seconds_per_kill"]), who))
    if WIN_CHANCE_TOLERANCE is None:
        report.warn("win-chance-tolerance-unset", path,
                    "%s; not enforced because WIN_CHANCE_TOLERANCE is unset" % text, ident)
    elif abs(p - want) > WIN_CHANCE_TOLERANCE:
        report.fail("win-chance", path, "%s; must be within %s"
                    % (text, _num(WIN_CHANCE_TOLERANCE)), ident)
    else:
        report.note("%s: %s" % (ident, text))


def _num(value):
    return ("%d" % value) if float(value).is_integer() else ("%s" % value)


# --------------------------------------------------------------------------


def run(root):
    report = lib.Report(CHECK)
    schemas = lib.load_schemas("content")
    gear_files, gear = load_gear(report, root, schemas)
    old_files, monsters = load_monsters(report, root, schemas)
    gearset = GearSet(gear)
    counts = ["%d %s" % (gearset.slot_count(s), s) for s in COMBAT_LEVEL_SLOTS
              if gearset.slot_count(s)]
    if gearset.tools:
        counts.append("%d tool(s)" % gearset.tools)
    report.note("%d gear file(s); %d weapon(s), %d armour piece(s)%s keep the gear rules, any zone"
                % (gear_files, len(gearset.weapons), len(gearset.legacy),
                   "" if not counts else " (legacy slot), " + ", ".join(counts)))
    if not monsters:
        report.note("%d monster/1 file(s) awaiting combat stats, 0 monsters on %s; "
                    "nothing to check" % (old_files, COMBAT_MONSTER_SCHEMA))
        return report

    model_path, model = load_model_file(report, root, schemas)
    curve_path, curve = check_pacing.load_curve(report, root, schemas)
    if model is None or curve is None:
        return report
    c = dict((k, v["value"]) for k, v in model["constants"].items())
    cap = load_cap(report, model_path, model)
    reference_weapons = load_reference_weapons(report, model_path, model, monsters)
    sec_of = secondary_levels(curve, c)
    report.note("%d monster(s) on %s, %d monster/1 file(s) skipped; model %s, curve %s, "
                "%s %s" % (len(monsters), COMBAT_MONSTER_SCHEMA, old_files, model_path,
                           curve_path, RATION_KEY,
                           "null (open)" if c[RATION_KEY] is None else _num(c[RATION_KEY])))
    boss_drops = load_boss_drops(root)
    for path, m in monsters:
        check_monster(report, c, sec_of, gearset, boss_drops, path, m,
                      reference_weapons, cap)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
