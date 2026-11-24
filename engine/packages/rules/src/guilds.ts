// Guilds (build plan milestone 10; GDD section 6). Founding is free and a
// guild forms at once: guilds are for company, so nothing stands between a
// new Tinker and one. Ranks decide who may do what. The server keeps guilds
// in the database; these are the rules it applies.

/** Places a guild starts with; its Workshop adds more (work order 043). */
export const GUILD_MAX_MEMBERS = 30;
export const WORKSHOP_TOP = 10;
export const WORKSHOP_PLACES = 2;

/** Points a Workshop level costs: 10 for the first, 20 for the second, and so on. */
export function workshopCost(level: number): number {
  return level * 10;
}

/** A Workshop's level from its points, and how far into the next it is; `cost` is null at the top. */
export function workshopAt(points: number): { level: number; into: number; cost: number | null } {
  let level = 0;
  let into = points;
  while (level < WORKSHOP_TOP && into >= workshopCost(level + 1)) into -= workshopCost(++level);
  return { level, into, cost: level < WORKSHOP_TOP ? workshopCost(level + 1) : null };
}

/** How many members a guild with these Workshop points holds. */
export function guildPlaces(points: number): number {
  return GUILD_MAX_MEMBERS + workshopAt(points).level * WORKSHOP_PLACES;
}
export const GUILD_RENAME_CROWNS = 10_000;
export const GUILD_NOTICE_MAX = 500;
export const GUILD_MIN_LEVEL_MAX = 9999;
/** A leader away this long may be replaced; every two days more lets one more member claim. */
export const GUILD_CLAIM_MS = 30 * 86_400_000;
export const GUILD_CLAIM_STEP_MS = 2 * 86_400_000;

/** How long a leader must have been away before the member at a place (0 first) may claim leadership. */
export function claimAfter(place: number): number {
  return GUILD_CLAIM_MS + place * GUILD_CLAIM_STEP_MS;
}

export type GuildRank = "leader" | "officer" | "member";
export type GuildAct = "invite" | "accept" | "promote" | "remove" | "hand_on" | "disband" | "rename" | "notice" | "recruit";

export class GuildRefusal extends Error {}

/** Unique (the server checks that), 3 to 24 characters of letters, spaces and apostrophes. */
export function guildNameRefusal(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if ([...name].length < 3 || [...name].length > 24) return "a guild's name is 3 to 24 characters";
  if (!/^[\p{L}' ]+$/u.test(name)) return "a guild's name uses letters, spaces and apostrophes only";
  return null;
}

export function cleanGuildName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** What each rank may do. The leader does everything; officers bring people in, remove members and keep the notice board. */
export function mayAct(rank: GuildRank, act: GuildAct): boolean {
  if (rank === "leader") return true;
  if (rank === "officer") return act === "invite" || act === "accept" || act === "notice" || act === "remove";
  return false;
}

/** Who may remove whom: the leader removes anyone else, officers remove members; anyone may leave, except a leader who has others to lead. */
export function removalRefusal(actor: GuildRank, target: GuildRank, self: boolean, members: number): string | null {
  if (self) return actor === "leader" && members > 1 ? "hand leadership on before leaving, or disband the guild" : null;
  if (!mayAct(actor, "remove")) return "only the leader and officers remove members";
  if (target === "leader") return "the leader cannot be removed";
  if (actor === "officer" && target !== "member") return "only the leader removes officers";
  return null;
}
