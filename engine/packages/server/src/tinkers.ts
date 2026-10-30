// A Tinker's state lives in Postgres: the ordered event log plus the
// projections in tinkers, inventory, skills and queue. Every operation here
// locks the Tinker's row, resolves time with the pure rules, appends the
// events and updates the projections in one transaction.

import * as rules from "@long-boil/rules";
import type { GameEvent, QueueEntry, StoryEvent, StoryState, TinkerState } from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { appendEvents, type LogEntry } from "./events.js";
import { NotFound, settle, type TradeNote } from "./settle.js";
import { deliverCrates } from "./shop.js";

export { NotFound };

const HOUR_MS = 3_600_000;

export interface StackView {
  item: string;
  qty: number;
  bound: boolean;
}

export interface TinkerView {
  id: number;
  name: string;
  crowns: number;
  /** Gilded Cogs, from opened Cog Crates (GDD section 8). */
  cogs: number;
  /** What Cogs have bought: queue slots, the Boiler's hours, and when the Boiler Boost burns out. */
  upgrades: { queueSlots: number; boilerHours: number; boostUntil: string | null };
  inventory: StackView[];
  skills: { skill: string; xp: number; level: number }[];
  queue: QueueEntry[];
  progressMs: number;
  /** How long one go of the queue's head takes, kills included: a fight's time depends on the Tinker. */
  headMs: number | null;
  steamUntil: string;
  resolvedTo: string;
  weapon: string | null;
  armour: string | null;
  worn: Record<string, string>;
  tools: Record<string, string>;
  bossesBeaten: string[];
  story: StorySummary;
  /** Work Orders waiting on the desk, as last brought up to date; for the tab's badge. */
  workOrders: number;
}

/** The story's gauges for the top bar and the Story tab's badge. */
export interface StorySummary {
  nerve: number;
  nerveCap: number;
  /** When the next point of Nerve arrives, or null when full. */
  nextNerveAt: string | null;
  needles: Record<string, number>;
  letters: number;
  backRent: number;
  debts: { id: string; label: string; crowns: number }[];
  /** Storylets open to play now, for the Story tab's nudge. */
  openScenes: number;
  /** A stay at St. Pinion's: only its scenes are open, and Scald holds (work order 020). */
  inInfirmary: boolean;
  /** Every story quality above 0, for the first-session guide. */
  qualities: Record<string, number>;
}

export interface Outcome {
  tinker: TinkerView;
  events: GameEvent[];
  /** The events folded into the While You Were Away ledger. */
  ledger: rules.Ledger;
  /** Exchange fills collected and orders closed at this touch. */
  trades: TradeNote[];
  /** Letters that arrived and Needles that fell. */
  story: StoryEvent[];
}

export function outcome(tinker: TinkerView, events: GameEvent[], trades: TradeNote[] = [], story: StoryEvent[] = []): Outcome {
  return { tinker, events, ledger: rules.summarize(events), trades, story };
}

export interface Loaded {
  state: TinkerState;
  stacks: StackView[];
  lastSeq: number;
  /** The Cog Shop's queue slots and Boiler hours. */
  queueSlots: number;
  boilerHours: number;
}

export async function lockAndLoad(tx: Tx, tinkerId: number): Promise<Loaded> {
  const row = (
    await tx.query(
      `SELECT progress_ms, resolved_to, steam_until, last_seq, crowns, weapon, armour, worn, tools, head_tool, rng, ration_debt, pity, bosses_beaten,
         boost_until, head_boosted, queue_slots, boiler_hours
       FROM tinkers WHERE id = $1 FOR UPDATE`,
      [tinkerId],
    )
  ).rows[0];
  if (!row) throw new NotFound(`no Tinker ${tinkerId}`);

  const stacks: StackView[] = (
    await tx.query("SELECT item, qty, bound FROM inventory WHERE tinker_id = $1", [tinkerId])
  ).rows.map((stack) => ({ item: stack.item, qty: Number(stack.qty), bound: stack.bound }));
  const inventory: Record<string, number> = {};
  for (const stack of stacks) inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.qty;

  const skillXp: Record<string, number> = {};
  for (const skill of (await tx.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [tinkerId])).rows) {
    skillXp[skill.skill] = Number(skill.xp);
  }
  const queue: QueueEntry[] = (
    await tx.query("SELECT action_id, remaining FROM queue WHERE tinker_id = $1 ORDER BY slot", [tinkerId])
  ).rows.map((entry) => ({ actionId: entry.action_id, remaining: entry.remaining }));

  return {
    state: {
      skillXp,
      inventory,
      crowns: Number(row.crowns),
      queue,
      progressMs: Number(row.progress_ms),
      resolvedTo: row.resolved_to.getTime(),
      steamUntil: row.steam_until.getTime(),
      weapon: row.weapon,
      armour: row.armour,
      worn: row.worn,
      tools: row.tools,
      headTool: Number(row.head_tool),
      rng: Number(row.rng),
      rationDebt: Number(row.ration_debt),
      pity: row.pity,
      bossesBeaten: row.bosses_beaten,
      boostUntil: row.boost_until.getTime(),
      headBoosted: row.head_boosted,
    },
    stacks,
    lastSeq: Number(row.last_seq),
    queueSlots: row.queue_slots,
    boilerHours: row.boiler_hours,
  };
}

/**
 * Writes the new state's projections. The rules see one count per item; the
 * database keeps bound and unbound stacks apart. Gains are unbound; losses
 * use bound stock first, so a starter crate is eaten before bought food.
 */
export async function saveState(tx: Tx, tinkerId: number, loaded: Loaded, state: TinkerState, lastSeq: number, version: string) {
  const items = new Set([...Object.keys(loaded.state.inventory), ...Object.keys(state.inventory)]);
  for (const item of items) {
    let delta = (state.inventory[item] ?? 0) - (loaded.state.inventory[item] ?? 0);
    if (delta === 0) continue;
    const bound = loaded.stacks.find((stack) => stack.item === item && stack.bound)?.qty ?? 0;
    const unbound = loaded.stacks.find((stack) => stack.item === item && !stack.bound)?.qty ?? 0;
    let newBound = bound;
    let newUnbound = unbound;
    if (delta > 0) newUnbound += delta;
    else {
      const fromBound = Math.min(bound, -delta);
      newBound -= fromBound;
      delta += fromBound;
      newUnbound += delta;
    }
    for (const [isBound, qty] of [[true, newBound], [false, newUnbound]] as const) {
      if (qty > 0) {
        await tx.query(
          `INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, $3, $4)
           ON CONFLICT (tinker_id, item, bound) DO UPDATE SET qty = EXCLUDED.qty`,
          [tinkerId, item, isBound, qty],
        );
      } else {
        await tx.query("DELETE FROM inventory WHERE tinker_id = $1 AND item = $2 AND bound = $3", [tinkerId, item, isBound]);
      }
    }
  }

  for (const [skill, xp] of Object.entries(state.skillXp)) {
    if (xp === (loaded.state.skillXp[skill] ?? 0)) continue;
    await tx.query(
      `INSERT INTO skills (tinker_id, skill, xp) VALUES ($1, $2, $3)
       ON CONFLICT (tinker_id, skill) DO UPDATE SET xp = EXCLUDED.xp`,
      [tinkerId, skill, xp],
    );
  }

  await tx.query("DELETE FROM queue WHERE tinker_id = $1", [tinkerId]);
  for (const [slot, entry] of state.queue.entries()) {
    await tx.query("INSERT INTO queue (tinker_id, slot, action_id, remaining) VALUES ($1, $2, $3, $4)", [
      tinkerId,
      slot,
      entry.actionId,
      entry.remaining,
    ]);
  }

  await tx.query(
    `UPDATE tinkers SET progress_ms = $2, resolved_to = $3, steam_until = $4, last_seq = $5, content_version = $6,
       crowns = $7, weapon = $8, rng = $9, ration_debt = $10, pity = $11, bosses_beaten = $12, head_boosted = $13,
       armour = $14, worn = $15, tools = $16, head_tool = $17
     WHERE id = $1`,
    [
      tinkerId,
      state.progressMs,
      new Date(state.resolvedTo),
      new Date(state.steamUntil),
      lastSeq,
      version,
      state.crowns,
      state.weapon,
      state.rng,
      state.rationDebt,
      JSON.stringify(state.pity),
      JSON.stringify(state.bossesBeaten),
      state.headBoosted,
      state.armour,
      JSON.stringify(state.worn),
      JSON.stringify(state.tools),
      state.headTool,
    ],
  );
}

export async function loadStory(tx: Tx, tinkerId: number): Promise<StoryState> {
  const row = (
    await tx.query("SELECT nerve, nerve_at, post_at, hand, needle_at, check_in_at, answered, played_at, nerve_cap FROM tinkers WHERE id = $1", [tinkerId])
  ).rows[0];
  const qualities: Record<string, number> = {};
  for (const quality of (await tx.query("SELECT name, value FROM qualities WHERE tinker_id = $1", [tinkerId])).rows) {
    qualities[quality.name] = quality.value;
  }
  return {
    qualities,
    nerve: row.nerve,
    nerveAt: row.nerve_at.getTime(),
    needleAt: row.needle_at,
    hand: row.hand,
    postAt: row.post_at.getTime(),
    checkInAt: row.check_in_at ? row.check_in_at.getTime() : null,
    answered: row.answered,
    playedAt: row.played_at,
    nerveCap: row.nerve_cap,
  };
}

export async function saveStory(tx: Tx, tinkerId: number, before: StoryState, after: StoryState): Promise<void> {
  for (const name of new Set([...Object.keys(before.qualities), ...Object.keys(after.qualities)])) {
    const value = after.qualities[name] ?? 0;
    if (value === (before.qualities[name] ?? 0)) continue;
    await tx.query(
      `INSERT INTO qualities (tinker_id, name, value) VALUES ($1, $2, $3)
       ON CONFLICT (tinker_id, name) DO UPDATE SET value = EXCLUDED.value`,
      [tinkerId, name, value],
    );
  }
  await tx.query("UPDATE tinkers SET nerve = $2, nerve_at = $3, post_at = $4, hand = $5, needle_at = $6, check_in_at = $7, answered = $8, played_at = $9 WHERE id = $1", [
    tinkerId,
    after.nerve,
    new Date(after.nerveAt),
    new Date(after.postAt),
    JSON.stringify(after.hand),
    JSON.stringify(after.needleAt),
    after.checkInAt === null ? null : new Date(after.checkInAt),
    JSON.stringify(after.answered),
    JSON.stringify(after.playedAt),
  ]);
}

function summarizeStory(story: StoryState, tinker: TinkerState, content: GameContent, now: number): StorySummary {
  const full = story.nerve >= rules.nerveCapOf(story);
  return {
    nerve: story.nerve,
    nerveCap: rules.nerveCapOf(story),
    nextNerveAt: full ? null : new Date(story.nerveAt + rules.NERVE_MS).toISOString(),
    needles: rules.visibleNeedles(story.qualities),
    letters: story.hand.length,
    backRent: rules.backRentOwed(story),
    debts: rules.debtsOwed(story).map(({ id, label, crowns }) => ({ id, label, crowns })),
    openScenes: rules.availableStorylets(tinker, story, content.rules, now).length,
    inInfirmary: rules.heldAtInfirmary(story),
    qualities: Object.fromEntries(Object.entries(story.qualities).filter(([, value]) => value > 0)),
  };
}

export interface Advanced {
  loaded: Loaded;
  state: TinkerState;
  story: StoryState;
  storyBefore: StoryState;
  events: GameEvent[];
  storyEvents: StoryEvent[];
  trades: TradeNote[];
  seq: number;
}

/**
 * Brings a Tinker up to now inside a transaction: settles the Exchange,
 * resolves the queue (refilling the Boiler when `refill`, as a check-in
 * does), and refreshes the story. Logs and saves all of it, and returns the
 * state for the operation that follows. Only opening the workshop passes
 * `visit`, so only it can count toward record.check_ins (Jeremy, 22 October
 * 2026: a long first sitting must not roll into Act I through the Exchange).
 */
export async function advance(tx: Tx, content: GameContent, tinkerId: number, now: number, refill: boolean, visit = false): Promise<Advanced> {
  const trades = await settle(tx, content, tinkerId, now);
  await deliverCrates(tx, content, tinkerId, now);
  const loaded = await lockAndLoad(tx, tinkerId);
  const resolved = refill ? rules.checkIn(loaded.state, content.rules, now, loaded.boilerHours) : rules.resolve(loaded.state, content.rules, now);
  const storyBefore = await loadStory(tx, tinkerId);
  // A workshop open may count as a visit first, so a scene gated on visits opens as the player arrives.
  const counted = visit ? rules.countCheckIn(storyBefore, now) : { story: storyBefore, event: null };
  const refreshed = rules.refreshStory(counted.story, resolved.state, content.rules, now);
  if (counted.event) refreshed.events.unshift(counted.event);
  const state = { ...resolved.state, rng: refreshed.tinker.rng };
  const version = content.rules.version;
  const entries: LogEntry[] = [
    ...fromRules(resolved.events),
    ...refreshed.events.map((event) => ({ type: event.type, at: event.at, payload: event })),
  ];
  if (refill) entries.push({ type: "checked_in", at: now, payload: { steamUntil: state.steamUntil } });
  const seq = await appendEvents(tx, tinkerId, loaded.lastSeq, entries, version);
  await saveState(tx, tinkerId, loaded, state, seq, version);
  await saveStory(tx, tinkerId, storyBefore, refreshed.story);
  return { loaded, state, story: refreshed.story, storyBefore, events: resolved.events, storyEvents: refreshed.events, trades, seq };
}

export function fromRules(events: GameEvent[]): LogEntry[] {
  return events.map((event) => ({ type: event.type, at: event.at, payload: event }));
}

/**
 * Orders on the desk plus those due by the stored clock, up to the desk's
 * size. The desk itself draws them when it is next opened; until trading
 * first opens there is no clock, so nothing is counted.
 */
function waitingOrders(desk: rules.WorkOrderState, now: number): number {
  const due = desk.nextAt !== null && desk.nextAt <= now ? Math.floor((now - desk.nextAt) / rules.WORK_ORDER_MS) + 1 : 0;
  return Math.min(rules.WORK_ORDERS_HELD, desk.offers.length + due);
}

export async function view(tx: Tx, tinkerId: number, content: GameContent, now = Date.now()): Promise<TinkerView> {
  const row = (await tx.query("SELECT id, name, crowns, cogs, progress_ms, steam_until, resolved_to, work_orders FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  const loaded = await lockAndLoad(tx, tinkerId);
  const boostUntil = loaded.state.boostUntil;
  return {
    id: Number(row.id),
    name: row.name,
    crowns: Number(row.crowns),
    cogs: Number(row.cogs),
    upgrades: {
      queueSlots: loaded.queueSlots,
      boilerHours: loaded.boilerHours,
      boostUntil: boostUntil > now ? new Date(boostUntil).toISOString() : null,
    },
    inventory: loaded.stacks.sort((a, b) => a.item.localeCompare(b.item) || Number(a.bound) - Number(b.bound)),
    skills: Object.entries(loaded.state.skillXp)
      .map(([skill, xp]) => ({ skill, xp, level: rules.levelFor(xp, content.rules) }))
      .sort((a, b) => a.skill.localeCompare(b.skill)),
    queue: loaded.state.queue,
    progressMs: loaded.state.progressMs,
    headMs: rules.headMs(loaded.state, content.rules),
    steamUntil: row.steam_until.toISOString(),
    resolvedTo: row.resolved_to.toISOString(),
    weapon: loaded.state.weapon,
    armour: loaded.state.armour,
    worn: loaded.state.worn,
    tools: loaded.state.tools,
    bossesBeaten: loaded.state.bossesBeaten,
    story: summarizeStory(await loadStory(tx, tinkerId), loaded.state, content, now),
    workOrders: waitingOrders(row.work_orders as rules.WorkOrderState, now),
  };
}


/**
 * Starts a Tinker over in its own slot: a fresh workshop under the same name,
 * as on the day the keys were taken. Progress goes (skills, stores, Crowns,
 * queue, story, Work Orders, open Exchange orders); what Cogs bought stays
 * (Cogs, the Cog Shop's upgrades and crates still on their way). The event
 * log is append-only, so the reset is logged, not erased. A Tinker in a guild,
 * or with Crowns pledged to a charter, must leave or be refunded first, so no
 * guild loses a member or a pledge without its own rules running.
 */
export async function resetTinker(db: Db, content: GameContent, tinkerId: number, confirmName: string, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const row = (await tx.query("SELECT name, last_seq FROM tinkers WHERE id = $1 FOR UPDATE", [tinkerId])).rows[0];
    if (!row) throw new NotFound(`no Tinker ${tinkerId}`);
    if (confirmName.trim() !== row.name) throw new BadRequest(`type ${row.name} to start over`);
    if ((await tx.query("SELECT 1 FROM guild_members WHERE tinker_id = $1", [tinkerId])).rowCount) {
      throw new BadRequest("leave your guild before starting over");
    }
    const pledged = await tx.query(
      `SELECT 1 FROM guild_pledges p JOIN guilds g ON g.id = p.guild_id
       WHERE p.tinker_id = $1 AND p.refunded_at IS NULL AND g.status = 'charter'`,
      [tinkerId],
    );
    if (pledged.rowCount) throw new BadRequest("your Crowns are pledged to a charter; withdraw them before starting over");

    for (const table of ["inventory", "skills", "queue", "qualities", "guild_requests"]) {
      await tx.query(`DELETE FROM ${table} WHERE tinker_id = $1`, [tinkerId]);
    }
    // The stock went with the stores, so open orders simply close.
    await tx.query(
      "UPDATE exchange_orders SET closed_at = $2, closed_reason = 'cancelled' WHERE tinker_id = $1 AND closed_at IS NULL",
      [tinkerId, new Date(now)],
    );
    const version = content.rules.version;
    const story = rules.newStory(now);
    await tx.query(
      `UPDATE tinkers SET crowns = $2, progress_ms = 0, resolved_to = $3, steam_until = $4, content_version = $5,
         weapon = NULL, armour = NULL, worn = '{}', tools = '{}', head_tool = 0, ration_debt = 0, pity = '{}', bosses_beaten = '[]',
         nerve = $6, nerve_at = $7, post_at = $8, hand = '[]', needle_at = '{}', check_in_at = NULL,
         answered = '[]', played_at = '{}', work_orders = DEFAULT, guide = NULL, head_boosted = false
       WHERE id = $1`,
      [
        tinkerId,
        content.start.crowns,
        new Date(now),
        new Date(now + rules.BOILER_HOURS * HOUR_MS),
        version,
        story.nerve,
        new Date(story.nerveAt),
        new Date(story.postAt),
      ],
    );
    for (const stack of content.start.inventory) {
      await tx.query("INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, $3, $4)", [tinkerId, stack.item, stack.bound, stack.qty]);
    }
    const seq = await appendEvents(
      tx,
      tinkerId,
      Number(row.last_seq),
      [{ type: "tinker_reset", at: now, payload: { inventory: content.start.inventory, crowns: content.start.crowns } }],
      version,
    );
    await tx.query("UPDATE tinkers SET last_seq = $2 WHERE id = $1", [tinkerId, seq]);
    return outcome(await view(tx, tinkerId, content, now), []);
  });
}

export async function createTinker(db: Db, content: GameContent, login: string, name: string, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const account = (
      await tx.query(
        `INSERT INTO accounts (login, created_at) VALUES ($1, $2)
         ON CONFLICT (login) DO UPDATE SET login = EXCLUDED.login RETURNING id`,
        [login, new Date(now)],
      )
    ).rows[0];
    const version = content.rules.version;
    const story = rules.newStory(now);
    const tinkerId = Number(
      (
        await tx.query(
          `INSERT INTO tinkers (account_id, name, crowns, resolved_to, steam_until, content_version, nerve, nerve_at, post_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            account.id,
            name,
            content.start.crowns,
            new Date(now),
            new Date(now + rules.BOILER_HOURS * HOUR_MS),
            version,
            story.nerve,
            new Date(story.nerveAt),
            new Date(story.postAt),
          ],
        )
      ).rows[0].id,
    );
    for (const stack of content.start.inventory) {
      await tx.query(
        `INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tinker_id, item, bound) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
        [tinkerId, stack.item, stack.bound, stack.qty],
      );
    }
    // Each Tinker's generator is seeded from its id, so two Tinkers never share a run of luck.
    const seed = Number(BigInt.asUintN(32, BigInt(tinkerId) * 2654435761n));
    await tx.query("UPDATE tinkers SET rng = $2 WHERE id = $1", [tinkerId, seed]);
    const seq = await appendEvents(
      tx,
      tinkerId,
      0,
      [{ type: "tinker_created", at: now, payload: { name, inventory: content.start.inventory, crowns: content.start.crowns, seed } }],
      version,
    );
    await tx.query("UPDATE tinkers SET last_seq = $2 WHERE id = $1", [tinkerId, seq]);
    return outcome(await view(tx, tinkerId, content, now), []);
  });
}

/** A check-in, made when the workshop opens: resolves everything up to now, refills the Boiler, and may count a visit. */
export async function checkIn(db: Db, content: GameContent, tinkerId: number, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const advanced = await advance(tx, content, tinkerId, now, true, true);
    return outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents);
  });
}

/**
 * A look while the Tinker is present: resolves up to now without refilling
 * the Boiler, so a client can watch the work land between check-ins.
 */
export async function look(db: Db, content: GameContent, tinkerId: number, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const advanced = await advance(tx, content, tinkerId, now, false);
    return outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents);
  });
}

/** Every monster's outlook for this Tinker as of now, read-only: kill times and a boss's win chance. */
export async function fightOutlooks(db: Db, content: GameContent, tinkerId: number, now: number): Promise<rules.FightOutlook[]> {
  return withTransaction(db, async (tx) => {
    const { state } = await advance(tx, content, tinkerId, now, false);
    return [...content.rules.monsters.values()].map((monster) => rules.fightOutlook(state, content.rules, monster));
  });
}

export interface LoadoutWeapon {
  item: string;
  style: string;
  level_required: number;
  power: number;
  accuracy: number;
  /** The Tinker's level in the weapon's style is high enough to wield it. */
  usable: boolean;
  equipped: boolean;
  /** How every fight would go with this weapon in hand. */
  outlooks: rules.FightOutlook[];
}

/** Every weapon the Tinker owns, with how each fight would go if it were equipped, so weapons can be compared. */
export async function loadout(db: Db, content: GameContent, tinkerId: number, now: number): Promise<{ weapons: LoadoutWeapon[] }> {
  return withTransaction(db, async (tx) => {
    const { state } = await advance(tx, content, tinkerId, now, false);
    const owned = [...content.rules.weapons.values()].filter((weapon) => (state.inventory[weapon.item] ?? 0) > 0);
    return {
      weapons: owned.map((weapon) => {
        const wielding = { ...state, weapon: weapon.item };
        const level = rules.levelFor(state.skillXp[weapon.style] ?? 0, content.rules);
        return {
          ...weapon,
          usable: level >= weapon.level_required,
          equipped: state.weapon === weapon.item,
          outlooks: [...content.rules.monsters.values()].map((monster) => rules.fightOutlook(wielding, content.rules, monster)),
        };
      }),
    };
  });
}

/** The Tinkers on one account, oldest first; an unknown login has none. */
export async function listTinkers(db: Db, login: string): Promise<{ id: number; name: string }[]> {
  const rows = (
    await db.query(
      "SELECT t.id, t.name FROM tinkers t JOIN accounts a ON a.id = t.account_id WHERE a.login = $1 ORDER BY t.id",
      [login],
    )
  ).rows;
  return rows.map((row) => ({ id: Number(row.id), name: row.name }));
}

/** Runs a change to the Tinker's own state at a check-in: brings it up to now, applies the change, and logs it. */
async function atCheckIn(
  db: Db,
  content: GameContent,
  tinkerId: number,
  now: number,
  change: (state: TinkerState, loaded: Loaded) => TinkerState,
  entry: LogEntry,
): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const advanced = await advance(tx, content, tinkerId, now, true);
    let changed: TinkerState;
    try {
      changed = change(advanced.state, advanced.loaded);
    } catch (error) {
      throw new BadRequest((error as Error).message);
    }
    const version = content.rules.version;
    const seq = await appendEvents(tx, tinkerId, advanced.seq, [entry], version);
    await saveState(tx, tinkerId, await lockAndLoad(tx, tinkerId), changed, seq, version);
    return outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents);
  });
}

/** Sets the queue at a check-in: resolves first, so time already spent is kept. */
export async function setQueue(db: Db, content: GameContent, tinkerId: number, queue: QueueEntry[], now: number): Promise<Outcome> {
  for (const entry of queue) {
    if (!content.rules.actions.has(entry.actionId) && !content.rules.monsters.has(entry.actionId)) {
      throw new BadRequest(`unknown action or monster ${entry.actionId}`);
    }
  }
  const qualities: Record<string, number> = {};
  for (const row of (await db.query("SELECT name, value FROM qualities WHERE tinker_id = $1", [tinkerId])).rows) qualities[row.name] = Number(row.value);
  return atCheckIn(
    db,
    content,
    tinkerId,
    now,
    (state, loaded) => {
      // Work already queued keeps running; only new work must be in an open skill.
      for (const entry of queue) {
        const skill = content.rules.actions.get(entry.actionId)?.skill;
        if (skill && !rules.skillOpen(skill, qualities) && !state.queue.some((queued) => queued.actionId === entry.actionId)) {
          throw new Error(rules.SKILL_GATES[skill]!.reason);
        }
      }
      return rules.setQueue(state, queue, loaded.queueSlots);
    },
    { type: "queue_set", at: now, payload: { queue } },
  );
}

/** Equips a held weapon at a check-in: resolves first, so the fight under way finishes with the old one. */
export async function equip(db: Db, content: GameContent, tinkerId: number, item: string, now: number): Promise<Outcome> {
  return atCheckIn(db, content, tinkerId, now, (state) => rules.equip(state, content.rules, item), {
    type: "weapon_equipped",
    at: now,
    payload: { item },
  });
}

/** Puts on a held armour piece at a check-in: resolves first, so the fight under way finishes in the old one. */
export async function wear(db: Db, content: GameContent, tinkerId: number, item: string, now: number): Promise<Outcome> {
  return atCheckIn(db, content, tinkerId, now, (state) => rules.wear(state, content.rules, item), {
    type: "armour_worn",
    at: now,
    payload: { item },
  });
}

export class BadRequest extends Error {}

/** The first-session guide's progress, as the client keeps it (client/src/Guide.tsx); null before its first save. */
export interface GuideProgress {
  acknowledged: string[];
  skipped: boolean;
  seen?: string[];
  opened?: boolean;
}

export async function readGuide(db: Db, tinkerId: number): Promise<{ guide: GuideProgress | null }> {
  const row = (await db.query<{ guide: GuideProgress | null }>("SELECT guide FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  if (!row) throw new NotFound(`no Tinker ${tinkerId}`);
  return { guide: row.guide };
}

export async function saveGuide(db: Db, tinkerId: number, guide: GuideProgress): Promise<{ guide: GuideProgress }> {
  const saved = await db.query("UPDATE tinkers SET guide = $2 WHERE id = $1", [tinkerId, JSON.stringify(guide)]);
  if (saved.rowCount === 0) throw new NotFound(`no Tinker ${tinkerId}`);
  return { guide };
}
