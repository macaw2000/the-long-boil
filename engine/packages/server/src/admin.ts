// The admin console (build plan milestone 14): who is playing, buying and
// signing in, and the tools to act on it. Everything here is read from the
// tables the game already keeps (accounts, Tinkers, the event log, crate
// deliveries, chat), plus the account's email, provider, last visit and ban.
// Only admins reach these functions (the /admin/ routes in api.ts).

import { levelFor, type Content as RulesContent } from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { cancelOrder } from "./market.js";
import { BadRequest, NotFound } from "./tinkers.js";

export type BanKind = "chat" | "full";

export interface Ban {
  kind: BanKind;
  reason: string | null;
  at: string;
}

/** A visit is counted again once a minute at most, so a busy session costs one write a minute. */
const SEEN_EVERY_MS = 60_000;

/**
 * Records who an account is and when it was last seen, creating the account
 * if this is its first request, and returns its ban, if any. Last seen is on
 * the wall clock, since it is about real people; a new account is created on
 * the game's clock, as createTinker does, because the trading gate measures
 * the account's age on it.
 */
export async function touchAccount(
  db: Db,
  login: string,
  who: { email: string | null; provider: string | null },
  gameNow: number,
  at = Date.now(),
): Promise<Ban | null> {
  const seen = new Date(at);
  const row = (
    await db.query(
      `INSERT INTO accounts (login, created_at, email, provider, last_seen_at) VALUES ($1, $6, $3, $4, $2)
       ON CONFLICT (login) DO UPDATE SET
         email = coalesce(EXCLUDED.email, accounts.email),
         provider = coalesce(EXCLUDED.provider, accounts.provider),
         last_seen_at = CASE WHEN accounts.last_seen_at IS NULL OR accounts.last_seen_at < $2 - make_interval(secs => $5)
                             THEN EXCLUDED.last_seen_at ELSE accounts.last_seen_at END
       RETURNING ban, ban_reason, banned_at`,
      [login, seen, who.email, who.provider, SEEN_EVERY_MS / 1000, new Date(gameNow)],
    )
  ).rows[0];
  return banOf(row);
}

function banOf(row: { ban: BanKind | null; ban_reason: string | null; banned_at: Date | null } | undefined): Ban | null {
  return row?.ban ? { kind: row.ban, reason: row.ban_reason, at: row.banned_at!.toISOString() } : null;
}

/** The ban on the account that owns this Tinker, if any. */
export async function banOfTinker(db: Db, tinkerId: number): Promise<Ban | null> {
  const row = (
    await db.query("SELECT a.ban, a.ban_reason, a.banned_at FROM accounts a JOIN tinkers t ON t.account_id = a.id WHERE t.id = $1", [tinkerId])
  ).rows[0];
  return banOf(row);
}

const DAY_MS = 86_400_000;

/** Total level across a Tinker's skills, from the XP curve. */
function totalLevel(rules: RulesContent, skills: { xp: number }[]): number {
  return skills.reduce((sum, skill) => sum + levelFor(skill.xp, rules), 0);
}

/** The crate price in cents, for revenue. */
const priceOf = (content: GameContent) => content.rules.shop?.crate.priceCents ?? 0;

export interface Overview {
  accounts: number;
  tinkers: number;
  newAccounts: { day: string; count: number }[];
  active: { day: number; week: number };
  online: number;
  revenue: { cents: number; crates: number; buyers: number; refunded: number };
  funnel: { label: string; tinkers: number }[];
}

/** The headline numbers: sign-ups by day for two weeks, who is active, revenue, and how far Tinkers get. */
export async function overview(db: Db, content: GameContent, online: number, at = Date.now()): Promise<Overview> {
  const now = new Date(at);
  const counts = (
    await db.query(
      `SELECT (SELECT count(*) FROM accounts) AS accounts,
              (SELECT count(*) FROM tinkers) AS tinkers,
              (SELECT count(*) FROM accounts WHERE last_seen_at > $1) AS day,
              (SELECT count(*) FROM accounts WHERE last_seen_at > $2) AS week`,
      [new Date(at - DAY_MS), new Date(at - 7 * DAY_MS)],
    )
  ).rows[0];
  const days = (
    await db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, count(a.id) AS count
       FROM generate_series(date_trunc('day', $1::timestamptz) - interval '13 days', date_trunc('day', $1::timestamptz), interval '1 day') AS d
       LEFT JOIN accounts a ON date_trunc('day', a.created_at) = d
       GROUP BY d ORDER BY d`,
      [now],
    )
  ).rows.map((row) => ({ day: row.day, count: Number(row.count) }));
  const sales = (
    await db.query(
      `SELECT coalesce(sum(qty) FILTER (WHERE revoked_at IS NULL), 0) AS crates,
              count(DISTINCT tinker_id) FILTER (WHERE revoked_at IS NULL) AS buyers,
              coalesce(sum(qty) FILTER (WHERE revoked_at IS NOT NULL), 0) AS refunded
       FROM crate_deliveries WHERE source = 'stripe'`,
    )
  ).rows[0];
  const quality = async (name: string, at: number) =>
    Number((await db.query("SELECT count(*) AS n FROM qualities WHERE name = $1 AND value >= $2", [name, at])).rows[0].n);
  const scrapjaw = Number(
    (await db.query(`SELECT count(*) AS n FROM tinkers WHERE bosses_beaten ? 'monster.rustmoor.scrapjaw'`)).rows[0].n,
  );
  const tinkers = Number(counts.tinkers);
  return {
    accounts: Number(counts.accounts),
    tinkers,
    newAccounts: days,
    active: { day: Number(counts.day), week: Number(counts.week) },
    online,
    revenue: { cents: Number(sales.crates) * priceOf(content), crates: Number(sales.crates), buyers: Number(sales.buyers), refunded: Number(sales.refunded) },
    funnel: [
      { label: "Started a Tinker", tinkers },
      { label: "Finished the Prologue", tinkers: await quality("prologue.progress", 100) },
      { label: "Act I under way", tinkers: await quality("act1.progress", 20) },
      { label: "Beat Scrapjaw", tinkers: scrapjaw },
      { label: "Earned the Foundry Pass", tinkers: await quality("act1.progress", 80) },
      { label: "Chose an Ambition", tinkers: await quality("act1.progress", 100) },
    ],
  };
}

export interface PlayerRow {
  account: number;
  login: string;
  email: string | null;
  provider: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  ban: Ban | null;
  spentCents: number;
  tinkers: { id: number; name: string; totalLevel: number; act1: number; crowns: number; cogs: number }[];
}

/** Every account, most recently seen first, optionally narrowed by email, login or Tinker name. */
export async function players(db: Db, content: GameContent, search = "", limit = 200): Promise<PlayerRow[]> {
  const q = search.trim().toLowerCase();
  const accounts = (
    await db.query(
      `SELECT a.id, a.login, a.email, a.provider, a.created_at, a.last_seen_at, a.ban, a.ban_reason, a.banned_at
       FROM accounts a
       WHERE $1 = '' OR lower(coalesce(a.email, '')) LIKE '%' || $1 || '%' OR lower(a.login) LIKE '%' || $1 || '%'
          OR EXISTS (SELECT 1 FROM tinkers t WHERE t.account_id = a.id AND lower(t.name) LIKE '%' || $1 || '%')
       ORDER BY a.last_seen_at DESC NULLS LAST, a.id DESC LIMIT $2`,
      [q, limit],
    )
  ).rows;
  if (!accounts.length) return [];
  const ids = accounts.map((row) => row.id);
  const tinkers = (
    await db.query(
      `SELECT t.id, t.account_id, t.name, t.crowns, t.cogs, coalesce(q.value, 0) AS act1
       FROM tinkers t LEFT JOIN qualities q ON q.tinker_id = t.id AND q.name = 'act1.progress'
       WHERE t.account_id = ANY($1) ORDER BY t.id`,
      [ids],
    )
  ).rows;
  const skills = (await db.query("SELECT tinker_id, xp FROM skills WHERE tinker_id = ANY($1)", [tinkers.map((row) => row.id)])).rows;
  const spent = (
    await db.query(
      `SELECT t.account_id, sum(d.qty) AS crates FROM crate_deliveries d JOIN tinkers t ON t.id = d.tinker_id
       WHERE d.source = 'stripe' AND d.revoked_at IS NULL AND t.account_id = ANY($1) GROUP BY t.account_id`,
      [ids],
    )
  ).rows;
  const crates = new Map(spent.map((row) => [String(row.account_id), Number(row.crates)]));
  return accounts.map((row) => ({
    account: Number(row.id),
    login: row.login,
    email: row.email,
    provider: row.provider,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    ban: banOf(row),
    spentCents: (crates.get(String(row.id)) ?? 0) * priceOf(content),
    tinkers: tinkers
      .filter((tinker) => String(tinker.account_id) === String(row.id))
      .map((tinker) => ({
        id: Number(tinker.id),
        name: tinker.name,
        totalLevel: totalLevel(
          content.rules,
          skills.filter((skill) => String(skill.tinker_id) === String(tinker.id)).map((skill) => ({ xp: Number(skill.xp) })),
        ),
        act1: Number(tinker.act1),
        crowns: Number(tinker.crowns),
        cogs: Number(tinker.cogs),
      })),
  }));
}

export interface PlayerDetail extends PlayerRow {
  events: { tinker: string; type: string; at: string }[];
  purchases: Purchase[];
  chat: { id: number; tinker: string; channel: string; text: string; at: string; removed: boolean }[];
}

export interface Purchase {
  id: number;
  tinkerId: number;
  tinker: string;
  email: string | null;
  crates: number;
  cents: number;
  reference: string | null;
  at: string;
  refunded: boolean;
}

/** One account in full: its row, its Tinkers' last 60 events, its purchases and its last 60 chat messages. */
export async function player(db: Db, content: GameContent, account: number): Promise<PlayerDetail> {
  const login = (await db.query("SELECT login FROM accounts WHERE id = $1", [account])).rows[0]?.login;
  if (!login) throw new NotFound(`no account ${account}`);
  const row = (await players(db, content, "", 100000)).find((candidate) => candidate.account === account)!;
  const events = (
    await db.query(
      `SELECT t.name, e.type, e.at FROM events e JOIN tinkers t ON t.id = e.tinker_id
       WHERE t.account_id = $1 ORDER BY e.at DESC, e.seq DESC LIMIT 60`,
      [account],
    )
  ).rows.map((event) => ({ tinker: event.name, type: event.type, at: new Date(event.at).toISOString() }));
  const chat = (
    await db.query(
      `SELECT m.id, t.name, m.channel, m.body, m.at, m.removed_at FROM chat_messages m JOIN tinkers t ON t.id = m.tinker_id
       WHERE m.account_id = $1 ORDER BY m.id DESC LIMIT 60`,
      [account],
    )
  ).rows.map((message) => ({
    id: Number(message.id),
    tinker: message.name,
    channel: message.channel,
    text: message.body,
    at: message.at.toISOString(),
    removed: message.removed_at !== null,
  }));
  return { ...row, events, purchases: await purchases(db, content, account), chat };
}

/** Every Stripe purchase, newest first, or one account's. */
export async function purchases(db: Db, content: GameContent, account?: number): Promise<Purchase[]> {
  const rows = (
    await db.query(
      `SELECT d.id, d.tinker_id, t.name, a.email, d.qty, d.reference, d.created_at, d.revoked_at
       FROM crate_deliveries d JOIN tinkers t ON t.id = d.tinker_id JOIN accounts a ON a.id = t.account_id
       WHERE d.source = 'stripe' AND ($1::bigint IS NULL OR a.id = $1)
       ORDER BY d.created_at DESC LIMIT 500`,
      [account ?? null],
    )
  ).rows;
  return rows.map((row) => ({
    id: Number(row.id),
    tinkerId: Number(row.tinker_id),
    tinker: row.name,
    email: row.email,
    crates: Number(row.qty),
    cents: Number(row.qty) * priceOf(content),
    reference: row.reference,
    at: row.created_at.toISOString(),
    refunded: row.revoked_at !== null,
  }));
}

/**
 * Bans an account, or changes its ban. A full ban also cancels the account's
 * open Exchange orders, returning their goods and Crowns, so nobody trades
 * against a player who cannot come back to answer.
 */
export async function setBan(db: Db, content: GameContent, account: number, kind: BanKind, reason: string, at: number): Promise<Ban> {
  if (kind !== "chat" && kind !== "full") throw new BadRequest("a ban is chat or full");
  const row = (
    await db.query("UPDATE accounts SET ban = $2, ban_reason = $3, banned_at = $4 WHERE id = $1 RETURNING ban, ban_reason, banned_at", [
      account,
      kind,
      reason.trim() || null,
      new Date(at),
    ])
  ).rows[0];
  if (!row) throw new NotFound(`no account ${account}`);
  if (kind === "full") {
    const open = (
      await db.query(
        "SELECT o.id, o.tinker_id FROM exchange_orders o JOIN tinkers t ON t.id = o.tinker_id WHERE t.account_id = $1 AND o.closed_at IS NULL",
        [account],
      )
    ).rows;
    for (const order of open) await cancelOrder(db, content, Number(order.tinker_id), Number(order.id), at);
  }
  return banOf(row)!;
}

/** Lifts an account's ban. */
export async function liftBan(db: Db, account: number): Promise<void> {
  const done = await db.query("UPDATE accounts SET ban = NULL, ban_reason = NULL, banned_at = NULL WHERE id = $1", [account]);
  if (!done.rowCount) throw new NotFound(`no account ${account}`);
}

/** Hides one chat message from everyone; it stays in the table, marked removed. */
export async function removeMessage(db: Db, message: number, at: number): Promise<{ channel: string }> {
  const row = (
    await db.query("UPDATE chat_messages SET removed_at = coalesce(removed_at, $2) WHERE id = $1 RETURNING channel", [message, new Date(at)])
  ).rows[0];
  if (!row) throw new NotFound(`no message ${message}`);
  return { channel: row.channel };
}
