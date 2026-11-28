// The action queue and the Boiler (GDD section 6, Offline play).
//
// A Tinker's queue holds two entries, or three with the Cog Shop's extra
// slot, each with a count: a skilling
// action, or a monster to fight. Time is resolved on demand: resolve()
// advances a state from where it was last resolved to `now`, working through
// the queue until the count runs out, the inputs run out, or the Boiler runs
// dry. Randomness comes only from the generator kept in the state, so
// resolving a span in one call or in many smaller calls gives the same state
// and the same events.

import type { Action, Content } from "./content.js";
import { boostedMs } from "./shop.js";
import { levelFor } from "./xp.js";
import {
  fighterFor,
  planCappedKill,
  killXp,
  nextRandom,
  planBoss,
  BOSS_OUT_OF_REACH,
  zoneOf,
  combatLevel,
  type Armour,
  type Piece,
  type DropTable,
  type Monster,
} from "./combat.js";

/** The queue's slots before the Cog Shop's extra one. */
export const QUEUE_SLOTS = 2;
export const BOILER_HOURS = 12;
const HOUR_MS = 3_600_000;

/**
 * Hot steam (work order 045). A Boiler lit after a year cold runs hot: a
 * Tinker holds a stock of hot goes, and a go that starts while the player is
 * at the workshop spends one and takes a sixth of its time. The stock is
 * topped up at each counted visit. "At the workshop" is the window a look or
 * a check-in opens (stoke), which is an input like any other, so resolving a
 * span in one call or in many still gives the same state: the offline queue
 * never spends the stock, because nothing stokes it.
 */
export const HOT_STOCK = 300;
export const HOT_TOP_UP = 30;
export const HOT_FACTOR = 6;
export const HOT_WINDOW_MS = 90_000;

/**
 * Fine work (work order 046): each level a Tinker holds above what a job
 * needs adds FINE_PERCENT_PER_LEVEL to the chance that a go makes twice its
 * output, to FINE_PERCENT_CAP. Gear is never doubled, nor a go that makes an input for a queued piece.
 */
export const FINE_PERCENT_PER_LEVEL = 2;
export const FINE_PERCENT_CAP = 20;

export function fineChance(level: number, levelRequired: number): number {
  return Math.min(FINE_PERCENT_CAP, FINE_PERCENT_PER_LEVEL * Math.max(0, level - levelRequired)) / 100;
}

/** A drop this unlikely is worth a line of its own (work order 047). */
export const RARE_CHANCE = 0.03;

export interface QueueEntry {
  /** An action id, or a monster id to fight that many times (a boss: that many attempts). */
  actionId: string;
  remaining: number;
}

export interface TinkerState {
  skillXp: Record<string, number>;
  inventory: Record<string, number>;
  crowns: number;
  queue: QueueEntry[];
  /** Time already spent on the head entry's current repetition. */
  progressMs: number;
  /** Epoch ms this state has been resolved up to. */
  resolvedTo: number;
  /** Epoch ms the Boiler runs dry. */
  steamUntil: number;
  /** The equipped weapon's item id. */
  weapon: string | null;
  /** The worn armour piece's item id (the legacy Fortitude-gated slot). */
  armour: string | null;
  /** What is worn in the six combat-level slots, by slot. */
  worn: Record<string, string>;
  /** The tool held for each skill, by skill. */
  tools: Record<string, string>;
  /** The seeded generator's state. */
  rng: number;
  /** Rations eaten in part but not yet taken from the inventory. */
  rationDebt: number;
  /** Per zone: kills since the last rare Ledger Page, and which page is next. */
  pity: Record<string, { kills: number; next: number }>;
  /** Set by the server for the Prologue, never saved: kills still count towards a page, but none drops. */
  holdPages?: boolean;
  /** Bosses this Tinker has beaten at least once. */
  bossesBeaten: string[];
  /** Epoch ms the Boiler Boost burns out; 0 when none was ever bought. */
  boostUntil: number;
  /**
   * Whether the head's current go runs boosted. Fixed as the go starts, so a
   * go that starts under the Boost finishes at the Boost's pace, however the
   * span is split between resolves.
   */
  headBoosted: boolean;
  /** The tool speed, in percent, the head go started with; it keeps it to the end, like the Boost. */
  headTool: number;
  /** Hot goes still in stock (work order 045). */
  hotGoes: number;
  /** Epoch ms until which the player counts as at the workshop; a go starting before it may run hot. */
  hotUntil: number;
  /** Whether the head's current go runs hot. Fixed as the go starts, like the Boost. */
  headHot: boolean;
  /** Ordinary monsters this Tinker has beaten at least once: the first of each turns up its rarest find (work order 047). */
  firstKills: string[];
}

type Drops = Record<string, number>;

export type GameEvent =
  | {
      type: "action_completed";
      at: number;
      actionId: string;
      skill: string;
      xp: number;
      consumed: Record<string, number>;
      produced: Record<string, number>;
      /** Fine work: this go made twice its output. */
      fine?: boolean;
    }
  | {
      type: "monster_killed";
      at: number;
      monsterId: string;
      xp: Record<string, number>;
      crowns: number;
      consumed: Record<string, number>;
      produced: Drops;
      /** The unlikely drops among what fell, and whether this was the Tinker's first of this monster. */
      rare?: string[];
      first?: boolean;
    }
  | {
      type: "boss_attempted";
      at: number;
      monsterId: string;
      won: boolean;
      winChance: number;
      xp: Record<string, number>;
      crowns: number;
      consumed: Record<string, number>;
      produced: Drops;
    }
  | { type: "level_up"; at: number; skill: string; level: number }
  | { type: "queue_entry_finished"; at: number; actionId: string }
  | { type: "queue_stalled"; at: number; actionId: string; reason: "inputs" | "level" | "unknown_action" | "no_weapon" | "cannot_win" }
  | { type: "boiler_dry"; at: number };

/**
 * The most jobs one look at the workshop counts toward opening places: a look
 * lands every job while the player is there, so only a spell away meets it. A
 * night's 790 rats would otherwise open every place at once, which a
 * playtester called feeling dropped (docs/first-day-plan.md).
 */
export const JOBS_CREDIT = 8;

/** Jobs these events finished that count toward opening places: each craft, gather or fight. */
export function jobsCounted(events: readonly GameEvent[]): number {
  const done = events.filter((event) => event.type === "action_completed" || event.type === "monster_killed" || event.type === "boss_attempted").length;
  return Math.min(JOBS_CREDIT, done);
}

export interface Resolution {
  state: TinkerState;
  events: GameEvent[];
}

export function cloneState(state: TinkerState): TinkerState {
  return {
    ...state,
    skillXp: { ...state.skillXp },
    inventory: { ...state.inventory },
    queue: state.queue.map((entry) => ({ ...entry })),
    pity: Object.fromEntries(Object.entries(state.pity).map(([zone, p]) => [zone, { ...p }])),
    bossesBeaten: [...state.bossesBeaten],
    firstKills: [...state.firstKills],
    worn: { ...state.worn },
    tools: { ...state.tools },
  };
}

type Step =
  | { kind: "stall"; reason: Extract<GameEvent, { type: "queue_stalled" }>["reason"] }
  | {
      kind: "run";
      ms: number;
      complete: (at: number) => GameEvent[];
      /** The skill whose tool speeds this go; none for a fight. */
      skill?: string;
      /** A step a gear chain runs to make an input: it counts nothing off the queued entry. */
      supplies?: boolean;
    };

function random(state: TinkerState): number {
  const [value, next] = nextRandom(state.rng);
  state.rng = next;
  return value;
}

function rollRange(state: TinkerState, min: number, max: number): number {
  return min + Math.floor(random(state) * (max - min + 1));
}

function addXp(state: TinkerState, content: Content, xp: Record<string, number>, at: number, events: GameEvent[]) {
  for (const [skill, gained] of Object.entries(xp)) {
    const before = levelFor(state.skillXp[skill] ?? 0, content);
    state.skillXp[skill] = (state.skillXp[skill] ?? 0) + gained;
    const after = levelFor(state.skillXp[skill] ?? 0, content);
    for (let level = before + 1; level <= after; level++) events.push({ type: "level_up", at, skill, level });
  }
}

function give(state: TinkerState, drops: Drops, item: string, qty: number) {
  state.inventory[item] = (state.inventory[item] ?? 0) + qty;
  drops[item] = (drops[item] ?? 0) + qty;
}

/** Every kill in a zone, boss attempts included, advances the zone's page counter and rolls for the next page. */
function rollPage(state: TinkerState, content: Content, monster: Monster, drops: Drops) {
  const zone = zoneOf(monster.id);
  const pages = content.zonePity.get(zone);
  if (!pages) return;
  const counter = (state.pity[zone] ??= { kills: 0, next: 0 });
  const page = pages[counter.next];
  if (!page) return;
  counter.kills += 1;
  if (state.holdPages) return;
  let chance = 0;
  for (const table of content.drops.values()) {
    if (zoneOf(table.monster) !== zone) continue;
    for (const entry of table.entries) if (entry.item === page.item) chance = Math.max(chance, entry.chance);
  }
  if (random(state) < chance || counter.kills >= page.kills) {
    give(state, drops, page.item, 1);
    counter.kills = 0;
    counter.next += 1;
  }
}

function rollTable(state: TinkerState, content: Content, table: DropTable | undefined, drops: Drops, rare?: string[]): number {
  if (!table) return 0;
  const crowns = rollRange(state, table.crowns.min, table.crowns.max);
  const pages = new Set((content.zonePity.get(zoneOf(table.monster)) ?? []).map((page) => page.item));
  for (const entry of table.entries) {
    if (pages.has(entry.item)) continue;
    if (random(state) < entry.chance) {
      give(state, drops, entry.item, rollRange(state, entry.qty_min, entry.qty_max));
      if (rare && entry.chance <= RARE_CHANCE) rare.push(entry.item);
    }
  }
  return crowns;
}

/** A table's least likely drop that is not a Ledger Page, ties to the first listed; undefined when every drop is certain. */
function rarestFind(content: Content, table: DropTable | undefined): string | undefined {
  if (!table) return undefined;
  const pages = new Set((content.zonePity.get(zoneOf(table.monster)) ?? []).map((page) => page.item));
  let rarest: { item: string; chance: number } | undefined;
  for (const entry of table.entries) {
    if (pages.has(entry.item) || entry.chance >= 1) continue;
    if (!rarest || entry.chance < rarest.chance) rarest = entry;
  }
  return rarest?.item;
}

function eat(state: TinkerState, content: Content, rations: number): Record<string, number> {
  const item = content.ration.item;
  state.rationDebt += rations;
  const eaten = Math.min(Math.floor(state.rationDebt + 1e-9), state.inventory[item] ?? 0);
  state.rationDebt -= eaten;
  if (eaten > 0) state.inventory[item] = (state.inventory[item] ?? 0) - eaten;
  return eaten > 0 ? { [item]: eaten } : {};
}

/** Whether an action makes something worn: a weapon, a piece, a tool or legacy armour. */
function makesGear(content: Content, action: Action): boolean {
  return action.outputs.some(
    (output) => content.weapons.has(output.item) || content.pieces.has(output.item) || content.tools.has(output.item) || content.armours.has(output.item),
  );
}

/** The highest-level action the Tinker can do that makes an item, ties to the lower id; undefined if none. */
function maker(state: TinkerState, content: Content, item: string): Action | undefined {
  let found: Action | undefined;
  for (const action of content.actions.values()) {
    if (!action.outputs.some((output) => output.item === item)) continue;
    if (levelFor(state.skillXp[action.skill] ?? 0, content) < action.level_required) continue;
    if (!found || action.level_required > found.level_required || (action.level_required === found.level_required && action.id < found.id)) found = action;
  }
  return found;
}

/**
 * The next go a gear chain needs (Jeremy, 30 October 2026: "make it" runs the
 * whole chain): when a piece lacks an input, the queue makes that input first,
 * from what is in stores, down the chain as far as it must, inside the same
 * queue entry. Deterministic from the state, so a go resumed after a check-in
 * is the same go. Undefined when some input has no maker the Tinker can do.
 */
function supplyAction(state: TinkerState, content: Content, action: Action, seen: Set<string> = new Set()): Action | undefined {
  if (seen.has(action.id) || seen.size > 8) return undefined;
  seen.add(action.id);
  for (const input of action.inputs) {
    if ((state.inventory[input.item] ?? 0) >= input.qty) continue;
    const source = maker(state, content, input.item);
    if (!source) return undefined;
    const ready = source.inputs.every((need) => (state.inventory[need.item] ?? 0) >= need.qty);
    return ready ? source : supplyAction(state, content, source, seen);
  }
  return undefined;
}

function actionStep(state: TinkerState, content: Content, action: Action): Step {
  if (levelFor(state.skillXp[action.skill] ?? 0, content) < action.level_required) return { kind: "stall", reason: "level" };
  if (action.inputs.some((input) => (state.inventory[input.item] ?? 0) < input.qty)) {
    const source = makesGear(content, action) ? supplyAction(state, content, action) : undefined;
    if (!source) return { kind: "stall", reason: "inputs" };
    return { ...goOf(state, content, source, true), supplies: true };
  }
  return goOf(state, content, action);
}

/** One go of an action whose inputs are in stores. */
function goOf(state: TinkerState, content: Content, action: Action, supplies = false): Extract<Step, { kind: "run" }> {
  return {
    kind: "run",
    skill: action.skill,
    ms: action.seconds * 1000,
    complete: (at) => {
      const events: GameEvent[] = [];
      const consumed: Record<string, number> = {};
      for (const input of action.inputs) {
        state.inventory[input.item] = (state.inventory[input.item] ?? 0) - input.qty;
        consumed[input.item] = input.qty;
      }
      // The chance is read before the go's own XP lands, and no number is drawn when there is none.
      const chance = supplies || makesGear(content, action) ? 0 : fineChance(levelFor(state.skillXp[action.skill] ?? 0, content), action.level_required);
      const fine = chance > 0 && random(state) < chance;
      const produced: Record<string, number> = {};
      for (const output of action.outputs) {
        const qty = fine ? output.qty * 2 : output.qty;
        state.inventory[output.item] = (state.inventory[output.item] ?? 0) + qty;
        produced[output.item] = qty;
      }
      events.push({ type: "action_completed", at, actionId: action.id, skill: action.skill, xp: action.xp, consumed, produced, ...(fine ? { fine } : {}) });
      addXp(state, content, { [action.skill]: action.xp }, at, events);
      return events;
    },
  };
}

function fightStep(state: TinkerState, content: Content, monster: Monster): Step {
  const weapon = state.weapon ? content.weapons.get(state.weapon) : undefined;
  if (!weapon || (state.inventory[weapon.item] ?? 0) < 1) return { kind: "stall", reason: "no_weapon" };
  const fighter = fighterFor(state.skillXp, weapon, content, worn(state, content), wornPieces(state, content));
  if (fighter.styleLevel < weapon.level_required) return { kind: "stall", reason: "level" };
  const c = content.combat;
  const heal = content.ration.heal;
  const held = state.inventory[content.ration.item] ?? 0;

  if (monster.boss) {
    const rations = Math.min(c.BOSS_RATION_CAP_PER_ATTEMPT ?? 0, held);
    const plan = planBoss(c, fighter, monster, heal, rations);
    if (plan.win < BOSS_OUT_OF_REACH) return { kind: "stall", reason: "cannot_win" };
    return {
      kind: "run",
      ms: Math.round(plan.seconds * 1000),
      complete: (at) => {
        const events: GameEvent[] = [];
        const consumed = rations > 0 ? { [content.ration.item]: rations } : {};
        if (rations > 0) state.inventory[content.ration.item] = held - rations;
        const won = random(state) < plan.win;
        const produced: Drops = {};
        let crowns = 0;
        let xp: Record<string, number> = {};
        if (won) {
          xp = killXp(c, monster, weapon.style);
          const table = content.drops.get(monster.id);
          if (!state.bossesBeaten.includes(monster.id) && table && table.first_kill.length > 0) {
            crowns = rollRange(state, table.crowns.min, table.crowns.max);
            for (const item of table.first_kill) give(state, produced, item, 1);
          } else {
            crowns = rollTable(state, content, table, produced);
          }
          if (!state.bossesBeaten.includes(monster.id)) state.bossesBeaten.push(monster.id);
          state.crowns += crowns;
        }
        rollPage(state, content, monster, produced);
        events.push({ type: "boss_attempted", at, monsterId: monster.id, won, winChance: plan.win, xp, crowns, consumed, produced });
        addXp(state, content, xp, at, events);
        return events;
      },
    };
  }

  const plan = planCappedKill(content, state.skillXp, fighter, monster, held > 0);
  if (!plan) return { kind: "stall", reason: "cannot_win" };
  return {
    kind: "run",
    ms: Math.round(plan.seconds * 1000),
    complete: (at) => {
      const events: GameEvent[] = [];
      const consumed = eat(state, content, plan.rations);
      const produced: Drops = {};
      const rare: string[] = [];
      const table = content.drops.get(monster.id);
      const rolled = rollTable(state, content, table, produced, rare);
      // A kill made quicker by levels pays its Crowns at the same share as its XP (KillPlan.xpShare), so Crowns
      // an hour hold where the economy has them and one night still does not pay Pip's bill (first-day decision 8).
      // The share is a chance of the whole purse, drawn only when it is under 1, so the expected purse is exact.
      const crowns = plan.xpShare < 1 && random(state) >= plan.xpShare ? 0 : rolled;
      state.crowns += crowns;
      const first = !state.firstKills.includes(monster.id);
      if (first) {
        state.firstKills.push(monster.id);
        // The first of each monster always turns up its rarest find, if this kill did not already.
        const find = rarestFind(content, table);
        if (find && !produced[find]) {
          give(state, produced, find, 1);
          rare.push(find);
        }
      }
      rollPage(state, content, monster, produced);
      const xp = killXp(c, monster, weapon.style, plan.xpShare);
      events.push({ type: "monster_killed", at, monsterId: monster.id, xp, crowns, consumed, produced, ...(rare.length ? { rare } : {}), ...(first ? { first } : {}) });
      addXp(state, content, xp, at, events);
      return events;
    },
  };
}

function stepFor(state: TinkerState, content: Content, id: string): Step {
  const action = content.actions.get(id);
  if (action) return actionStep(state, content, action);
  const monster = content.monsters.get(id);
  if (monster) return fightStep(state, content, monster);
  return { kind: "stall", reason: "unknown_action" };
}

/**
 * A step's time at the Cog Shop's Boost and the tool's speed, which multiply
 * (tools.json composition): (100 + tool)(100 + boost) in whole numbers,
 * rounded once, halves up, so offline resolution equals step-by-step replay.
 */
function paced(ms: number, boosted: boolean, tool: number, content: Content, hot = false): number {
  const boost = boosted && content.shop ? content.shop.boost.percent : 0;
  let time = ms;
  if (boost !== 0 || tool !== 0) {
    const d = (100 + tool) * (100 + boost);
    time = Math.floor((ms * 20000 + d) / (2 * d));
  }
  // Hot steam divides what the tool and the Boost leave, rounded once, halves up.
  return hot ? Math.max(1, Math.floor((time * 2 + HOT_FACTOR) / (2 * HOT_FACTOR))) : time;
}

/** Whether a go starting at `at` runs hot: there is stock, and the player is at the workshop. */
function hotAt(state: TinkerState, at: number): boolean {
  return state.hotGoes > 0 && at < state.hotUntil;
}

/**
 * The player is at the workshop (a look or a check-in): goes that start in
 * the next HOT_WINDOW_MS may run hot. A go already under way joins in at the
 * same share done, so arriving never means waiting out a cold go. Resolve first.
 */
export function stoke(state: TinkerState, now: number): TinkerState {
  const next = cloneState(state);
  next.hotUntil = now + HOT_WINDOW_MS;
  if (next.hotGoes > 0 && !next.headHot && next.progressMs > 0) {
    next.headHot = true;
    next.progressMs = Math.floor(next.progressMs / HOT_FACTOR);
  }
  return next;
}

/** Adds hot goes to the stock, which never holds more than HOT_STOCK. */
export function grantHot(state: TinkerState, goes: number): TinkerState {
  const next = cloneState(state);
  next.hotGoes = Math.min(HOT_STOCK, next.hotGoes + goes);
  return next;
}

/** The speed, in percent, of the tool held for a go's skill; 0 for a fight or no tool. */
function toolSpeed(state: TinkerState, content: Content, skill: string | undefined): number {
  const tool = skill ? held(state, content.tools.get(state.tools[skill] ?? "")) : undefined;
  return tool && levelFor(state.skillXp[tool.skill] ?? 0, content) >= tool.level_required ? tool.speed : 0;
}

/** A piece of gear the Tinker still holds, or undefined. */
function held<T extends { item: string }>(state: TinkerState, piece: T | undefined): T | undefined {
  return piece && (state.inventory[piece.item] ?? 0) > 0 ? piece : undefined;
}

/** Whether a go starting at `at` runs under the Boost. */
function boostedAt(state: TinkerState, at: number): boolean {
  return at < state.boostUntil;
}

/** How long one go of the queue's head takes now, by the same step the queue runs; null if it would stall or the queue is empty. */
export function headMs(state: TinkerState, content: Content): number | null {
  const head = state.queue[0];
  if (!head) return null;
  const step = stepFor(state, content, head.actionId);
  if (step.kind !== "run") return null;
  return state.progressMs > 0
    ? paced(step.ms, state.headBoosted, state.headTool, content, state.headHot)
    : paced(step.ms, boostedAt(state, state.resolvedTo), toolSpeed(state, content, step.skill), content, hotAt(state, state.resolvedTo));
}

export type FightOutlook =
  | { monsterId: string; ready: false; reason: "no_weapon" | "level" | "cannot_win" }
  | { monsterId: string; ready: true; seconds: number; winChance: number | null; rations: number };

/**
 * What a fight looks like before it is queued, by the same plan the queue
 * uses: seconds a kill or attempt, and a boss's win chance with the Rations
 * it would take (GDD section 6: odds are shown up front).
 */
export function fightOutlook(state: TinkerState, content: Content, monster: Monster): FightOutlook {
  const weapon = state.weapon ? content.weapons.get(state.weapon) : undefined;
  if (!weapon || (state.inventory[weapon.item] ?? 0) < 1) return { monsterId: monster.id, ready: false, reason: "no_weapon" };
  const fighter = fighterFor(state.skillXp, weapon, content, worn(state, content), wornPieces(state, content));
  if (fighter.styleLevel < weapon.level_required) return { monsterId: monster.id, ready: false, reason: "level" };
  const c = content.combat;
  const held = state.inventory[content.ration.item] ?? 0;
  const seconds = (planned: number) => paced(Math.round(planned * 1000), boostedAt(state, state.resolvedTo), 0, content) / 1000;
  if (monster.boss) {
    const rations = Math.min(c.BOSS_RATION_CAP_PER_ATTEMPT ?? 0, held);
    const plan = planBoss(c, fighter, monster, content.ration.heal, rations);
    if (plan.win < BOSS_OUT_OF_REACH) return { monsterId: monster.id, ready: false, reason: "cannot_win" };
    return { monsterId: monster.id, ready: true, seconds: seconds(plan.seconds), winChance: plan.win, rations };
  }
  const plan = planCappedKill(content, state.skillXp, fighter, monster, held > 0);
  if (!plan) return { monsterId: monster.id, ready: false, reason: "cannot_win" };
  return { monsterId: monster.id, ready: true, seconds: seconds(plan.seconds), winChance: null, rations: plan.rations };
}

/** Advances a Tinker's queue from state.resolvedTo to now. Returns a new state; the input is untouched. */
export function resolve(previous: TinkerState, content: Content, now: number): Resolution {
  const state = cloneState(previous);
  const events: GameEvent[] = [];
  const workEnd = Math.min(now, state.steamUntil);
  let t = state.resolvedTo;

  while (t < workEnd) {
    const head = state.queue[0];
    if (!head) break;
    const step = stepFor(state, content, head.actionId);
    if (step.kind === "stall") {
      events.push({ type: "queue_stalled", at: t, actionId: head.actionId, reason: step.reason });
      state.queue.shift();
      state.progressMs = 0;
      continue;
    }

    if (state.progressMs === 0) {
      state.headBoosted = boostedAt(state, t);
      state.headTool = toolSpeed(state, content, step.skill);
      state.headHot = hotAt(state, t);
    }
    const needed = Math.max(0, paced(step.ms, state.headBoosted, state.headTool, content, state.headHot) - state.progressMs);
    if (t + needed > workEnd) {
      state.progressMs += workEnd - t;
      t = workEnd;
      break;
    }

    t += needed;
    state.progressMs = 0;
    if (state.headHot) {
      state.hotGoes = Math.max(0, state.hotGoes - 1);
      state.headHot = false;
    }
    events.push(...step.complete(t));
    // A go that made an input for the queued piece counts nothing off the entry.
    if (step.supplies) continue;
    head.remaining -= 1;
    if (head.remaining <= 0) {
      events.push({ type: "queue_entry_finished", at: t, actionId: head.actionId });
      state.queue.shift();
    }
  }

  if (state.queue.length > 0 && previous.resolvedTo <= state.steamUntil && now > state.steamUntil) {
    events.push({ type: "boiler_dry", at: state.steamUntil });
  }
  for (const [item, qty] of Object.entries(state.inventory)) {
    if (qty === 0) delete state.inventory[item];
  }
  state.resolvedTo = Math.max(state.resolvedTo, now);
  return { state, events };
}

/** A check-in: resolves up to now, then refills the Boiler to its full hours. */
export function checkIn(state: TinkerState, content: Content, now: number, boilerHours = BOILER_HOURS): Resolution {
  const resolution = resolve(state, content, now);
  resolution.state.steamUntil = now + boilerHours * HOUR_MS;
  return resolution;
}

/** Replaces the queue. Resolve first, so time already spent is not lost. */
export function setQueue(state: TinkerState, queue: QueueEntry[], slots = QUEUE_SLOTS): TinkerState {
  if (queue.length > slots) throw new Error(`the queue holds ${slots} actions`);
  if (queue.some((entry) => !Number.isInteger(entry.remaining) || entry.remaining < 1)) {
    throw new Error("each queued action needs a whole count of at least 1");
  }
  const next = cloneState(state);
  const sameHead = next.queue[0]?.actionId === queue[0]?.actionId;
  next.queue = queue.map((entry) => ({ ...entry }));
  if (!sameHead) {
    next.progressMs = 0;
    next.headHot = false;
  }
  return next;
}

/** The armour piece the Tinker wears and still holds, if any. */
function worn(state: TinkerState, content: Content): Armour | undefined {
  const armour = state.armour ? content.armours.get(state.armour) : undefined;
  return armour && (state.inventory[armour.item] ?? 0) > 0 ? armour : undefined;
}

/** The pieces worn in the six combat-level slots that the Tinker still holds. */
function wornPieces(state: TinkerState, content: Content): Piece[] {
  return Object.values(state.worn)
    .map((item) => held(state, content.pieces.get(item)))
    .filter((piece): piece is Piece => piece !== undefined);
}

/**
 * Puts on a piece of gear the Tinker holds and can wear: one of the six
 * combat-level slots by combat level, a tool by its skill's level, or the
 * legacy armour slot by Fortitude. Resolve first: it changes the work under way.
 */
export function wear(state: TinkerState, content: Content, item: string): TinkerState {
  const piece = content.pieces.get(item);
  const tool = content.tools.get(item);
  if (!piece && !tool) return wearArmour(state, content, item);
  if ((state.inventory[item] ?? 0) < 1) throw new Error(`you do not have ${item}`);
  const next = cloneState(state);
  if (piece) {
    if (combatLevel(state.skillXp, content) < piece.level_required) throw new Error(`${item} needs combat level ${piece.level_required}`);
    next.worn[piece.slot] = item;
    if (next.queue[0] && content.monsters.has(next.queue[0].actionId)) next.progressMs = 0;
  } else if (tool) {
    if (levelFor(state.skillXp[tool.skill] ?? 0, content) < tool.level_required) throw new Error(`${item} needs ${tool.skill} ${tool.level_required}`);
    // A go keeps the speed it started with (tools.json go_start), so the work under way runs on.
    next.tools[tool.skill] = item;
  }
  return next;
}

/** Puts on an armour piece the Tinker holds and has the Fortitude to wear. Resolve first: it changes the fight under way. */
function wearArmour(state: TinkerState, content: Content, item: string): TinkerState {
  const armour = content.armours.get(item);
  if (!armour) throw new Error(`${item} is not armour`);
  if ((state.inventory[item] ?? 0) < 1) throw new Error(`you do not have ${item}`);
  if (levelFor(state.skillXp.fortitude ?? 0, content) < armour.level_required) {
    throw new Error(`${item} needs fortitude ${armour.level_required}`);
  }
  const next = cloneState(state);
  next.armour = item;
  if (next.queue[0] && content.monsters.has(next.queue[0].actionId)) next.progressMs = 0;
  return next;
}

/** Equips a weapon the Tinker holds and can use. Resolve first: a different weapon changes the fight under way. */
export function equip(state: TinkerState, content: Content, item: string): TinkerState {
  const weapon = content.weapons.get(item);
  if (!weapon) throw new Error(`${item} is not a weapon`);
  if ((state.inventory[item] ?? 0) < 1) throw new Error(`you do not have ${item}`);
  if (levelFor(state.skillXp[weapon.style] ?? 0, content) < weapon.level_required) {
    throw new Error(`${item} needs ${weapon.style} ${weapon.level_required}`);
  }
  const next = cloneState(state);
  next.weapon = item;
  if (next.queue[0] && content.monsters.has(next.queue[0].actionId)) next.progressMs = 0;
  return next;
}

/** A fresh Tinker's state; the generator is seeded per Tinker. */
export function newTinker(inventory: Record<string, number>, crowns: number, now: number, seed: number): TinkerState {
  return {
    skillXp: {},
    inventory: { ...inventory },
    crowns,
    queue: [],
    progressMs: 0,
    resolvedTo: now,
    steamUntil: now + BOILER_HOURS * HOUR_MS,
    weapon: null,
    armour: null,
    worn: {},
    tools: {},
    rng: seed >>> 0,
    rationDebt: 0,
    pity: {},
    bossesBeaten: [],
    boostUntil: 0,
    headBoosted: false,
    headTool: 0,
    hotGoes: HOT_STOCK,
    hotUntil: 0,
    headHot: false,
    firstKills: [],
  };
}
