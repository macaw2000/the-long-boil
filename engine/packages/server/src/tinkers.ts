// A Tinker's state lives in Postgres: the ordered event log plus the
// projections in tinkers, inventory, skills and queue. Every operation here
// locks the Tinker's row, resolves time with the pure rules, appends the
// events and updates the projections in one transaction.

import * as rules from "@long-boil/rules";
import type { GameEvent, QueueEntry, TinkerState } from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";

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
  inventory: StackView[];
  skills: { skill: string; xp: number; level: number }[];
  queue: QueueEntry[];
  progressMs: number;
  steamUntil: string;
  resolvedTo: string;
  weapon: string | null;
  bossesBeaten: string[];
}

export interface Outcome {
  tinker: TinkerView;
  events: GameEvent[];
}

interface Loaded {
  state: TinkerState;
  stacks: StackView[];
  lastSeq: number;
}

async function lockAndLoad(tx: Tx, tinkerId: number): Promise<Loaded> {
  const row = (
    await tx.query(
      `SELECT progress_ms, resolved_to, steam_until, last_seq, crowns, weapon, rng, ration_debt, pity, bosses_beaten
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
      rng: Number(row.rng),
      rationDebt: Number(row.ration_debt),
      pity: row.pity,
      bossesBeaten: row.bosses_beaten,
    },
    stacks,
    lastSeq: Number(row.last_seq),
  };
}

/**
 * Writes the new state's projections. The rules see one count per item; the
 * database keeps bound and unbound stacks apart. Gains are unbound; losses
 * use bound stock first, so a starter crate is eaten before bought food.
 */
async function saveState(tx: Tx, tinkerId: number, loaded: Loaded, state: TinkerState, lastSeq: number, version: string) {
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
       crowns = $7, weapon = $8, rng = $9, ration_debt = $10, pity = $11, bosses_beaten = $12
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
    ],
  );
}

type LogEntry = { type: string; at: number; payload: unknown };

async function appendEvents(tx: Tx, tinkerId: number, lastSeq: number, entries: LogEntry[], version: string): Promise<number> {
  let seq = lastSeq;
  for (const entry of entries) {
    seq += 1;
    await tx.query(
      "INSERT INTO events (tinker_id, seq, type, at, payload, content_version) VALUES ($1, $2, $3, $4, $5, $6)",
      [tinkerId, seq, entry.type, new Date(entry.at), JSON.stringify(entry.payload), version],
    );
  }
  return seq;
}

function fromRules(events: GameEvent[]): LogEntry[] {
  return events.map((event) => ({ type: event.type, at: event.at, payload: event }));
}

async function view(tx: Tx, tinkerId: number, content: GameContent): Promise<TinkerView> {
  const row = (await tx.query("SELECT id, name, crowns, progress_ms, steam_until, resolved_to FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  const loaded = await lockAndLoad(tx, tinkerId);
  return {
    id: Number(row.id),
    name: row.name,
    crowns: Number(row.crowns),
    inventory: loaded.stacks.sort((a, b) => a.item.localeCompare(b.item) || Number(a.bound) - Number(b.bound)),
    skills: Object.entries(loaded.state.skillXp)
      .map(([skill, xp]) => ({ skill, xp, level: rules.levelFor(xp, content.rules) }))
      .sort((a, b) => a.skill.localeCompare(b.skill)),
    queue: loaded.state.queue,
    progressMs: loaded.state.progressMs,
    steamUntil: row.steam_until.toISOString(),
    resolvedTo: row.resolved_to.toISOString(),
    weapon: loaded.state.weapon,
    bossesBeaten: loaded.state.bossesBeaten,
  };
}

export class NotFound extends Error {}

export async function createTinker(db: Db, content: GameContent, login: string, name: string, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const account = (
      await tx.query(
        `INSERT INTO accounts (login) VALUES ($1)
         ON CONFLICT (login) DO UPDATE SET login = EXCLUDED.login RETURNING id`,
        [login],
      )
    ).rows[0];
    const version = content.rules.version;
    const tinkerId = Number(
      (
        await tx.query(
          `INSERT INTO tinkers (account_id, name, crowns, resolved_to, steam_until, content_version)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [account.id, name, content.start.crowns, new Date(now), new Date(now + rules.BOILER_HOURS * HOUR_MS), version],
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
    return { tinker: await view(tx, tinkerId, content), events: [] };
  });
}

/** A check-in: resolves everything up to now and refills the Boiler. */
export async function checkIn(db: Db, content: GameContent, tinkerId: number, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const loaded = await lockAndLoad(tx, tinkerId);
    const { state, events } = rules.checkIn(loaded.state, content.rules, now);
    const version = content.rules.version;
    const seq = await appendEvents(
      tx,
      tinkerId,
      loaded.lastSeq,
      [...fromRules(events), { type: "checked_in", at: now, payload: { steamUntil: state.steamUntil } }],
      version,
    );
    await saveState(tx, tinkerId, loaded, state, seq, version);
    return { tinker: await view(tx, tinkerId, content), events };
  });
}

/** Sets the queue at a check-in: resolves first, so time already spent is kept. */
export async function setQueue(db: Db, content: GameContent, tinkerId: number, queue: QueueEntry[], now: number): Promise<Outcome> {
  for (const entry of queue) {
    if (!content.rules.actions.has(entry.actionId) && !content.rules.monsters.has(entry.actionId)) {
      throw new BadRequest(`unknown action or monster ${entry.actionId}`);
    }
  }
  return withTransaction(db, async (tx) => {
    const loaded = await lockAndLoad(tx, tinkerId);
    const resolved = rules.checkIn(loaded.state, content.rules, now);
    let queued: TinkerState;
    try {
      queued = rules.setQueue(resolved.state, queue);
    } catch (error) {
      throw new BadRequest((error as Error).message);
    }
    const version = content.rules.version;
    const seq = await appendEvents(
      tx,
      tinkerId,
      loaded.lastSeq,
      [
        ...fromRules(resolved.events),
        { type: "checked_in", at: now, payload: { steamUntil: resolved.state.steamUntil } },
        { type: "queue_set", at: now, payload: { queue } },
      ],
      version,
    );
    await saveState(tx, tinkerId, loaded, queued, seq, version);
    return { tinker: await view(tx, tinkerId, content), events: resolved.events };
  });
}

/** Equips a held weapon at a check-in: resolves first, so the fight under way finishes with the old one. */
export async function equip(db: Db, content: GameContent, tinkerId: number, item: string, now: number): Promise<Outcome> {
  return withTransaction(db, async (tx) => {
    const loaded = await lockAndLoad(tx, tinkerId);
    const resolved = rules.checkIn(loaded.state, content.rules, now);
    let equipped: TinkerState;
    try {
      equipped = rules.equip(resolved.state, content.rules, item);
    } catch (error) {
      throw new BadRequest((error as Error).message);
    }
    const version = content.rules.version;
    const seq = await appendEvents(
      tx,
      tinkerId,
      loaded.lastSeq,
      [
        ...fromRules(resolved.events),
        { type: "checked_in", at: now, payload: { steamUntil: resolved.state.steamUntil } },
        { type: "weapon_equipped", at: now, payload: { item } },
      ],
      version,
    );
    await saveState(tx, tinkerId, loaded, equipped, seq, version);
    return { tinker: await view(tx, tinkerId, content), events: resolved.events };
  });
}

export class BadRequest extends Error {}
