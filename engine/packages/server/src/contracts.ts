// Guild Contracts on the server (work order 043). Work is counted in the
// transaction that settles it, from the same events, so a retry cannot count
// it twice. Counting holds the Tinker's row and then the week's; closing a
// week holds the guild's row and then the week's, in a transaction of its
// own, and pays into guild_token_payments rather than touching any Tinker.
// Neither ever waits on what the other holds first.

import * as rules from "@long-boil/rules";
import type { GameEvent } from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import type { LogEntry } from "./events.js";

export interface ContractView {
  kind: string;
  /** Seconds of work the guild has done, and this Tinker's part. */
  seconds: number;
  mine: number;
  targets: number[];
  reached: number;
}

export interface ContractsView {
  endsAt: string;
  contracts: ContractView[];
  /** Seconds this Tinker has put in across them, and the seconds that earn a payment. */
  mine: number;
  needed: number;
  /** Guild Tokens this Tinker holds, with any still to be collected. */
  tokens: number;
}

/** Draws a guild's week if it has not been: its contracts, and the members seen in the week before it. */
async function openWeek(tx: Tx, content: GameContent, guildId: number, week: number): Promise<void> {
  const kinds = rules.drawContracts(content.rules, guildId, week);
  const drawn = await tx.query("INSERT INTO guild_weeks (guild_id, week, kinds, reached) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [
    guildId,
    new Date(week),
    kinds,
    kinds.map(() => 0),
  ]);
  if (!drawn.rowCount) return;
  const members = (
    await tx.query(
      `SELECT m.account_id, m.joined_at FROM guild_members m JOIN tinkers t ON t.id = m.tinker_id
       WHERE m.guild_id = $1 AND t.resolved_to >= $2 AND m.joined_at < $3`,
      [guildId, new Date(week - rules.CONTRACT_WEEK_MS), new Date(week + rules.CONTRACT_WEEK_MS)],
    )
  ).rows;
  for (const member of members) await addToWeek(tx, guildId, week, Number(member.account_id), member.joined_at.getTime());
}

async function addToWeek(tx: Tx, guildId: number, week: number, accountId: number, joinedAt: number) {
  await tx.query("INSERT INTO guild_week_members (guild_id, week, account_id, share) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [
    guildId,
    new Date(week),
    accountId,
    rules.weekShare(week, joinedAt),
  ]);
}

/** Counts a member just joined, or just back after a long absence, into this week's targets. */
export async function joinWeek(tx: Tx, content: GameContent, guildId: number, accountId: number, now: number) {
  const week = rules.contractWeek(now);
  await openWeek(tx, content, guildId, week);
  await addToWeek(tx, guildId, week, accountId, now);
}

async function sizeOf(tx: Tx, guildId: number, week: number): Promise<number> {
  const row = (await tx.query("SELECT coalesce(sum(share), 0) AS size FROM guild_week_members WHERE guild_id = $1 AND week = $2", [guildId, new Date(week)])).rows[0];
  return Math.max(1, Number(row.size));
}

/** Seconds done by kind, in all and by one Tinker. */
async function tally(tx: Tx, guildId: number, week: number, tinkerId: number): Promise<Map<string, { all: number; mine: number }>> {
  const rows = (
    await tx.query(
      `SELECT kind, sum(seconds) AS all_seconds, coalesce(sum(seconds) FILTER (WHERE tinker_id = $3), 0) AS mine
       FROM guild_contract_shares WHERE guild_id = $1 AND week = $2 GROUP BY kind`,
      [guildId, new Date(week), tinkerId],
    )
  ).rows;
  return new Map(rows.map((row) => [row.kind as string, { all: Number(row.all_seconds), mine: Number(row.mine) }]));
}

/**
 * Counts work just settled toward the Tinker's guild. Returns log entries for
 * the tiers it carried the guild over, so the guild's activity tells of them.
 */
export async function countGuildWork(tx: Tx, content: GameContent, tinkerId: number, events: readonly GameEvent[], now: number): Promise<LogEntry[]> {
  if (!events.some((event) => event.type === "action_completed" || event.type === "monster_killed")) return [];
  const member = (await tx.query("SELECT guild_id, account_id, joined_at FROM guild_members WHERE tinker_id = $1", [tinkerId])).rows[0];
  if (!member) return [];
  const guildId = Number(member.guild_id);
  const entries: LogEntry[] = [];
  const weeks = [...rules.countedWork(events, content.rules, member.joined_at.getTime())].sort(([a], [b]) => a - b);
  for (const [week, work] of weeks) {
    if (now >= week + rules.CONTRACT_WEEK_MS + rules.CONTRACT_GRACE_MS) continue;
    await openWeek(tx, content, guildId, week);
    const row = (await tx.query("SELECT kinds, reached, closed_at FROM guild_weeks WHERE guild_id = $1 AND week = $2 FOR UPDATE", [guildId, new Date(week)])).rows[0];
    if (row.closed_at) continue;
    const kinds = row.kinds as string[];
    if (!kinds.some((kind) => work.has(kind))) continue;
    // One who was away when the week was drawn joins its size on coming back to work.
    await addToWeek(tx, guildId, week, Number(member.account_id), member.joined_at.getTime());
    for (const kind of kinds) {
      const seconds = work.get(kind);
      if (!seconds) continue;
      await tx.query(
        `INSERT INTO guild_contract_shares (guild_id, week, kind, tinker_id, seconds) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, week, kind, tinker_id) DO UPDATE SET seconds = guild_contract_shares.seconds + EXCLUDED.seconds`,
        [guildId, new Date(week), kind, tinkerId, Math.round(seconds)],
      );
    }
    const size = await sizeOf(tx, guildId, week);
    const done = await tally(tx, guildId, week, tinkerId);
    const before = row.reached as number[];
    const reached = kinds.map((kind, at) => Math.max(before[at]!, rules.tiersReached(done.get(kind)?.all ?? 0, size)));
    if (reached.some((tier, at) => tier > before[at]!)) {
      await tx.query("UPDATE guild_weeks SET reached = $3 WHERE guild_id = $1 AND week = $2", [guildId, new Date(week), reached]);
      kinds.forEach((kind, at) => {
        if (reached[at]! > before[at]!) entries.push({ type: "guild_tier", at: now, payload: { guild: guildId, kind, tier: reached[at] } });
      });
    }
  }
  return entries;
}

/** Puts payments due into a Tinker's hands; the Tinker's row is already locked. */
export async function collectTokens(tx: Tx, tinkerId: number, now: number): Promise<LogEntry[]> {
  const due = (
    await tx.query("UPDATE guild_token_payments SET collected = true WHERE tinker_id = $1 AND NOT collected RETURNING guild_id, week, tokens", [tinkerId])
  ).rows;
  if (!due.length) return [];
  const tokens = due.reduce((sum, row) => sum + Number(row.tokens), 0);
  await tx.query("UPDATE tinkers SET guild_tokens = guild_tokens + $2 WHERE id = $1", [tinkerId, tokens]);
  // Not a `guild` payload key: this is the Tinker's own business, not the guild's activity.
  return due.map((row) => ({ type: "guild_tokens_paid", at: now, payload: { fromGuild: Number(row.guild_id), week: row.week.toISOString(), tokens: Number(row.tokens) } }));
}

/** Closes a Tinker's guild's weeks whose time is up: pays its members and its Workshop, once. */
export async function closeWeeks(db: Db, tinkerId: number, now: number): Promise<void> {
  const ended = new Date(now - rules.CONTRACT_WEEK_MS - rules.CONTRACT_GRACE_MS);
  const due = (
    await db.query(
      `SELECT w.guild_id FROM guild_members m JOIN guild_weeks w ON w.guild_id = m.guild_id
       WHERE m.tinker_id = $1 AND w.closed_at IS NULL AND w.week <= $2 LIMIT 1`,
      [tinkerId, ended],
    )
  ).rows[0];
  if (!due) return;
  await withTransaction(db, async (tx) => {
    const guild = (await tx.query("SELECT id FROM guilds WHERE id = $1 AND status = 'active' FOR UPDATE", [due.guild_id])).rows[0];
    if (!guild) return;
    const weeks = (
      await tx.query("SELECT week, kinds, reached FROM guild_weeks WHERE guild_id = $1 AND closed_at IS NULL AND week <= $2 ORDER BY week FOR UPDATE", [guild.id, ended])
    ).rows;
    for (const row of weeks) {
      const tiers = (row.reached as number[]).reduce((sum, tier) => sum + tier, 0);
      if (tiers > 0) {
        await tx.query(
          `INSERT INTO guild_token_payments (account_id, week, guild_id, tinker_id, tokens)
           SELECT m.account_id, $2, $1, m.tinker_id, $3 FROM guild_members m
           JOIN guild_contract_shares s ON s.guild_id = m.guild_id AND s.tinker_id = m.tinker_id AND s.week = $2
           WHERE m.guild_id = $1 GROUP BY m.account_id, m.tinker_id HAVING sum(s.seconds) >= $4
           ON CONFLICT DO NOTHING`,
          [guild.id, row.week, tiers, rules.CONTRACT_MIN_HOURS * 3600],
        );
        await tx.query("UPDATE guilds SET workshop_points = workshop_points + $2 WHERE id = $1", [guild.id, tiers]);
      }
      await tx.query("UPDATE guild_weeks SET closed_at = $3 WHERE guild_id = $1 AND week = $2", [guild.id, row.week, new Date(now)]);
    }
  });
}

/** This week's contracts as a member sees them, drawing them if no one has yet. */
export async function readContracts(tx: Tx, content: GameContent, guildId: number, tinkerId: number, now: number): Promise<ContractsView> {
  const week = rules.contractWeek(now);
  await openWeek(tx, content, guildId, week);
  const row = (await tx.query("SELECT kinds, reached FROM guild_weeks WHERE guild_id = $1 AND week = $2", [guildId, new Date(week)])).rows[0];
  const targets = rules.contractTargets(await sizeOf(tx, guildId, week));
  const done = await tally(tx, guildId, week, tinkerId);
  const kinds = row.kinds as string[];
  const held = (
    await tx.query(
      `SELECT t.guild_tokens + coalesce((SELECT sum(tokens) FROM guild_token_payments p WHERE p.tinker_id = t.id AND NOT p.collected), 0) AS tokens
       FROM tinkers t WHERE t.id = $1`,
      [tinkerId],
    )
  ).rows[0];
  return {
    endsAt: new Date(week + rules.CONTRACT_WEEK_MS).toISOString(),
    contracts: kinds.map((kind, at) => ({ kind, seconds: done.get(kind)?.all ?? 0, mine: done.get(kind)?.mine ?? 0, targets, reached: (row.reached as number[])[at]! })),
    mine: kinds.reduce((sum, kind) => sum + (done.get(kind)?.mine ?? 0), 0),
    needed: rules.CONTRACT_MIN_HOURS * 3600,
    tokens: Number(held.tokens),
  };
}
