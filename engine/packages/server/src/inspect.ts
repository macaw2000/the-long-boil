// Inspecting another Tinker: what anyone could see by looking them over in
// the street. Their guild and rank, their skill levels, the gear they have
// on and the look they chose; never their Crowns, stores, queue or story. A fully banned
// account's Tinkers cannot be inspected, as they are not on the boards.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { NotFound, wearing } from "./tinkers.js";

export interface InspectView {
  id: number;
  name: string;
  /** When the Tinker took the keys. */
  since: string;
  totalLevel: number;
  /** Every skill the game trains or this Tinker has trained, in the GDD's order. */
  skills: { skill: string; level: number; xp: number }[];
  weapon: string | null;
  armour: string | null;
  worn: Record<string, string>;
  tools: Record<string, string>;
  bossesBeaten: number;
  guild: { id: number; name: string; rank: rules.GuildRank } | null;
  /** The body, outfit and backdrop they chose to be seen in (work order 042). */
  look: rules.Wearing;
}

export async function inspect(db: Db, content: GameContent, otherId: number): Promise<InspectView> {
  const row = (
    await db.query(
      `SELECT t.id, t.name, t.created_at, t.weapon, t.armour, t.worn, t.tools, t.bosses_beaten, t.body, t.outfit, t.backdrop, g.id AS guild_id, g.name AS guild_name, m.rank
       FROM tinkers t JOIN accounts a ON a.id = t.account_id
       LEFT JOIN guild_members m ON m.tinker_id = t.id LEFT JOIN guilds g ON g.id = m.guild_id
       WHERE t.id = $1 AND (a.ban IS NULL OR a.ban <> 'full')`,
      [otherId],
    )
  ).rows[0];
  if (!row) throw new NotFound(`no Tinker ${otherId}`);
  const xp: Record<string, number> = Object.fromEntries(
    (await db.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [otherId])).rows.map((skill) => [skill.skill, Number(skill.xp)]),
  );
  const trained = new Set([...[...content.rules.actions.values()].map((action) => action.skill), ...Object.keys(xp)]);
  const order = (skill: string) => {
    const at = (rules.GDD_SKILLS as readonly string[]).indexOf(skill);
    return at < 0 ? rules.GDD_SKILLS.length : at;
  };
  const skills = [...trained]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((skill) => ({ skill, level: rules.levelFor(xp[skill] ?? 0, content.rules), xp: xp[skill] ?? 0 }));
  return {
    id: Number(row.id),
    name: row.name,
    since: row.created_at.toISOString(),
    totalLevel: rules.totalLevel(xp, content.rules),
    skills,
    weapon: row.weapon,
    armour: row.armour,
    worn: row.worn ?? {},
    tools: row.tools ?? {},
    bossesBeaten: (row.bosses_beaten ?? []).length,
    guild: row.guild_id ? { id: Number(row.guild_id), name: row.guild_name, rank: row.rank } : null,
    look: wearing(content, row),
  };
}

export interface Found {
  id: number;
  name: string;
  totalLevel: number;
}

/** How many Tinkers a search by name returns. */
export const FOUND = 10;

/**
 * Tinkers whose names start with the letters given, whatever their case, an
 * exact match first; for looking a profile up (work order 042). A fully
 * banned account's Tinkers are not found, as they cannot be inspected.
 */
export async function find(db: Db, content: GameContent, name: string): Promise<{ found: Found[] }> {
  const start = name.trim().toLowerCase();
  if (start.length < 2) return { found: [] };
  const rows = (
    await db.query(
      `SELECT t.id, t.name FROM tinkers t JOIN accounts a ON a.id = t.account_id
       WHERE lower(t.name) LIKE $1 AND (a.ban IS NULL OR a.ban <> 'full')
       ORDER BY lower(t.name) = $2 DESC, lower(t.name), t.id LIMIT $3`,
      [`${start.replace(/[\\%_]/g, "\\$&")}%`, start, FOUND],
    )
  ).rows;
  const found: Found[] = [];
  for (const row of rows) {
    const xp: Record<string, number> = Object.fromEntries(
      (await db.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [row.id])).rows.map((skill) => [skill.skill, Number(skill.xp)]),
    );
    found.push({ id: Number(row.id), name: row.name, totalLevel: rules.totalLevel(xp, content.rules) });
  }
  return { found };
}

/**
 * The Tinker a chat command names, for /w and /profile: the longest run of
 * leading words that is some Tinker's whole name, whatever its case, and the
 * words left over. Names may hold spaces, so "/w Ada Bell hello" finds "Ada
 * Bell" before "Ada". Names are not unique; when two Tinkers share the one
 * matched, neither is picked and `shared` says how many there are.
 */
export async function named(
  db: Db,
  text: string,
): Promise<{ tinker: { id: number; name: string } | null; rest: string; shared: number }> {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tries = words.map((_, at) => words.slice(0, at + 1).join(" ").toLowerCase());
  if (!tries.length) return { tinker: null, rest: "", shared: 0 };
  const rows = (
    await db.query(
      `SELECT t.id, t.name, lower(regexp_replace(t.name, '\\s+', ' ', 'g')) AS key FROM tinkers t JOIN accounts a ON a.id = t.account_id
       WHERE lower(t.name) LIKE $2 AND lower(regexp_replace(t.name, '\\s+', ' ', 'g')) = ANY($1) AND (a.ban IS NULL OR a.ban <> 'full')`,
      [tries, `${tries[0]!.replace(/[\\%_]/g, "\\$&")}%`],
    )
  ).rows;
  for (let at = tries.length - 1; at >= 0; at--) {
    const matches = rows.filter((row) => row.key === tries[at]);
    if (!matches.length) continue;
    const rest = words.slice(at + 1).join(" ");
    if (matches.length > 1) return { tinker: null, rest, shared: matches.length };
    return { tinker: { id: Number(matches[0].id), name: matches[0].name }, rest, shared: 1 };
  }
  return { tinker: null, rest: words.join(" "), shared: 0 };
}
