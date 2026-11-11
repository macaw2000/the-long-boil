// Guilds on the server (build plan milestone 10). Founding is free and the
// guild forms at once; any Tinker may found, apply or be invited, with no
// level or account-age gate, since no Crowns change hands. Guilds once
// started as charters raised by pledges; any charter left from then forms
// on the next guild step and its pledges go back, logged on each pledger's
// own event log.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
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
    /** Invitations out and applications in; shown to those who may answer them. */
    requests: { tinkerId: number; name: string; kind: "invite" | "application"; at: string }[];
  } | null;
  invites: { guildId: number; name: string; status: string }[];
  applications: { guildId: number; name: string; status: string }[];
  /** Every guild, largest first, to apply to. */
  guilds: { id: number; name: string; members: number }[];
  rules: { maxMembers: number; renameCrowns: number; noticeMax: number };
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

async function lockGuild(tx: Tx, guildId: number): Promise<Row> {
  const guild = await one(tx, "SELECT * FROM guilds WHERE id = $1 AND status = 'active' FOR UPDATE", [guildId]);
  if (!guild) throw new rules.GuildRefusal("that guild is not open");
  return guild;
}

async function memberCount(tx: Tx, guildId: number): Promise<number> {
  return Number((await one(tx, "SELECT count(*) AS n FROM guild_members WHERE guild_id = $1", [guildId]))!.n);
}

async function join(tx: Tx, content: GameContent, guildId: number, tinkerId: number, now: number) {
  await lockGuild(tx, guildId);
  if (await accountInGuild(tx, tinkerId)) throw new rules.GuildRefusal("this account is already in a guild");
  if ((await memberCount(tx, guildId)) >= rules.GUILD_MAX_MEMBERS) throw new rules.GuildRefusal(`a guild holds at most ${rules.GUILD_MAX_MEMBERS} members`);
  await tx.query(
    "INSERT INTO guild_members (guild_id, tinker_id, account_id, rank, joined_at) SELECT $1, id, account_id, 'member', $3 FROM tinkers WHERE id = $2",
    [guildId, tinkerId, new Date(now)],
  );
  await tx.query("DELETE FROM guild_requests WHERE tinker_id = $1", [tinkerId]);
  await logFor(tx, content, tinkerId, [{ type: "guild_joined", at: now, payload: { guild: guildId, crowns: 0, items: {} } }]);
}

async function readView(tx: Tx, content: GameContent, tinkerId: number): Promise<GuildView> {
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
      requests,
    };
  }
  const asked = (kind: string) =>
    tx
      .query("SELECT g.id, g.name, g.status FROM guild_requests r JOIN guilds g ON g.id = r.guild_id WHERE r.tinker_id = $1 AND r.kind = $2 ORDER BY r.at", [tinkerId, kind])
      .then((result) => result.rows.map((r) => ({ guildId: Number(r.id), name: r.name, status: r.status })));
  const guilds = (
    await tx.query(
      `SELECT g.id, g.name, (SELECT count(*) FROM guild_members m WHERE m.guild_id = g.id) AS members
       FROM guilds g WHERE g.status = 'active' ORDER BY members DESC, g.name`,
      [],
    )
  ).rows.map((g) => ({ id: Number(g.id), name: g.name, members: Number(g.members) }));
  return {
    guild,
    invites: await asked("invite"),
    applications: await asked("application"),
    guilds,
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
    return await withTransaction(db, async (tx) => {
      const touched = new Set<number>();
      await formCharters(tx, content, now, touched);
      await step(tx, touched);
      touched.delete(tinkerId);
      return { view: await readView(tx, content, tinkerId), touched: [...touched] };
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
        "INSERT INTO guilds (name, status, created_at, charter_ends, formed_at) VALUES ($1, 'active', $2, $2, $2) RETURNING *",
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
    await lockGuild(tx, guildId);
    const invited = await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'invite'", [guildId, tinkerId]);
    if (invited) return join(tx, content, guildId, tinkerId, now);
    if (await accountInGuild(tx, tinkerId)) throw new rules.GuildRefusal("this account is already in a guild");
    await tx.query(
      "INSERT INTO guild_requests (guild_id, tinker_id, kind, by_tinker_id, at) VALUES ($1, $2, 'application', $2, $3) ON CONFLICT (guild_id, tinker_id) DO NOTHING",
      [guildId, tinkerId, new Date(now)],
    );
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1 AND rank IN ('leader', 'officer')", [guildId])).rows) {
      touched.add(Number(row.tinker_id));
    }
  });
}

export function inviteToGuild(db: Db, content: GameContent, tinkerId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, "invite");
    if (!(await one(tx, "SELECT 1 FROM tinkers WHERE id = $1", [otherId]))) throw new NotFound(`no Tinker ${otherId}`);
    if (await accountInGuild(tx, otherId)) throw new rules.GuildRefusal("that Tinker's account is already in a guild");
    touched.add(otherId);
    const applied = await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'application'", [mine.guildId, otherId]);
    if (applied) return join(tx, content, mine.guildId, otherId, now);
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
    await join(tx, content, mine.guildId, otherId, now);
  });
}

/** The invited Tinker accepts. */
export function acceptInvite(db: Db, content: GameContent, tinkerId: number, guildId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx) => {
    if (!(await one(tx, "SELECT 1 FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2 AND kind = 'invite'", [guildId, tinkerId]))) {
      throw new rules.GuildRefusal("no invitation from that guild");
    }
    await join(tx, content, guildId, tinkerId, now);
  });
}

/** Withdraws or declines a request: the Tinker it concerns, or anyone who may answer it for the guild. */
export function dropRequest(db: Db, content: GameContent, tinkerId: number, guildId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    if (otherId !== tinkerId) {
      const mine = await actorIn(tx, tinkerId, "accept");
      if (mine.guildId !== guildId) throw new rules.GuildRefusal("that request is not your guild's");
    }
    await tx.query("DELETE FROM guild_requests WHERE guild_id = $1 AND tinker_id = $2", [guildId, otherId]);
    touched.add(otherId);
  });
}

export function setRank(db: Db, content: GameContent, tinkerId: number, otherId: number, rank: rules.GuildRank, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await actorIn(tx, tinkerId, rank === "leader" ? "hand_on" : "promote");
    const target = await membership(tx, otherId);
    if (!target || target.guildId !== mine.guildId) throw new rules.GuildRefusal("that Tinker is not in your guild");
    if (otherId === tinkerId) throw new rules.GuildRefusal("the leader's rank changes only by handing leadership on");
    if (rank === "leader") {
      await tx.query("UPDATE guild_members SET rank = 'officer' WHERE tinker_id = $1", [tinkerId]);
      await tx.query("UPDATE guild_members SET rank = 'leader' WHERE tinker_id = $1", [otherId]);
    } else {
      await tx.query("UPDATE guild_members SET rank = $2 WHERE tinker_id = $1", [otherId, rank]);
    }
    touched.add(otherId);
  });
}

/** Removes a member, or leaves when the Tinker removes itself. A sole leader leaving closes the guild. */
export function removeMember(db: Db, content: GameContent, tinkerId: number, otherId: number, now: number) {
  return guildOp(db, content, tinkerId, now, async (tx, touched) => {
    const mine = await membership(tx, tinkerId);
    if (!mine) throw new rules.GuildRefusal("you are not in a guild");
    const target = await membership(tx, otherId);
    if (!target || target.guildId !== mine.guildId) throw new rules.GuildRefusal("that Tinker is not in your guild");
    const count = await memberCount(tx, mine.guildId);
    const refusal = rules.removalRefusal(mine.rank, target.rank, otherId === tinkerId, count);
    if (refusal) throw new rules.GuildRefusal(refusal);
    if (target.rank === "leader" && count === 1) return closeGuild(tx, mine.guildId, now, touched);
    await tx.query("DELETE FROM guild_members WHERE tinker_id = $1", [otherId]);
    await logFor(tx, content, otherId, [{ type: "guild_left", at: now, payload: { guild: mine.guildId, removed: otherId !== tinkerId, crowns: 0, items: {} } }]);
    touched.add(otherId);
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
    const mine = await actorIn(tx, tinkerId, "disband");
    await closeGuild(tx, mine.guildId, now, touched);
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
    for (const row of (await tx.query("SELECT tinker_id FROM guild_members WHERE guild_id = $1", [mine.guildId])).rows) touched.add(Number(row.tinker_id));
  });
}

/** The guild chat channel this Tinker belongs to, or null. */
export async function guildChannel(db: Db, tinkerId: number): Promise<string | null> {
  const row = (await db.query("SELECT guild_id FROM guild_members WHERE tinker_id = $1", [tinkerId])).rows[0];
  return row ? `chat:guild:${row.guild_id}` : null;
}
