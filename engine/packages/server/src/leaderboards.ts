// Leaderboards (GDD section 6, Leaderboards): total level, each of the
// sixteen skills, net worth, and guilds. There is no story board: the GDD
// rules one out so reading never turns into a race. Boards are read from the
// projections (skills, purse, inventory, open orders), so a Tinker counts as
// of the last time it was touched. The GDD keeps leaderboards in Valkey
// (section 11); until then Postgres answers, as it does for everything else.
// A fully banned account's Tinkers are never shown, nor counted in a guild.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { NotFound } from "./settle.js";
import { BadRequest } from "./tinkers.js";

/** How many rows a board shows; the caller's own row comes too when it is lower. */
export const BOARD_SIZE = 100;

/** Every board the server can answer: total level, net worth, guilds, then each of the GDD's sixteen skills. */
export const BOARDS = ["total", "net_worth", "guilds", ...rules.GDD_SKILLS] as const;
export type Board = (typeof BOARDS)[number];

/**
 * The boards a player is shown: a skill gets a tab once an action in the
 * content trains it, so a skill the game has not released has no empty board.
 */
export function shownBoards(content: GameContent): Board[] {
  const trained = new Set([...content.rules.actions.values()].map((action) => action.skill));
  return BOARDS.filter((board) => !(rules.GDD_SKILLS as readonly string[]).includes(board) || trained.has(board));
}

export interface BoardRow {
  rank: number;
  /** A Tinker's id, or a guild's on the guild board. */
  id: number;
  name: string;
  /** Total level, a skill's level, Crowns of net worth, or a guild's members' total levels. */
  value: number;
  /** XP on the level boards, members on the guild board, nothing on net worth. */
  detail: number | null;
  /** The caller's Tinker, or the caller's guild. */
  you: boolean;
}

export interface LeaderboardView {
  board: Board;
  boards: Board[];
  size: number;
  rows: BoardRow[];
  /** The caller's row wherever it falls, or null when it is not on this board. */
  you: BoardRow | null;
}

interface Entry {
  id: number;
  name: string;
  value: number;
  /** Breaks a tie in value: total XP on the total board, XP on a skill board. */
  tie: number;
  detail: number | null;
}

/** A Tinker is shown unless its account is fully banned (migration 018). */
const SHOWN = "a.ban IS DISTINCT FROM 'full'";

/** Best first. Equal scores share a rank, and the next rank skips as many as shared it. */
function ranked(entries: Entry[], mine: number | null): BoardRow[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value || b.tie - a.tie || a.name.localeCompare(b.name) || a.id - b.id);
  let place = 0;
  return sorted.map((entry, index) => {
    const before = sorted[index - 1];
    if (!before || before.value !== entry.value || before.tie !== entry.tie) place = index + 1;
    return { rank: place, id: entry.id, name: entry.name, value: entry.value, detail: entry.detail, you: entry.id === mine };
  });
}

async function shownTinkers(db: Db): Promise<Map<number, { name: string; crowns: number }>> {
  const rows = (await db.query(`SELECT t.id, t.name, t.crowns FROM tinkers t JOIN accounts a ON a.id = t.account_id WHERE ${SHOWN}`)).rows;
  return new Map(rows.map((row) => [Number(row.id), { name: row.name as string, crowns: Number(row.crowns) }]));
}

async function shownSkills(db: Db): Promise<Map<number, Record<string, number>>> {
  const rows = (
    await db.query(
      `SELECT s.tinker_id, s.skill, s.xp FROM skills s JOIN tinkers t ON t.id = s.tinker_id JOIN accounts a ON a.id = t.account_id WHERE ${SHOWN}`,
    )
  ).rows;
  const xp = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const id = Number(row.tinker_id);
    if (!xp.has(id)) xp.set(id, {});
    xp.get(id)![row.skill] = Number(row.xp);
  }
  return xp;
}

const sum = (xp: Record<string, number>) => Object.values(xp).reduce((total, amount) => total + amount, 0);

async function totalBoard(db: Db, content: GameContent): Promise<Entry[]> {
  const tinkers = await shownTinkers(db);
  const skills = await shownSkills(db);
  return [...tinkers].map(([id, tinker]) => {
    const xp = skills.get(id) ?? {};
    return { id, name: tinker.name, value: rules.totalLevel(xp, content.rules), tie: sum(xp), detail: sum(xp) };
  });
}

/** Only Tinkers with some XP in the skill; everyone else would tie at level 1. */
async function skillBoard(db: Db, content: GameContent, skill: string): Promise<Entry[]> {
  const rows = (
    await db.query(
      `SELECT t.id, t.name, s.xp FROM skills s JOIN tinkers t ON t.id = s.tinker_id JOIN accounts a ON a.id = t.account_id
       WHERE s.skill = $1 AND s.xp > 0 AND ${SHOWN}`,
      [skill],
    )
  ).rows;
  return rows.map((row) => {
    const xp = Number(row.xp);
    return { id: Number(row.id), name: row.name, value: rules.levelFor(xp, content.rules), tie: xp, detail: xp };
  });
}

/**
 * Net worth: Crowns in the purse and in open buy orders, plus unbound goods,
 * held or offered in open sell orders, at the collectors' price. Goods no
 * collector buys count nothing, and Gilded Cogs are left out, since they are
 * bought with money and nothing may be exclusive to paying players (GDD).
 */
async function netWorthBoard(db: Db, content: GameContent): Promise<Entry[]> {
  const tinkers = await shownTinkers(db);
  const worth = new Map([...tinkers].map(([id, tinker]) => [id, tinker.crowns]));
  const priceOf = (item: string) => content.economy.get(item)?.collectorPrice ?? 0;
  const add = (id: number, crowns: number) => {
    if (worth.has(id)) worth.set(id, worth.get(id)! + crowns);
  };
  for (const row of (await db.query("SELECT tinker_id, item, qty FROM inventory WHERE bound = false")).rows) {
    add(Number(row.tinker_id), priceOf(row.item) * Number(row.qty));
  }
  for (const row of (await db.query("SELECT tinker_id, item, side, price, qty_open FROM exchange_orders WHERE closed_at IS NULL")).rows) {
    const qty = Number(row.qty_open);
    add(Number(row.tinker_id), row.side === "buy" ? Number(row.price) * qty : priceOf(row.item) * qty);
  }
  return [...tinkers].map(([id, tinker]) => ({ id, name: tinker.name, value: worth.get(id)!, tie: 0, detail: null }));
}

/** Formed guilds, by their shown members' total levels added together. */
async function guildBoard(db: Db, content: GameContent): Promise<Entry[]> {
  const skills = await shownSkills(db);
  const rows = (
    await db.query(
      `SELECT g.id, g.name, m.tinker_id FROM guilds g JOIN guild_members m ON m.guild_id = g.id
       JOIN tinkers t ON t.id = m.tinker_id JOIN accounts a ON a.id = t.account_id
       WHERE g.status = 'active' AND ${SHOWN}`,
    )
  ).rows;
  const guilds = new Map<number, Entry>();
  for (const row of rows) {
    const id = Number(row.id);
    const entry = guilds.get(id) ?? { id, name: row.name, value: 0, tie: 0, detail: 0 };
    entry.value += rules.totalLevel(skills.get(Number(row.tinker_id)) ?? {}, content.rules);
    entry.detail = (entry.detail ?? 0) + 1;
    guilds.set(id, entry);
  }
  return [...guilds.values()];
}

/** One board as this Tinker sees it: the top rows, and its own row or its guild's. */
export async function leaderboard(db: Db, content: GameContent, tinkerId: number, board: string): Promise<LeaderboardView> {
  if (!(BOARDS as readonly string[]).includes(board)) throw new BadRequest(`there is no ${board} board`);
  if (!(await db.query("SELECT 1 FROM tinkers WHERE id = $1", [tinkerId])).rowCount) throw new NotFound(`no Tinker ${tinkerId}`);
  let entries: Entry[];
  let mine: number | null = tinkerId;
  if (board === "total") entries = await totalBoard(db, content);
  else if (board === "net_worth") entries = await netWorthBoard(db, content);
  else if (board === "guilds") {
    entries = await guildBoard(db, content);
    const own = (await db.query("SELECT guild_id FROM guild_members WHERE tinker_id = $1", [tinkerId])).rows[0];
    mine = own ? Number(own.guild_id) : null;
  } else entries = await skillBoard(db, content, board);
  const rows = ranked(entries, mine);
  return { board: board as Board, boards: shownBoards(content), size: BOARD_SIZE, rows: rows.slice(0, BOARD_SIZE), you: rows.find((row) => row.you) ?? null };
}
