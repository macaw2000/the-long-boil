"""Check: the combat model against monster stats and gear (work order 010).

Reads every constant from the one content file whose schema is
tuning.combat/1 (content/tuning/combat.json) and the secondary level from the
one valid tuning.xp_curve/1 curve. No simulation: the closed forms are used as
written, with continuous moments (combat.json units.closed_forms_for_checks,
settled with revision 2).

Gear files (gear/1, under content/gear/), checked whether or not any monster
uses them. These are the rules gear/1's JSON Schema subset cannot say:

- row n of stats_by_calibration has calibration n, and row +0 is not null;
- a weapon has a style, and each of its rows has power and accuracy and no
  armour; an armour piece has no style, and each row has armour and nothing
  else;
- one gear entry per item across every gear file.

A gear/* file that is not gear/1, or does not match it, fails as
not-checkable. Gear entries that break a rule above are left out of the
reference gear.

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
- armour: of that gear, the +0 armour piece with the most armour whose
  level_required is at or below the player's Fortitude, S (combat.json
  gear.armour.fields: armour level_required is a Fortitude level). None is a
  WARN and armour 0 is used;
- Rations stocked, healing RATION_HEAL_HP each. While it is null (open,
  Cooking work order), everything that needs it is a WARN
  (ration-heal-open), not computed.

Non-boss monsters: the stocked computed seconds per kill,
BETWEEN_KILLS_S + t_pure / (1 - f), must be within
KILL_TIME_TOLERANCE_FRACTION of seconds_per_kill. This compares the
unfloored time, as combat.json kill_time.target states the target; the
floored expected time, max(seconds_per_kill, computed) at every level
(kill_time.floor, revision 2), is printed beside it. Comparing the floored time
instead would let a monster that dies too fast pass, since the floor lifts
it to exactly the target. f >= 1 is a FAIL (ration-diverges): the stocked
fight never ends.

Bosses: the win chance with BOSS_RATION_CAP_PER_ATTEMPT Rations must be within
WIN_CHANCE_TOLERANCE of BOSS_TARGET_WIN_CHANCE.

Both tolerances were set by Jeremy in answer to work order 010. If either is
ever set back to None, its comparisons become WARN lines, not enforced, as
check_xp_curve does with BAND_DAYS_TOLERANCE. Within tolerance is a NOTE.

NOTE lines, per monster: the kill time (bosses: the win chance) with each
unmatched style's best weapon from the same reference gear, Rations stocked.
These are for information only and never feed the reference player; and the matched kill time
(win chance) without Rations. Each kill time is shown computed and floored.

With no monster/2 monsters there is nothing to check, and neither the model
nor the curve is needed.

Usage: python3 scripts/validate/check_combat.py [--root DIR]
"""

import math
import sys

sys.dont_write_bytecode = True  # keep __pycache__ out of the repo

import lib  # noqa: E402
import check_pacing  # noqa: E402

CHECK = "combat"

MODEL_PREFIX = "tuning.combat/"
MODEL_SCHEMA = "tuning.combat/1"
MONSTER_PREFIX = "monster/"
COMBAT_MONSTER_SCHEMA = "monster/2"
GEAR_PREFIX = "gear/"
DROPS_PREFIX = "drops/"
GEAR_SCHEMA = "gear/1"

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


def load_gear(report, root, schemas):
    """Returns (file_count, [(path, entry)]) for gear entries that keep every
    rule; reports the ones that do not."""
    files = _files(root, GEAR_PREFIX)
    good = []
    seen = {}
    for path, data, declared in files:
        if declared != GEAR_SCHEMA:
            report.fail("not-checkable", path,
                        "schema is %r; only %s can be checked" % (declared, GEAR_SCHEMA),
                        data.get("id") if isinstance(data.get("id"), str) else None)
            continue
        errors = lib.validate(data, schemas[GEAR_SCHEMA])
        if errors:
            report.fail("not-checkable", path,
                        "file does not match %s (%d errors; see the schema check); "
                        "its gear is left out of the reference gear"
                        % (GEAR_SCHEMA, len(errors)), data.get("id"))
            continue
        for index, entry in enumerate(data["gear"]):
            seen.setdefault(entry["item"], []).append("%s#/gear/%d" % (path, index))
            if _gear_entry_ok(report, path, index, entry):
                good.append((path, entry))
    duplicates = set()
    for item in sorted(seen):
        if len(seen[item]) > 1:
            duplicates.add(item)
            for path in sorted(set(w.split("#")[0] for w in seen[item])):
                report.fail("gear-duplicate", path,
                            "item has %d gear entries: %s; one entry per item"
                            % (len(seen[item]), ", ".join(seen[item])), item)
    return len(files), [(p, e) for p, e in good if e["item"] not in duplicates]


def _gear_entry_ok(report, path, index, entry):
    item = entry["item"]
    where = "/gear/%d" % index
    ok = True
    slot = entry["slot"]
    if slot == "weapon" and "style" not in entry:
        report.fail("gear-shape", path, "%s: a weapon needs a style" % where, item)
        ok = False
    if slot == "armour" and "style" in entry:
        report.fail("gear-shape", path, "%s: armour has no style" % where, item)
        ok = False
    need = ("power", "accuracy") if slot == "weapon" else ("armour",)
    banned = ("armour",) if slot == "weapon" else ("power", "accuracy")
    rows = entry["stats_by_calibration"]
    if rows[0] is None:
        report.fail("gear-row-zero", path,
                    "%s/stats_by_calibration/0: row +0 is null; only rows +1 to +20 "
                    "may be null" % where, item)
        ok = False
    for n, row in enumerate(rows):
        if row is None:
            continue
        rwhere = "%s/stats_by_calibration/%d" % (where, n)
        if row["calibration"] != n:
            report.fail("gear-row-order", path,
                        "%s: calibration is %s; row %d must be +%d"
                        % (rwhere, row["calibration"], n, n), item)
            ok = False
        missing = [k for k in need if k not in row]
        extra = [k for k in banned if k in row]
        if missing or extra:
            article = "a weapon" if slot == "weapon" else "an armour"
            report.fail("gear-shape", path,
                        "%s: %s row needs %s%s"
                        % (rwhere, article, " and ".join(need),
                           "; %s is not %s stat" % (", ".join(extra), article) if extra else ""),
                        item)
            ok = False
    return ok


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
    found, bad = [], []
    for path, data, declared in _files(root, MODEL_PREFIX):
        if declared == MODEL_SCHEMA and not lib.validate(data, schemas[MODEL_SCHEMA]):
            found.append((path, data))
        else:
            bad.append(path)
    if len(found) == 1:
        path, data = found[0]
        return path, dict((k, v["value"]) for k, v in data["constants"].items())
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
    def __init__(self, c, level, secondary, weapon, armour_points):
        self.level = level
        self.secondary = secondary
        self.weapon = weapon  # (item, style, power, accuracy)
        self.max_hp = c["HP_BASE"] + c["HP_PER_VITALITY"] * secondary
        self.crit = min(c["CRIT_CHANCE_CAP"], c["CRIT_CHANCE_PER_PRECISION"] * secondary)
        self.pressure_mult = 1 + c["PRESSURE_DAMAGE_PER_LEVEL"] * secondary
        self.armour = secondary + armour_points


def swing(c, player, monster):
    """(mean, second moment) of the player's swing damage against monster."""
    _item, style, power, accuracy_bonus = player.weapon
    accuracy = player.level + player.secondary + accuracy_bonus
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
    """The +0 weapon of style with level_required <= L and the highest mean
    swing against monster; ties to the lower item id. None if there is none."""
    level, secondary, armour_points = player_args
    best = None
    for item, wstyle, required, power, accuracy in weapons:
        if wstyle != style or required > level:
            continue
        weapon = (item, wstyle, power, accuracy)
        mean, _ = swing(c, Player(c, level, secondary, weapon, armour_points), monster)
        key = (-mean, item)
        if best is None or key < best[0]:
            best = (key, weapon)
    return best[1] if best else None


def _times(seconds, target):
    return "computed %.1f s, floored %.1f s" % (seconds, max(target, seconds))


class Reference:
    """The reference player's setup against one monster (the rules in this
    module's docstring), shared with the drops check's grocer sink report
    (work order 013) so both read the same player. level_ok is False when the
    monster's level is not in the curve table; weapon is None when no
    weakness-style weapon qualifies; armour is None when no armour does."""

    def __init__(self, c, sec_of, all_weapons, all_armours, boss_drops, m):
        ident, level = m["id"], m["level"]
        self.zone = zone_of(ident)
        self.banned = boss_drops.get(ident, set()) if m["boss"] else set()
        self.weapons = [w for w in all_weapons
                        if zone_of(w[0]) == self.zone and w[0] not in self.banned]
        armours = [a for a in all_armours
                   if zone_of(a[0]) == self.zone and a[0] not in self.banned]
        self.level_ok = level in sec_of
        self.armour = self.weapon = self.player = None
        if not self.level_ok:
            return
        self.sec = sec_of[level]
        for item, required, points in armours:
            if required <= self.sec and (self.armour is None or
                                         (-points, item) < (-self.armour[1], self.armour[0])):
                self.armour = (item, points)
        self.armour_points = self.armour[1] if self.armour else 0
        self.args = (level, self.sec, self.armour_points)
        self.weapon = _best_weapon(c, self.weapons, m["weakness"], self.args, m)
        if self.weapon is not None:
            self.player = Player(c, level, self.sec, self.weapon, self.armour_points)


def check_monster(report, c, sec_of, all_weapons, all_armours, boss_drops, path, m):
    ident, level, style = m["id"], m["level"], m["weakness"]
    ref = Reference(c, sec_of, all_weapons, all_armours, boss_drops, m)
    zone, banned, weapons = ref.zone, ref.banned, ref.weapons
    target = m["seconds_per_kill"]
    heal = c[RATION_KEY]
    if not ref.level_ok:
        report.fail("level-off-curve", path,
                    "level %d is not in the curve table" % level, ident)
        return
    sec, armour = ref.sec, ref.armour
    if armour is None:
        report.warn("no-armour", path,
                    "no +0 %s armour with level_required <= %d (the reference "
                    "player's Fortitude at level %d)%s; armour 0 used"
                    % (zone, sec, level, ", leaving out the boss's own drops" if banned else ""),
                    ident)
    armour_points, args, weapon = ref.armour_points, ref.args, ref.weapon
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
    who = ("reference player main %s %d, other six %d, max_hp %s, %s, armour %s"
           % (style, level, sec, _num(player.max_hp), weapon[0],
              armour[0] if armour else "none"))
    heal_open = ("%s is %s in the combat model (Cooking work order)"
                 % (RATION_KEY, "null" if heal is None else heal))

    if m["boss"]:
        _check_boss(report, c, path, m, fight, who, heal, heal_open)
    else:
        _check_kill(report, path, m, fight, who, heal, heal_open)

    # NOTE lines: each unmatched style, Rations stocked; matched without Rations.
    for other in STYLES:
        if other == style:
            continue
        w = _best_weapon(c, weapons, other, args, m)
        label = "%s: unmatched (%s), Rations stocked" % (ident, other)
        if w is None:
            report.note("%s: no +0 %s %s weapon at level %d" % (label, zone, other, level))
            continue
        uf = Fight(c, Player(c, level, sec, w, armour_points), m, heal)
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
                label, w[0], "never ends (f >= 1)" if s is None else _times(s, target)))
    if m["boss"]:
        p, t = fight.win_chance(0)
        report.note("%s: matched, without Rations: win chance %.3f" % (ident, p))
    else:
        s, k = fight.unstocked()
        report.note("%s: matched, without Rations: %s, %.2f knockouts per kill"
                    % (ident, _times(s, target), k))


def _check_kill(report, path, m, fight, who, heal, heal_open):
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
    text = ("matched, Rations stocked: %s against seconds_per_kill %s (off by %+.1f%%); %s"
            % (_times(seconds, target), _num(target), off * 100, who))
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
    weapons = sorted((e["item"], e["style"], e["level_required"],
                      e["stats_by_calibration"][0]["power"],
                      e["stats_by_calibration"][0]["accuracy"])
                     for _p, e in gear if e["slot"] == "weapon")
    armours = sorted((e["item"], e["level_required"], e["stats_by_calibration"][0]["armour"])
                     for _p, e in gear if e["slot"] == "armour")
    report.note("%d gear file(s); %d weapon(s), %d armour piece(s) keep the gear rules, any zone"
                % (gear_files, len(weapons), len(armours)))
    if not monsters:
        report.note("%d monster/1 file(s) awaiting combat stats, 0 monsters on %s; "
                    "nothing to check" % (old_files, COMBAT_MONSTER_SCHEMA))
        return report

    model_path, c = load_model(report, root, schemas)
    curve_path, curve = check_pacing.load_curve(report, root, schemas)
    if c is None or curve is None:
        return report
    sec_of = secondary_levels(curve, c)
    report.note("%d monster(s) on %s, %d monster/1 file(s) skipped; model %s, curve %s, "
                "%s %s" % (len(monsters), COMBAT_MONSTER_SCHEMA, old_files, model_path,
                           curve_path, RATION_KEY,
                           "null (open)" if c[RATION_KEY] is None else _num(c[RATION_KEY])))
    boss_drops = load_boss_drops(root)
    for path, m in monsters:
        check_monster(report, c, sec_of, weapons, armours, boss_drops, path, m)
    return report


def main(argv):
    return run(lib.parse_root(argv)).emit()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
