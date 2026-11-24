// Guilds on the server (build plan milestone 10). Founding is free and the
// guild forms at once; any Tinker may found, apply or be invited, with no
// level or account-age gate, since no Crowns change hands. Guilds once
// started as charters raised by pledges; any charter left from then forms
// on the next guild step and its pledges go back, logged on each pledger's
// own event log.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { closeWeeks, joinWeek, readContracts, type ContractsView } from "./contracts.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { adjustCrowns, appendEvents, setLastSeq, Shortfall, type LogEntry } from "./events.js";
import { BadRequest, NotFound } from "./tinkers.js";

export interface GuildMemberView {
  tinkerId: number;
  name: string;
  rank: rules.GuildRank;
  totalLevel: number;
  lastSeen: string;
  workOrders: number;
}

export interface GuildView {
  guild: {
    id: number;
    name: string;
    formedAt: string;
    /** The pinned notice, or null when none is. */
    notice: { text: string; by: string; at: string } | null;
    rank: rules.GuildRank;
    members: GuildMemberView[];
    /** What the guild and its members did lately, newest first. */
    activity: GuildActivityEntry[];
    /** Invitations out and applications in; shown to those who may answer them. */
    requests: { tinkerId: number; name: string; kind: "invite" | "application"; at: string }[];
    recruiting: Recruiting;
    /** Members it holds, and the Workshop that adds to them. */
    maxMembers: number;
    workshop: { level: number; into: number; cost: number | null };
    /** This week's Guild Contracts (work order 043). */
    contracts: ContractsView;
    /** Set while the leader has been away long enough to be replaced: who they are, and when this Tinker may claim. */
    claim: { leader: string; at: string } | null;
  } | null;
  invites: { guildId: number; name: string; status: string }[];
  applications: { guildId: number; name: string; status: string }[];
  /** Every guild, largest first, to apply to. */
  guilds: { id: number; name: string; members: number; maxMembers: number; recruiting: Recruiting }[];
  /** This Tinker's total level, to set against what a guild asks. */
  totalLevel: number;
  rules: { maxMembers: number; renameCrowns: number; noticeMax: number };
}

/** How a guild takes applications. */
export interface Recruiting {
  open: boolean;
  minLevel: number;
  /** Lets whoever applies in at once. */
  autoAccept: boolean;
}

function recruitingOf(row: Row): Recruiting {
  return { open: row.recruiting, minLevel: Number(row.min_level), autoAccept: row.auto_accept };
}

/** One line of the Guild tab's recent activity. */
export type GuildActivityEntry = { at: string; tinker: { id: number; name: string } } & (
  | { kind: "founded" | "joined" | "left" | "removed" | "notice" | "claimed" }
  | { kind: "renamed"; name: string }
  | { kind: "tier"; contract: string; tier: number }
  | { kind: "rank"; rank: rules.GuildRank; by: string }
  | { kind: "level"; skill: string; level: number }
  | { kind: "boss"; monster: string }
);

/** How many lines the activity keeps. */
export const GUILD_ACTIVITY = 30;
/** Level-ups worth telling the guild about: every fifth level. */
const MILESTONE = 5;

/**
 * The guild's recent activity, from the event log: comings and goings, ranks,
 * renames and notices (logged with the guild's id), and, for members while in
 * the guild, every fifth level and each boss's first fall to them.
 */
async function readActivity(tx: Tx, guildId: number): Promise<GuildActivityEntry[]> {
  const rows = (
    await tx.query(
      `(SELECT e.tinker_id, t.name, e.type, e.at, e.payload, b.name AS by_name
        FROM events e JOIN tinkers t ON t.id = e.tinker_id LEFT JOIN tinkers b ON b.id = (e.payload->>'by')::bigint
        WHERE e.payload->>'guild' = $4
          AND e.type IN ('guild_founded', 'guild_joined', 'guild_left', 'guild_renamed', 'guild_rank', 'guild_notice', 'guild_tier')
        ORDER BY e.at DESC LIMIT $2)
       UNION ALL
       (SELECT e.tinker_id, t.name, e.type, e.at, e.payload, NULL
        FROM guild_members m JOIN events e ON e.tinker_id = m.tinker_id AND e.at >= m.joined_at JOIN tinkers t ON t.id = m.tinker_id
        WHERE m.guild_id = $1
          AND ((e.type = 'level_up' AND (e.payload->>'level')::int % $3 = 0)
            OR (e.type = 'boss_attempted' AND (e.payload->>'won')::boolean AND NOT EXISTS (
                  SELECT 1 FROM events f WHERE f.tinker_id = e.tinker_id AND f.type = 'boss_attempted' AND (f.payload->>'won')::boolean
                    AND f.payload->>'monsterId' = e.payload->>'monsterId' AND (f.at, f.seq) < (e.at, e.seq))))
        ORDER BY e.at DESC LIMIT $2)
       ORDER BY at DESC LIMIT $2`,
      [guildId, GUILD_ACTIVITY, MILESTONE, String(guildId)],
    )
  ).rows;
  return rows.map((row): GuildActivityEntry => {
    const base = { at: row.at.toISOString(), tinker: { id: Number(row.tinker_id), name: row.name as string } };
    const payload = row.payload;
    switch (row.type) {
      case "guild_founded":
        return { ...base, kind: "founded" };
      case "guild_joined":
        return { ...base, kind: "joined" };
      case "guild_left":
        return { ...base, kind: payload.removed ? "removed" : "left" };
      case "guild_renamed":
        return { ...base, kind: "renamed", name: payload.name };
      case "guild_rank":
        if (payload.claimed) return { ...base, kind: "claimed" };
        return { ...base, kind: "rank", rank: payload.rank, by: row.by_name };
      case "guild_notice":
        return { ...base, kind: "notice" };
      case "guild_tier":
        return { ...base, kind: "tier", contract: payload.kind, tier: Number(payload.tier) };
      case "level_up":
        return { ...base, kind: "level", skill: payload.skill, level: Number(payload.level) };
      default:
        return { ...base, kind: "boss", monster: payload.monsterId };
    }
  });
}

/** Membership changes, for the live connection to pass on (guild chat follows membership). */
export type GuildTouched = number[];

type Row = Record<string, any>;

async function one(tx: Tx, sql: string, params: unknown[]): Promise<Row | undefined> {
  return (await tx.query(sql, params)).rows[0];
}

/** Appends entries to another Tinker's log inside this transaction. */
async function logFor(tx: Tx, content: GameContent, tinkerId: number, entries: LogEntry[]) {
  const row = await one(tx, "SELECT last_seq FROM tinkers WHERE id = $1 FOR UPDATE", [tinkerId]);
  if (!row) throw new NotFound(`no Tinker ${tinkerId}`);
  const seq = await appendEvents(tx, tinkerId, Number(row.last_seq), entries, content.rules.version);
  await setLastSeq(tx, tinkerId, seq);
}

async function skillXp(tx: Tx, tinkerId: number): Promise<Record<string, number>> {
  const rows = (await tx.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [tinkerId])).rows;
  return Object.fromEntries(rows.map((row) => [row.skill, Number(row.xp)]));
}

async function membership(tx: Tx, tinkerId: number): Promise<{ guildId: number; rank: rules.GuildRank } | null> {
  const row = await one(tx, "SELECT guild_id, rank FROM guild_members WHERE tinker_id = $1", [tinkerId]);
  return row ? { guildId: Number(row.guild_id), rank: row.rank } : null;
}

async function accountInGuild(tx: Tx, tinkerId: number): Promise<boolean> {
  return Boolean(await one(tx, "SELECT 1 FROM guild_members m JOIN tinkers t ON t.account_id = m.account_id WHERE t.id = $1", [tinkerId]));
}

/** Forms every charter left from when guilds cost a fee, refunding its pledges. */
async function formCharters(tx: Tx, content: GameContent, now: number, touched: Set<number>) {
  const charters = (await tx.query("SELECT id FROM guilds WHERE status = 'charter' FOR UPDATE", [])).rows;
  for (const charter of charters) {
    const guildId = Number(charter.id);
    const pledges = (await tx.query("SELECT id, tinker_id, crowns FROM guild_pledges WHERE guild_id = $1 AND refunded_at IS NULL", [guildId])).rows;
    for (const pledge of pledges) {
      const tinkerId = Number(pledge.tinker_id);
      await adjustCrowns(tx, tinkerId, Number(pledge.crowns));
      await logFor(tx, content, tinkerId, [{ type: "guild_pledge_refunded", at: now, payload: { guild: guildId, why: "free", crowns: Number(pledge.crowns), items: {} } }]);
      await tx.query("UPDATE guild_pledges SET refunded_at = $2 WHERE id = $1", [pledge.id, new Date(now)]);
      touched.add(tinkerId);
    }
    await tx.query("UPDATE guilds SET status = 'active', formed_at = $2 WHERE id = $1", [guildId, new Date(now)]);
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1", [guildId])).rows) touched.add(Number(row.tinker_id));
  }
}

/**
 * Whether a member may claim the guild, or when. The leader is away only if
 * no Tinker on the account has been looked in on, and the account has not
 * signed in by the wall clock either, so a dev clock moved forward cannot
 * make every leader look absent. Officers come first, then members, each by
 * when they joined.
 */
async function claimOn(tx: Tx, guildId: number, tinkerId: number, now: number): Promise<{ leaderId: number; leader: string; at: number } | null> {
  const lead = await one(
    tx,
    `SELECT m.tinker_id, t.name, a.last_seen_at, (SELECT max(o.resolved_to) FROM tinkers o WHERE o.account_id = m.account_id) AS seen
     FROM guild_members m JOIN tinkers t ON t.id = m.tinker_id JOIN accounts a ON a.id = m.account_id WHERE m.guild_id = $1 AND m.rank = 'leader'`,
    [guildId],
  );
  if (!lead || Number(lead.tinker_id) === tinkerId) return null;
  // Each clock's absence: the game's, and the wall's where sign-in keeps one.
  const wall = lead.last_seen_at ? Date.now() - lead.last_seen_at.getTime() : Infinity;
  const away = Math.min(now - lead.seen.getTime(), wall);
  if (away < rules.GUILD_CLAIM_MS) return null;
  const heirs = (
    await tx.query(
      `SELECT m.tinker_id FROM guild_members m JOIN accounts a ON a.id = m.account_id
       WHERE m.guild_id = $1 AND m.rank <> 'leader' AND a.ban IS DISTINCT FROM 'full'
       ORDER BY m.rank = 'officer' DESC, m.joined_at, m.tinker_id`,
      [guildId],
    )
  ).rows.map((row) => Number(row.tinker_id));
  const place = heirs.indexOf(tinkerId);
  if (place < 0) return null;
  return { leaderId: Number(lead.tinker_id), leader: lead.name, at: now + rules.claimAfter(place) - away };
}

async function lockGuild(tx: Tx, guildId: number): Promise<Row> {
  const guild = await one(tx, "SELECT * FROM guilds WHERE id = $1 AND status = 'active' FOR UPDATE", [guildId]);
  if (!guild) throw new rules.GuildRefusal("that guild is not open");
  return guild;
}

async function memberCount(tx: Tx, guildId: number): Promise<number> {
  return Number((await one(tx, "SELECT count(*) AS n FROM guild_members WHERE guild_id = $1", [guildId]))!.n);
}

/** Marks every member as touched, so open Guild tabs show the change. */
async function touchMembers(tx: Tx, guildId: number, touched: Set<number>) {
  for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1", [guildId])).rows) touched.add(Number(row.tinker_id));
}

async function join(tx: Tx, content: GameContent, guildId: number, tinkerId: number, now: number, touched: Set<number>) {
  const places = rules.guildPlaces(Number((await lockGuild(tx, guildId)).workshop_points));
  if (await accountInGuild(tx, tinkerId)) throw new rules.GuildRefusal("this account is already in a guild");
  if ((await memberCount(tx, guildId)) >= places) throw new rules.GuildRefusal(`that guild is full, at ${places} members`);
  await tx.query(
    "INSERT INTO guild_members (guild_id, tinker_id, account_id, rank, joined_at) SELECT $1, id, account_id, 'member', $3 FROM tinkers WHERE id = $2",
    [guildId, tinkerId, new Date(now)],
  );
  const account = await one(tx, "SELECT account_id FROM tinkers WHERE id = $1", [tinkerId]);
  await joinWeek(tx, content, guildId, Number(account!.account_id), now);
  await tx.query("DELETE FROM guild_requests WHERE tinker_id = $1", [tinkerId]);
  await logFor(tx, content, tinkerId, [{ type: "guild_joined", at: now, payload: { guild: guildId, crowns: 0, items: {} } }]);
  await touchMembers(tx, guildId, touched);
}

async function readView(tx: Tx, content: GameContent, tinkerId: number, now: number):Promise<GuildView> {
  const mine = await membership(tx, tinkerId);
  let guild: GuildView["guild"] = null;
  if (mine) {
    const row = (await one(tx, "SELECT g.*, t.name AS notice_name FROM guilds g LEFT JOIN tinkers t ON t.id = g.notice_by WHERE g.id = $1", [mine.guildId]))!;
    const members = (
      await tx.query(
        `SELECT m.tinker_id, t.name, m.rank, m.work_orders, t.resolved_to
         FROM guild_members m JOIN tinkers t ON t.id = m.tinker_id WHERE m.guild_id = $1`,
        [mine.guildId],
      )
    ).rows;
    const ranked = { leader: 0, officer: 1, member: 2 } as const;
    const views: GuildMemberView[] = [];
    for (const member of members) {
      views.push({
        tinkerId: Number(member.tinker_id),
        name: member.name,
        rank: member.rank,
        totalLevel: rules.totalLevel(await skillXp(tx, Number(member.tinker_id)), content.rules),
        lastSeen: member.resolved_to.toISOString(),
        workOrders: Number(member.work_orders),
      });
    }
    views.sort((a, b) => ranked[a.rank] - ranked[b.rank] || b.totalLevel - a.totalLevel || a.name.localeCompare(b.name));
    const requests = rules.mayAct(mine.rank, "accept")
      ? (
          await tx.query(
            "SELECT r.tinker_id, t.name, r.kind, r.at FROM guild_requests r JOIN tinkers t ON t.id = r.tinker_id WHERE r.guild_id = $1 ORDER BY r.at",
            [mine.guildId],
          )
        ).rows.map((r) => ({ tinkerId: Number(r.tinker_id), name: r.name, kind: r.kind, at: r.at.toISOString() }))
      : [];
    guild = {
      id: Number(row.id),
      name: row.name,
      formedAt: row.formed_at.toISOString(),
      notice: row.notice ? { text: row.notice, by: row.notice_name, at: row.notice_at.toISOString() } : null,
      rank: mine.rank,
      members: views,
      activity: await readActivity(tx, mine.guildId),
      requests,
      recruiting: recruitingOf(row),
      maxMembers: rules.guildPlaces(Number(row.workshop_points)),
      workshop: rules.workshopAt(Number(row.workshop_points)),
      contracts: await readContracts(tx, content, mine.guildId, tinkerId, now),
      claim: await claimOn(tx, mine.guildId, tinkerId, now).then((claim) => claim && { leader: claim.leader, at: new Date(claim.at).toISOString() }),
    };
  }
  const asked = (kind: string) =>
    tx
      .query("SELECT g.id, g.name, g.status FROM guild_requests r JOIN guilds g ON g.id = r.guild_id WHERE r.tinker_id = $1 AND r.kind = $2 ORDER BY r.at", [tinkerId, kind])
      .then((result) => result.rows.map((r) => ({ guildId: Number(r.id), name: r.name, status: r.status })));
  const guilds = (
    await tx.query(
      `SELECT g.id, g.name, g.recruiting, g.min_level, g.auto_accept, g.workshop_points, (SELECT count(*) FROM guild_members m WHERE m.guild_id = g.id) AS members
       FROM guilds g WHERE g.status = 'active' ORDER BY members DESC, g.name`,
      [],
    )
  ).rows.map((g) => ({ id: Number(g.id), name: g.name, members: Number(g.members), maxMembers: rules.guildPlaces(Number(g.workshop_points)), recruiting: recruitingOf(g) }));
  return {
    guild,
    invites: await asked("invite"),
    applications: await asked("application"),
    guilds,
    totalLevel: rules.totalLevel(await skillXp(tx, tinkerId), content.rules),
    rules: { maxMembers: rules.GUILD_MAX_MEMBERS, renameCrowns: rules.GUILD_RENAME_CROWNS, noticeMax: rules.GUILD_NOTICE_MAX },
  };
}

export interface GuildOutcome {
  view: GuildView;
  /** Tinkers whose guild membership or Crowns changed, besides the actor. */
  touched: number[];
}

/** Runs one guild step in a transaction after forming any old charters, and reads the actor's view after it. */
async function guildOp(
  db: Db,
  content: GameContent,
  tinkerId: number,
  now: number,
  step: (tx: Tx, touched: Set<number>) => Promise<void>,
): Promise<GuildOutcome> {
  try {
    // In a transaction of its own (contracts.ts), before this one locks anything; first, so one who is leaving is paid.
    await closeWeeks(db, tinkerId, now);
    return await withTransaction(db, async (tx) => {
      const touched = new Set<number>();
      await formCharters(tx, content, now, touched);
      await step(tx, touched);
      touched.delete(tinkerId);
      return { view: await readView(tx, content, tinkerId, now), touched: [...touched] };
    });
  } catch (error) {
    if (error instanceof rules.GuildRefusal) throw new BadRequest(error.message);
    if (error instanceof Shortfall) throw new BadRequest(error.message);
    if ((error as { code?: string }).code === "23505") throw new BadRequest("that name is taken, or this account is already in a guild");
    throw error;
  }
}

async function actorIn(tx: Tx, tinkerId: number, act: rules.GuildAct): Promise<{ guildId: number; rank: rules.GuildRank }> {
  const mine = await membership(tx, tinkerId);
  if (!mine) throw new rules.GuildRefusal("you are not in a guild");
  if (!rules.mayAct(mine.rank, act)) throw new rules.GuildRefusal(`a ${mine.rank} cannot do that`);
  return mine;
}

export function readGuild(db: Db, content: GameContent, tinkerId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async () => undefined);
}

export function foundGuild(db: Db, content: GameContent, tinkerId: number, name: string, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx) => {
    if (await accountInGuild(tx, tinkerId)) throw new rules.GuildRefusal("this account is already in a guild");
    const refusal = rules.guildNameRefusal(name);
    if (refusal) throw new rules.GuildRefusal(refusal);
    const guild = (
      await tx.query(
        // A new guild lets anyone in at once, so a first-day player can join one; its leader may change that.
        "INSERT INTO guilds (name, status, created_at, charter_ends, formed_at, auto_accept) VALUES ($1, 'active', $2, $2, $2, true) RETURNING *",
        [rules.cleanGuildName(name), new Date(now)],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO guild_members (guild_id, tinker_id, account_id, rank, joined_at) SELECT $1, id, account_id, 'leader', $3 FROM tinkers WHERE id = $2",
      [guild.id, tinkerId, new Date(now)],
    );
    await tx.query("DELETE FROM guild_requests WHERE tinker_id = $1", [tinkerId]);
    await logFor(tx, content, tinkerId, [{ type: "guild_founded", at: now, payload: { guild: Number(guild.id), name: guild.name, crowns: 0, items: {} } }]);
  });
}

export function applyToGuild(db: Db, content: GameContent, tinkerId: number, guildId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const guild = await lockGuild(tx, guildId);
    const invited = await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'invite'", [guildId, tinkerId]);
    if (invited) return join(tx, content, guildId, tinkerId, now, touched);
    if (await accountInGuild(tx, tinkerId)) throw new rules.GuildRefusal("this account is already in a guild");
    // An invitation, above, passes over all of this.
    const asks = recruitingOf(guild);
    if (!asks.open) throw new rules.GuildRefusal(`${guild.name} is not taking applications`);
    if (asks.minLevel > 0 && rules.totalLevel(await skillXp(tx, tinkerId), content.rules) < asks.minLevel) {
      throw new rules.GuildRefusal(`${guild.name} asks for total level ${asks.minLevel}`);
    }
    if (asks.autoAccept) return join(tx, content, guildId, tinkerId, now, touched);
    await tx.query(
      "INSERT INTO guild_requests (guild_id, tinker_id, kind, by_tinker_id, at) VALUES ($1, $2, 'application', $2, $3) ON CONFLICT (guild_id, tinker_id) DO NOTHING",
      [guildId, tinkerId, new Date(now)],
    );
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1 AND rank IN ('leader', 'officer')", [guildId])).rows) {
      touched.add(Number(row.tinker_id));
    }
  });
}

/**
 * Why a Tinker cannot be invited, or null. One guild per account: a Tinker
 * whose profile shows no guild may still be refused for another Tinker on
 * the account. Which Tinker, and which guild, is not given away.
 */
async function inviteRefusal(tx: Tx, tinkerId: number, otherId: number): Promise<string | null> {
  const row = (await one(
    tx,
    `SELECT t.name, t.account_id = mine.account_id AS own, g.name AS guild
     FROM tinkers t JOIN tinkers mine ON mine.id = $2
     LEFT JOIN guild_members m ON m.tinker_id = t.id LEFT JOIN guilds g ON g.id = m.guild_id WHERE t.id = $1`,
    [otherId, tinkerId],
  ))!;
  if (row.guild) return `${row.name} is already in ${row.guild}`;
  if (row.own) return `${row.name} is on your own account, and an account has one Tinker in a guild`;
  if (await accountInGuild(tx, otherId)) return `${row.name}'s player already has another Tinker in a guild, and an account has one`;
  return null;
}

export function inviteToGuild(db: Db, content: GameContent, tinkerId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, "invite");
    if (!(await one(tx, "SELECT 1 FROM tinkers WHERE id = $1", [otherId]))) throw new NotFound(`no Tinker ${otherId}`);
    const refusal = await inviteRefusal(tx, tinkerId, otherId);
    if (refusal) throw new rules.GuildRefusal(refusal);
    touched.add(otherId);
    const applied = await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'application'", [mine.guildId, otherId]);
    if (applied) return join(tx, content, mine.guildId, otherId, now, touched);
    await tx.query(
      "INSERT INTO guild_requests (guild_id, tinker_id, kind, by_tinker_id, at) VALUES ($1, $2, 'invite', $3, $4) ON CONFLICT (guild_id, tinker_id) DO NOTHING",
      [mine.guildId, otherId, tinkerId, new Date(now)],
    );
  });
}

/** An officer or the leader accepts an application. */
export function acceptApplication(db: Db, content: GameContent, tinkerId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, "accept");
    if (!(await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'application'", [mine.guildId, otherId]))) {
      throw new rules.GuildRefusal("no application from that Tinker");
    }
    touched.add(otherId);
    await join(tx, content, mine.guildId, otherId, now, touched);
  });
}

/** The invited Tinker accepts. */
export function acceptInvite(db: Db, content: GameContent, tinkerId: number, guildId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    if (!(await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'invite'", [guildId, tinkerId]))) {
      throw new rules.GuildRefusal("no invitation from that guild");
    }
    await join(tx, content, guildId, tinkerId, now, touched);
  });
}

/** Withdraws or declines a request: the Tinker it concerns, or anyone who may answer it for the guild. */
export function dropRequest(db: Db, content: GameContent, tinkerId: number, guildId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    if (otherId !== tinkerId) {
      const mine = await actorIn(tx, tinkerId, "accept");
      if (mine.guildId !== guildId) throw new rules.GuildRefusal("that request is not your guild's");
    }
    const dropped = await tx.query("DELETE FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2", [guildId, otherId]);
    if (!dropped.rowCount) return;
    touched.add(otherId);
    await touchMembers(tx, guildId, touched);
  });
}

export function setRank(db: Db, content: GameContent, tinkerId: number, otherId: number, rank: rules.GuildRank, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const act = rank === "leader" ? "hand_on" : "promote";
    await lockGuild(tx, (await actorIn(tx, tinkerId, act)).guildId);
    // Read again under the lock: leadership may have just been claimed.
    const mine = await actorIn(tx, tinkerId, act);
    const target = await membership(tx, otherId);
    if (!target || target.guildId !== mine.guildId) throw new rules.GuildRefusal("that Tinker is not in your guild");
    if (otherId === tinkerId) throw new rules.GuildRefusal("the leader's rank changes only by handing leadership on");
    if (target.rank === rank) return;
    if (rank === "leader") {
      await tx.query("UPDATE guild_members SET rank = 'officer' WHERE tinker_id = $1", [tinkerId]);
      await tx.query("UPDATE guild_members SET rank = 'leader' WHERE tinker_id = $1", [otherId]);
    } else {
      await tx.query("UPDATE guild_members SET rank = $2 WHERE tinker_id = $1", [otherId, rank]);
    }
    await logFor(tx, content, otherId, [{ type: "guild_rank", at: now, payload: { guild: mine.guildId, rank, by: tinkerId, crowns: 0, items: {} } }]);
    await touchMembers(tx, mine.guildId, touched);
  });
}

/** Removes a member, or leaves when the Tinker removes itself. A sole leader leaving closes the guild. */
export function removeMember(db: Db, content: GameContent, tinkerId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const before = await membership(tx, tinkerId);
    if (!before) throw new rules.GuildRefusal("you are not in a guild");
    // Joins take this lock too, so a sole leader's leaving cannot disband a guild someone is just joining.
    await lockGuild(tx, before.guildId);
    const mine = await membership(tx, tinkerId);
    if (mine?.guildId !== before.guildId) throw new rules.GuildRefusal("you are not in a guild");
    const target = await membership(tx, otherId);
    if (!target || target.guildId !== mine.guildId) throw new rules.GuildRefusal("that Tinker is not in your guild");
    const count = await memberCount(tx, mine.guildId);
    const refusal = rules.removalRefusal(mine.rank, target.rank, otherId === tinkerId, count);
    if (refusal) throw new rules.GuildRefusal(refusal);
    if (target.rank === "leader" && count === 1) return closeGuild(tx, mine.guildId, now, touched);
    await tx.query("DELETE FROM guild_members WHERE tinker_id = $1", [otherId]);
    await logFor(tx, content, otherId, [{ type: "guild_left", at: now, payload: { guild: mine.guildId, removed: otherId !== tinkerId, crowns: 0, items: {} } }]);
    touched.add(otherId);
    await touchMembers(tx, mine.guildId, touched);
  });
}

async function closeGuild(tx: Tx, guildId: number, now: number, touched: Set<number>) {
  await lockGuild(tx, guildId);
  for (const row of (await tx.query("DELETE FROM guild_members WHERE guild_id = $1 RETURNING tinker_id", [guildId])).rows) touched.add(Number(row.tinker_id));
  await tx.query("DELETE FROM guild_requests WHERE guild_id = $1", [guildId]);
  await tx.query("UPDATE guilds SET status = 'disbanded', closed_at = $2 WHERE id = $1", [guildId, new Date(now)]);
}

/** The leader disbands a guild. */
export function disbandGuild(db: Db, content: GameContent, tinkerId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    await lockGuild(tx, (await actorIn(tx, tinkerId, "disband")).guildId);
    const mine = await actorIn(tx, tinkerId, "disband");
    await closeGuild(tx, mine.guildId, now, touched);
  });
}

/** Takes over from a leader long away, who becomes an officer. */
export function claimLeadership(db: Db, content: GameContent, tinkerId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await membership(tx, tinkerId);
    if (!mine) throw new rules.GuildRefusal("you are not in a guild");
    await lockGuild(tx, mine.guildId);
    const claim = await claimOn(tx, mine.guildId, tinkerId, now);
    if (!claim || claim.at > now) throw new rules.GuildRefusal("leadership is not yours to claim yet");
    await tx.query("UPDATE guild_members SET rank = 'officer' WHERE tinker_id = $1", [claim.leaderId]);
    await tx.query("UPDATE guild_members SET rank = 'leader' WHERE tinker_id = $1", [tinkerId]);
    await logFor(tx, content, tinkerId, [
      { type: "guild_rank", at: now, payload: { guild: mine.guildId, rank: "leader", by: tinkerId, claimed: true, from: claim.leaderId, crowns: 0, items: {} } },
    ]);
    await touchMembers(tx, mine.guildId, touched);
  });
}

/** The leader sets how the guild takes applications. */
export function setRecruiting(db: Db, content: GameContent, tinkerId: number, recruiting: Recruiting, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const { minLevel } = recruiting;
    if (!Number.isInteger(minLevel) || minLevel < 0 || minLevel > rules.GUILD_MIN_LEVEL_MAX) {
      throw new rules.GuildRefusal("the level asked is a whole number, 0 for none");
    }
    await lockGuild(tx, (await actorIn(tx, tinkerId, "recruit")).guildId);
    const mine = await actorIn(tx, tinkerId, "recruit");
    await tx.query("UPDATE guilds SET recruiting = $2, min_level = $3, auto_accept = $4 WHERE id = $1", [mine.guildId, recruiting.open, minLevel, recruiting.autoAccept]);
    await touchMembers(tx, mine.guildId, touched);
  });
}

export function renameGuild(db: Db, content: GameContent, tinkerId: number, name: string, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, "rename");
    const refusal = rules.guildNameRefusal(name);
    if (refusal) throw new rules.GuildRefusal(refusal);
    await lockGuild(tx, mine.guildId);
    await adjustCrowns(tx, tinkerId, -rules.GUILD_RENAME_CROWNS);
    await tx.query("UPDATE guilds SET name = $2 WHERE id = $1", [mine.guildId, rules.cleanGuildName(name)]);
    await logFor(tx, content, tinkerId, [
      { type: "guild_renamed", at: now, payload: { guild: mine.guildId, name: rules.cleanGuildName(name), crowns: -rules.GUILD_RENAME_CROWNS, items: {} } },
    ]);
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1", [mine.guildId])).rows) touched.add(Number(row.tinker_id));
  });
}

/** The leader or an officer pins a notice for the guild, or clears it with an empty one. */
export function setNotice(db: Db, content: GameContent, tinkerId: number, text: string, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, "notice");
    const notice = text.trim();
    if ([...notice].length > rules.GUILD_NOTICE_MAX) throw new rules.GuildRefusal(`a notice is at most ${rules.GUILD_NOTICE_MAX} characters`);
    await lockGuild(tx, mine.guildId);
    await tx.query("UPDATE guilds SET notice = $2, notice_at = $3, notice_by = $4 WHERE id = $1", [
      mine.guildId,
      notice,
      notice ? new Date(now) : null,
      notice ? tinkerId : null,
    ]);
    if (notice) await logFor(tx, content, tinkerId, [{ type: "guild_notice", at: now, payload: { guild: mine.guildId, crowns: 0, items: {} } }]);
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1", [mine.guildId])).rows) touched.add(Number(row.tinker_id));
  });
}

/** A guild as anyone may see it: never its notice, requests or activity. */
export interface GuildCardView {
  id: number;
  name: string;
  formedAt: string;
  /** Members in all, as the 30-member cap counts them. */
  size: number;
  maxMembers: number;
  totalLevel: number;
  recruiting: Recruiting;
  /** By rank, then level. A fully banned account's Tinkers are left out, as they cannot be inspected. */
  members: { id: number; name: string; rank: rules.GuildRank; totalLevel: number }[];
}

export async function lookAtGuild(db: Db, content: GameContent, guildId: number): Promise<GuildCardView> {
  if (!Number.isSafeInteger(guildId)) throw new NotFound("no such guild");
  const guild = (await db.query("SELECT id, name, formed_at, recruiting, min_level, auto_accept, workshop_points FROM guilds WHERE id = $1 AND status = 'active'", [guildId])).rows[0];
  if (!guild) throw new NotFound("that guild has closed");
  const rows = (
    await db.query(
      `SELECT t.id, t.name, m.rank, a.ban, s.skill, s.xp FROM guild_members m JOIN tinkers t ON t.id = m.tinker_id
       JOIN accounts a ON a.id = t.account_id LEFT JOIN skills s ON s.tinker_id = t.id WHERE m.guild_id = $1`,
      [guildId],
    )
  ).rows;
  const everyone = new Set<number>();
  const seen = new Map<number, { name: string; rank: rules.GuildRank; xp: Record<string, number> }>();
  for (const row of rows) {
    const id = Number(row.id);
    everyone.add(id);
    if (row.ban === "full") continue;
    const member = seen.get(id) ?? { name: row.name as string, rank: row.rank as rules.GuildRank, xp: {} };
    if (row.skill) member.xp[row.skill] = Number(row.xp);
    seen.set(id, member);
  }
  const order = { leader: 0, officer: 1, member: 2 } as const;
  const members = [...seen]
    .map(([id, member]) => ({ id, name: member.name, rank: member.rank, totalLevel: rules.totalLevel(member.xp, content.rules) }))
    .sort((a, b) => order[a.rank] - order[b.rank] || b.totalLevel - a.totalLevel || a.name.localeCompare(b.name));
  return {
    id: Number(guild.id),
    name: guild.name,
    formedAt: guild.formed_at.toISOString(),
    size: everyone.size,
    recruiting: recruitingOf(guild),
    maxMembers: rules.guildPlaces(Number(guild.workshop_points)),
    totalLevel: members.reduce((sum, member) => sum + member.totalLevel, 0),
    members,
  };
}

/** The guild chat channel this Tinker belongs to, or null. */
export async function guildChannel(db: Db, tinkerId: number): Promise<string | null> {
  const row = (await db.query("SELECT guild_id FROM guild_members WHERE tinker_id = $1", [tinkerId])).rows[0];
  return row ? `chat:guild:${row.guild_id}` : null;
}
