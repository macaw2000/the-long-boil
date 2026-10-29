// Fights, from the combat model in content/tuning/combat.json. These are
// the same closed forms scripts/validate/check_combat.py holds each monster
// to, so a fight in the game takes the time the validators promise.
//
// A fight is resolved per kill from its expected values: the kill takes the
// model's time per kill (never less than the monster's seconds_per_kill),
// Rations are eaten at the model's rate, and the drop rolls use the
// Tinker's seeded generator. A boss attempt rolls the model's win chance.

import { levelFor } from "./xp.js";
import type { Content } from "./content.js";

export type CombatConstants = Record<string, number>;

export interface Monster {
  id: string;
  level: number;
  boss: boolean;
  weakness: string;
  xp: number;
  seconds_per_kill: number;
  hp: number;
  max_hit: number;
  hit_chance: number;
  attack_interval_s: number;
  evasion: number;
}

export interface Weapon {
  item: string;
  style: string;
  level_required: number;
  power: number;
  accuracy: number;
}

/** An armour piece (GDD section 6: "a loadout is one weapon and one armour piece"). */
export interface Armour {
  item: string;
  /** The Fortitude level needed to wear it. */
  level_required: number;
  /** Armour points at +0, added to Fortitude against a monster's hits. */
  armour: number;
}

export interface DropEntry {
  item: string;
  chance: number;
  qty_min: number;
  qty_max: number;
}

export interface DropTable {
  monster: string;
  crowns: { min: number; max: number };
  entries: DropEntry[];
  first_kill: string[];
}

export const COMBAT_STYLES = ["melee", "marksmanship", "aetherics"] as const;
export const COMBAT_SKILLS = ["vitality", "pressure", "precision", "melee", "fortitude", "marksmanship", "aetherics"] as const;

/** The six non-focus combat skills' level, as one number the model uses for Vitality, Pressure, Precision and Fortitude. */
export interface Fighter {
  styleLevel: number;
  vitality: number;
  pressure: number;
  precision: number;
  fortitude: number;
  /** The worn armour piece's points; 0 with none, or one the Tinker's Fortitude is too low to wear. */
  armour: number;
  weapon: Weapon;
}

export function fighterFor(skillXp: Record<string, number>, weapon: Weapon, content: Content, worn?: Armour): Fighter {
  const level = (skill: string) => levelFor(skillXp[skill] ?? 0, content);
  const fortitude = level("fortitude");
  return {
    styleLevel: level(weapon.style),
    vitality: level("vitality"),
    pressure: level("pressure"),
    precision: level("precision"),
    fortitude,
    armour: worn && fortitude >= worn.level_required ? worn.armour : 0,
    weapon,
  };
}

export function maxHp(c: CombatConstants, fighter: Fighter): number {
  return c.HP_BASE! + c.HP_PER_VITALITY! * fighter.vitality;
}

function playerSwing(c: CombatConstants, f: Fighter, m: Monster) {
  const crit = Math.min(c.CRIT_CHANCE_CAP!, c.CRIT_CHANCE_PER_PRECISION! * f.precision);
  const accuracy = f.styleLevel + f.precision + f.weapon.accuracy;
  const hit = Math.min(c.HIT_CHANCE_MAX!, Math.max(c.HIT_CHANCE_MIN!, c.HIT_CHANCE_BASE! + c.HIT_CHANCE_PER_POINT! * (accuracy - m.evasion)));
  let top = (f.weapon.power + c.DAMAGE_PER_STYLE_LEVEL! * f.styleLevel) * (1 + c.PRESSURE_DAMAGE_PER_LEVEL! * f.pressure);
  if (f.weapon.style === m.weakness) top *= c.WEAKNESS_MULTIPLIER!;
  const mean = hit * (top / 2) * (1 + (c.CRIT_MULTIPLIER! - 1) * crit);
  const second = hit * ((top * top) / 3) * (1 - crit + c.CRIT_MULTIPLIER! ** 2 * crit);
  return { mean, second };
}

/** The share of a monster's hit that lands: armour is Fortitude level plus the armour piece's points (combat.json ARMOUR_HALF_POINT). */
export function damageTaken(c: CombatConstants, f: Fighter): number {
  const armour = f.fortitude + f.armour;
  return 1 - armour / (armour + c.ARMOUR_HALF_POINT!);
}

function monsterSwing(c: CombatConstants, f: Fighter, m: Monster) {
  const top = m.max_hit * damageTaken(c, f);
  return { mean: (m.hit_chance * top) / 2, second: (m.hit_chance * top * top) / 3 };
}

export interface KillPlan {
  seconds: number;
  rations: number;
}

/** Seconds and Rations for one kill of an ordinary monster, with or without Rations to eat. */
export function planKill(c: CombatConstants, f: Fighter, m: Monster, heal: number, haveRations: boolean): KillPlan | null {
  const player = playerSwing(c, f, m);
  if (player.mean <= 0) return null;
  const monsterDps = monsterSwing(c, f, m).mean / m.attack_interval_s;
  const tPure = m.hp / (player.mean / c.PLAYER_ATTACK_INTERVAL_S!);
  const drag = (monsterDps * c.PLAYER_ATTACK_INTERVAL_S!) / heal;
  if (haveRations && drag < 1) {
    const tFight = tPure / (1 - drag);
    return { seconds: Math.max(m.seconds_per_kill, c.BETWEEN_KILLS_S! + tFight), rations: (monsterDps * tFight) / heal };
  }
  const knockouts = (monsterDps * tPure) / maxHp(c, f);
  const seconds = c.BETWEEN_KILLS_S! + tPure + knockouts * (c.KNOCKOUT_RESPAWN_S! + tPure / 2);
  return { seconds: Math.max(m.seconds_per_kill, seconds), rations: 0 };
}

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, accurate to about 1.5e-7.
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

/** A boss attempt's win chance and length with n Rations (combat.json boss). */
export function planBoss(c: CombatConstants, f: Fighter, m: Monster, heal: number, rations: number) {
  const player = playerSwing(c, f, m);
  const boss = monsterSwing(c, f, m);
  const interval = c.PLAYER_ATTACK_INTERVAL_S!;
  if (player.mean <= 0) return { win: 0, seconds: m.seconds_per_kill };
  const mP = (interval * m.hp) / player.mean + rations * interval;
  const vP = (interval ** 2 * m.hp * (player.second - player.mean ** 2)) / player.mean ** 3;
  const pool = maxHp(c, f) + rations * heal;
  const mB = (m.attack_interval_s * pool) / boss.mean;
  const vB = (m.attack_interval_s ** 2 * pool * (boss.second - boss.mean ** 2)) / boss.mean ** 3;
  const z = (mB - mP) / Math.sqrt(vP + vB);
  return { win: 0.5 * (1 + erf(z / Math.SQRT2)), seconds: Math.max(m.seconds_per_kill, c.BETWEEN_KILLS_S! + mP) };
}

/** XP a kill pays each combat skill: the main share to the weapon's style, the rest split. */
export function killXp(c: CombatConstants, m: Monster, style: string): Record<string, number> {
  const xp: Record<string, number> = {};
  for (const skill of COMBAT_SKILLS) {
    xp[skill] = m.xp * (skill === style ? c.MAIN_COMBAT_SKILL_SHARE! : c.OTHER_COMBAT_SKILLS_SHARE_EACH!);
  }
  return xp;
}

// A small, fast, well-mixed 32-bit generator. Its whole state is one
// integer kept in the Tinker's state, so resolution stays replayable.
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, next];
}

export function zoneOf(id: string): string {
  return id.split(".")[1] ?? "";
}
