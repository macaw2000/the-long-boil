// City chat (build plan milestone 8): plain text, at most 280 characters,
// one message every 3 seconds per account. A mute hides a sender's account
// from the muting account only; nothing is deleted.

import type { Db } from "./db.js";
import { CITY, whisperChannel, type ChatMessage } from "./live.js";
import { Refused } from "./market.js";
import { BadRequest, NotFound } from "./tinkers.js";

export const CHAT_MAX_CHARS = 280;
export const CHAT_EVERY_MS = 3_000;
export const CHAT_HISTORY = 50;

async function accountOf(db: Db, tinkerId: number): Promise<{ accountId: number; name: string }> {
  const row = (await db.query("SELECT account_id, name FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  if (!row) throw new NotFound(`no Tinker ${tinkerId}`);
  return { accountId: Number(row.account_id), name: row.name };
}

function shape(row: { id: string; channel: string; tinker_id: string; name: string; body: string; at: Date }): ChatMessage {
  return { id: Number(row.id), channel: row.channel, tinker: { id: Number(row.tinker_id), name: row.name }, text: row.body, at: row.at.toISOString() };
}

/** Accounts this Tinker's account has muted. */
export async function mutedAccounts(db: Db, tinkerId: number): Promise<Set<number>> {
  const { accountId } = await accountOf(db, tinkerId);
  const rows = (await db.query("SELECT muted_account_id FROM chat_mutes WHERE account_id = $1", [accountId])).rows;
  return new Set(rows.map((row) => Number(row.muted_account_id)));
}

/** The channel's latest messages, oldest first, leaving out muted senders. */
export async function recentChat(db: Db, tinkerId: number, channel = CITY): Promise<{ messages: ChatMessage[]; muted: number[] }> {
  const { accountId } = await accountOf(db, tinkerId);
  const rows = (
    await db.query(
      `SELECT m.id, m.channel, m.tinker_id, t.name, m.body, m.at FROM chat_messages m JOIN tinkers t ON t.id = m.tinker_id
       WHERE m.channel = $1 AND m.account_id NOT IN (SELECT muted_account_id FROM chat_mutes WHERE account_id = $2)
       ORDER BY m.id DESC LIMIT $3`,
      [channel, accountId, CHAT_HISTORY],
    )
  ).rows;
  const muted = (
    await db.query(
      `SELECT DISTINCT ON (t.account_id) t.id FROM chat_mutes c JOIN tinkers t ON t.account_id = c.muted_account_id
       WHERE c.account_id = $1 ORDER BY t.account_id, t.id`,
      [accountId],
    )
  ).rows.map((row) => Number(row.id));
  return { messages: rows.reverse().map(shape), muted };
}

/** Stores a message and returns it with the sender's account, for the fan-out to filter mutes. */
export async function say(db: Db, tinkerId: number, text: string, now: number, channel = CITY): Promise<ChatMessage & { accountId: number }> {
  const body = text.trim();
  if (!body) throw new BadRequest("say something first");
  if ([...body].length > CHAT_MAX_CHARS) throw new BadRequest(`a message is at most ${CHAT_MAX_CHARS} characters`);
  const { accountId } = await accountOf(db, tinkerId);
  const last = (await db.query("SELECT max(at) AS at FROM chat_messages WHERE account_id = $1", [accountId])).rows[0].at as Date | null;
  if (last && now - last.getTime() < CHAT_EVERY_MS) throw new Refused("one message every 3 seconds");
  const row = (
    await db.query(
      `WITH m AS (INSERT INTO chat_messages (channel, tinker_id, account_id, body, at) VALUES ($1, $2, $3, $4, $5) RETURNING *)
       SELECT m.id, m.channel, m.tinker_id, t.name, m.body, m.at FROM m JOIN tinkers t ON t.id = m.tinker_id`,
      [channel, tinkerId, accountId, body, new Date(now)],
    )
  ).rows[0];
  return { ...shape(row), accountId };
}

/**
 * Whether one Tinker may whisper another: the other must exist, be on a
 * different account, and not have muted the sender's account. The refusal
 * does not say which, so a mute is not given away.
 */
export async function whisperTo(db: Db, tinkerId: number, otherId: number): Promise<string> {
  const { accountId } = await accountOf(db, tinkerId);
  const other = await accountOf(db, otherId).catch(() => null);
  if (!other) throw new NotFound(`no Tinker ${otherId}`);
  if (other.accountId === accountId) throw new BadRequest("that Tinker is on your own account");
  const muted = await db.query("SELECT 1 FROM chat_mutes WHERE account_id = $1 AND muted_account_id = $2", [other.accountId, accountId]);
  if (muted.rows.length) throw new Refused("your whisper cannot be delivered");
  return whisperChannel(tinkerId, otherId);
}

/** This Tinker's whisper conversations, latest first: who with, and the last word. */
export async function whisperInbox(db: Db, tinkerId: number): Promise<{ with: { id: number; name: string }; last: ChatMessage }[]> {
  const { accountId } = await accountOf(db, tinkerId);
  const rows = (
    await db.query(
      `SELECT DISTINCT ON (m.channel) m.id, m.channel, m.tinker_id, t.name, m.body, m.at
       FROM chat_messages m JOIN tinkers t ON t.id = m.tinker_id
       WHERE m.channel LIKE 'chat:dm:%'
         AND (split_part(m.channel, ':', 3)::bigint = $1 OR split_part(m.channel, ':', 4)::bigint = $1)
         AND m.account_id NOT IN (SELECT muted_account_id FROM chat_mutes WHERE account_id = $2)
       ORDER BY m.channel, m.id DESC`,
      [tinkerId, accountId],
    )
  ).rows;
  const conversations = [];
  for (const row of rows) {
    const [low, high] = row.channel.split(":").slice(2).map(Number);
    const otherId = low === tinkerId ? high : low;
    const other = await accountOf(db, otherId);
    conversations.push({ with: { id: otherId, name: other.name }, last: shape(row) });
  }
  return conversations.sort((a, b) => b.last.id - a.last.id);
}

/** Mutes or unmutes the account behind another Tinker, for this Tinker's account. */
export async function setMute(db: Db, tinkerId: number, otherTinkerId: number, muted: boolean): Promise<void> {
  const { accountId } = await accountOf(db, tinkerId);
  const other = await accountOf(db, otherTinkerId);
  if (other.accountId === accountId) throw new BadRequest("you cannot mute yourself");
  if (muted) {
    await db.query("INSERT INTO chat_mutes (account_id, muted_account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [accountId, other.accountId]);
  } else {
    await db.query("DELETE FROM chat_mutes WHERE account_id = $1 AND muted_account_id = $2", [accountId, other.accountId]);
  }
}
