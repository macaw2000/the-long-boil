// Guilds (build plan milestone 10; GDD section 6). The founding fee is a
// Crown sink raised jointly through a charter; ranks decide who may do what.
// The server keeps guilds in the database; these are the rules it applies.

const DAY_MS = 24 * 3_600_000;

export const GUILD_FEE = 500_000;
export const GUILD_FOUNDER_MIN = 50_000;
export const GUILD_CHARTER_MS = 14 * DAY_MS;
export const GUILD_MAX_MEMBERS = 30;
export const GUILD_RENAME_CROWNS = 10_000;

export type GuildRank = "leader" | "officer" | "member";
export type GuildAct = "invite" | "accept" | "promote" | "remove" | "hand_on" | "disband" | "rename";

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

/** What each rank may do. The leader does everything; officers bring people in. */
export function mayAct(rank: GuildRank, act: GuildAct): boolean {
  if (rank === "leader") return true;
  if (rank === "officer") return act === "invite" || act === "accept";
  return false;
}

/** Who may remove whom: the leader removes anyone else; anyone may leave, except a leader who has others to lead. */
export function removalRefusal(actor: GuildRank, target: GuildRank, self: boolean, members: number): string | null {
  if (self) return actor === "leader" && members > 1 ? "hand leadership on before leaving, or disband the guild" : null;
  if (!mayAct(actor, "remove")) return "only the leader removes members";
  if (target === "leader") return "the leader cannot be removed";
  return null;
}

/** A pledge toward a charter: whole Crowns, the founder's at least the minimum, and never past the fee. */
export function pledgeRefusal(crowns: number, pledged: number, founding: boolean): string | null {
  if (!Number.isInteger(crowns) || crowns < 1) return "a pledge is a whole number of Crowns";
  if (founding && crowns < GUILD_FOUNDER_MIN) return `a founder opens a charter with at least ${GUILD_FOUNDER_MIN.toLocaleString("en-GB")} Crowns`;
  if (pledged + crowns > GUILD_FEE) return `the charter needs only ${(GUILD_FEE - pledged).toLocaleString("en-GB")} more Crowns`;
  return null;
}
