// Guilds through the API (build plan milestone 10), against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const open = buildApi({ db, content, now: () => clock, trading: { level: 0, days: 0 } });
const gated = buildApi({ db, content, now: () => clock });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await open.close();
  await gated.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, via = open) {
  const response = await via.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

/** Test setup: a Tinker on its own account, with Crowns straight into its purse. */
async function tinker(login: string, name: string, crowns = 0): Promise<number> {
  const id = (await call("POST", "/tinkers", { login, name })).body.tinker.id;
  if (crowns) await db.query("UPDATE tinkers SET crowns = $2 WHERE id = $1", [id, crowns]);
  return id;
}

const purse = async (id: number) => Number((await db.query("SELECT crowns FROM tinkers WHERE id = $1", [id])).rows[0].crowns);

describe("founding a guild", () => {
  let ada: number;
  let bram: number;
  let guildId: number;

  it("is free, at once, and open to a brand-new Tinker", async () => {
    ada = await tinker("g-ada@example.com", "Ada", 300);
    expect((await call("POST", `/tinkers/${ada}/guild`, { name: "Owls #1" }, gated)).body.error).toMatch(/letters/);
    const founded = await call("POST", `/tinkers/${ada}/guild`, { name: "  Iron   Owls " }, gated);
    expect(founded.status).toBe(200);
    expect(founded.body.guild).toMatchObject({ name: "Iron Owls", rank: "leader" });
    expect(founded.body.guild.formedAt).not.toBeNull();
    guildId = founded.body.guild.id;
    expect(await purse(ada)).toBe(300);
    const other = await tinker("g-copy@example.com", "Copy");
    expect((await call("POST", `/tinkers/${other}/guild`, { name: "iron owls" })).body.error).toMatch(/taken/);
  });

  it("lets Tinkers in by application or invitation, one guild per account", async () => {
    bram = await tinker("g-bram@example.com", "Bram", 50_000);
    const applied = await call("POST", `/tinkers/${bram}/guilds/${guildId}/apply`, undefined, gated);
    expect(applied.body.applications).toEqual([{ guildId, name: "Iron Owls", status: "active" }]);
    const leaderSees = (await call("GET", `/tinkers/${ada}/guild`)).body.guild.requests;
    expect(leaderSees).toEqual([expect.objectContaining({ tinkerId: bram, kind: "application" })]);
    const accepted = await call("POST", `/tinkers/${ada}/guild/applications/${bram}/accept`);
    expect(accepted.body.guild.members.map((m: { name: string }) => m.name).sort()).toEqual(["Ada", "Bram"]);

    const cog = await tinker("g-cog@example.com", "Cog");
    expect((await call("POST", `/tinkers/${bram}/guild/invite/${cog}`)).body.error).toMatch(/member cannot/);
    expect((await call("POST", `/tinkers/${ada}/guild/invite/${cog}`)).status).toBe(200);
    expect((await call("GET", `/tinkers/${cog}/guild`)).body.invites).toEqual([{ guildId, name: "Iron Owls", status: "active" }]);
    const joined = await call("POST", `/tinkers/${cog}/guilds/${guildId}/accept`);
    expect(joined.body.guild.rank).toBe("member");

    // A second Tinker on Cog's account cannot join another guild.
    const alt = (await call("POST", "/tinkers", { login: "g-cog@example.com", name: "Cog Two" })).body.tinker.id;
    expect((await call("POST", `/tinkers/${alt}/guild`, { name: "Second Guild" })).body.error).toMatch(/already in a guild/);
  });

  it("keeps the leader from walking out, and hands leadership on", async () => {
    expect((await call("DELETE", `/tinkers/${ada}/guild/members/${ada}`)).body.error).toMatch(/hand leadership on/);
    expect((await call("PUT", `/tinkers/${bram}/guild/members/${ada}/rank`, { rank: "member" })).status).toBe(400);
    const handed = await call("PUT", `/tinkers/${ada}/guild/members/${bram}/rank`, { rank: "leader" });
    expect(handed.body.guild.rank).toBe("officer");
    expect((await call("GET", `/tinkers/${bram}/guild`)).body.guild.rank).toBe("leader");
    expect((await call("DELETE", `/tinkers/${ada}/guild/members/${ada}`)).body.guild).toBeNull();
  });

  it("charges 10,000 Crowns for a new name", async () => {
    const before = await purse(bram);
    const renamed = await call("POST", `/tinkers/${bram}/guild/rename`, { name: "Owls of the Iron" });
    expect(renamed.body.guild.name).toBe("Owls of the Iron");
    expect(await purse(bram)).toBe(before - 10_000);
  });

  it("pins a notice that every member reads, kept by the leader and officers", async () => {
    const cog = (await call("GET", `/tinkers/${bram}/guild`)).body.guild.members.find((m: { name: string }) => m.name === "Cog").tinkerId;
    expect((await call("PUT", `/tinkers/${cog}/guild/notice`, { text: "Hello" })).body.error).toMatch(/member cannot/);
    expect((await call("PUT", `/tinkers/${bram}/guild/notice`, { text: "x".repeat(501) })).body.error).toMatch(/at most 500/);
    await call("PUT", `/tinkers/${bram}/guild/notice`, { text: "  Smelting night on Friday. Bring coal.  " });
    expect((await call("GET", `/tinkers/${cog}/guild`)).body.guild.notice).toMatchObject({ text: "Smelting night on Friday. Bring coal.", by: "Bram" });
    await call("PUT", `/tinkers/${bram}/guild/members/${cog}/rank`, { rank: "officer" });
    expect((await call("PUT", `/tinkers/${cog}/guild/notice`, { text: "" })).body.guild.notice).toBeNull();
  });

  it("lets anyone inspect a Tinker's guild, skills and gear, but not their purse", async () => {
    const stranger = await tinker("g-look@example.com", "Look");
    const seen = (await call("GET", `/tinkers/${stranger}/inspect/${bram}`)).body;
    expect(seen).toMatchObject({ id: bram, name: "Bram", guild: { id: guildId, name: "Owls of the Iron", rank: "leader" }, weapon: null, worn: {} });
    expect(seen.skills.length).toBeGreaterThan(0);
    expect(seen.totalLevel).toBeGreaterThan(0);
    expect(seen).not.toHaveProperty("crowns");
    expect((await call("GET", `/tinkers/${stranger}/inspect/${ada}`)).body.guild).toBeNull();
    expect((await call("GET", `/tinkers/${stranger}/inspect/999999`)).status).toBe(404);
  });

  it("keeps guild chat to its members", async () => {
    const outsider = await tinker("g-out@example.com", "Out");
    expect((await call("POST", `/tinkers/${outsider}/chat`, { text: "Let me in", channel: "guild" })).status).toBe(400);
    expect((await call("POST", `/tinkers/${bram}/chat`, { text: "Owls only.", channel: "guild" })).status).toBe(201);
    const guildChat = (await call("GET", `/tinkers/${bram}/chat?channel=guild`)).body.messages.map((m: { text: string }) => m.text);
    expect(guildChat).toEqual(["Owls only."]);
    const city = (await call("GET", `/tinkers/${outsider}/chat`)).body.messages.map((m: { text: string }) => m.text);
    expect(city).not.toContain("Owls only.");
  });

  it("tells a member at check-in what the guild said while they were away", async () => {
    const cog = (await call("GET", `/tinkers/${bram}/guild`)).body.guild.members.find((m: { name: string }) => m.name === "Cog").tinkerId;
    await db.query("UPDATE tinkers SET resolved_to = $2 WHERE id = $1", [cog, new Date(clock - 3_600_000)]);
    clock += 5_000;
    await call("POST", `/tinkers/${bram}/chat`, { text: "Smelting tonight.", channel: "guild" });
    const back = (await call("POST", `/tinkers/${cog}/check-in`)).body;
    expect(back.guildActivity).toEqual({
      guild: "Owls of the Iron",
      count: 2,
      from: ["Bram"],
      others: 0,
      last: { name: "Bram", text: "Smelting tonight." },
      notice: null,
    });
    expect((await call("POST", `/tinkers/${cog}/check-in`)).body.guildActivity).toBeNull();
    expect((await call("POST", `/tinkers/${bram}/check-in`)).body.guildActivity).toBeNull();
  });

  it("keeps a feed of the guild's comings, goings, ranks, notices and members' feats", async () => {
    const cog = (await call("GET", `/tinkers/${bram}/guild`)).body.guild.members.find((m: { name: string }) => m.name === "Cog").tinkerId;
    const log = async (type: string, payload: object) => {
      const seq = Number((await db.query("SELECT last_seq FROM tinkers WHERE id = $1", [cog])).rows[0].last_seq) + 1;
      await db.query("INSERT INTO events (tinker_id, seq, type, at, payload, content_version) VALUES ($1, $2, $3, $4, $5, 'test')", [cog, seq, type, new Date(clock), payload]);
      await db.query("UPDATE tinkers SET last_seq = $2 WHERE id = $1", [cog, seq]);
    };
    clock += 1_000;
    await log("level_up", { skill: "smithing", level: 9 });
    await log("level_up", { skill: "smithing", level: 10 });
    clock += 1_000;
    await log("boss_attempted", { monsterId: "monster.rustmoor.scrapjaw", won: true });
    clock += 1_000;
    await log("boss_attempted", { monsterId: "monster.rustmoor.scrapjaw", won: true });
    clock += 1_000;
    await call("PUT", `/tinkers/${bram}/guild/notice`, { text: "Welcome." });
    const activity = (await call("GET", `/tinkers/${cog}/guild`)).body.guild.activity;
    const lines = activity.map((entry: { kind: string; tinker: { name: string } }) => `${entry.tinker.name} ${entry.kind}`);
    expect(lines.slice(0, 3)).toEqual(["Bram notice", "Cog boss", "Cog level"]);
    expect(activity[2]).toMatchObject({ skill: "smithing", level: 10 });
    expect(lines.filter((line: string) => line === "Cog boss")).toHaveLength(1);
    expect(activity).toContainEqual(expect.objectContaining({ kind: "rank", rank: "officer", by: "Bram", tinker: expect.objectContaining({ name: "Cog" }) }));
    expect(activity).toContainEqual(expect.objectContaining({ kind: "left", tinker: expect.objectContaining({ name: "Ada" }) }));
    expect(activity).toContainEqual(expect.objectContaining({ kind: "renamed", name: "Owls of the Iron" }));
    expect(activity.at(-1)).toMatchObject({ kind: "founded", tinker: { name: "Ada" } });
  });
});

describe("a charter from when guilds cost a fee", () => {
  it("forms on the next guild step and refunds every pledge", async () => {
    const dee = await tinker("g-dee@example.com", "Dee", 20_000);
    const eli = await tinker("g-eli@example.com", "Eli", 5_000);
    const charter = (
      await db.query("INSERT INTO guilds (name, status, pledged, created_at, charter_ends) VALUES ('Old Charter', 'charter', 85000, $1, $1) RETURNING id", [new Date(clock)])
    ).rows[0].id;
    await db.query("INSERT INTO guild_members (guild_id, tinker_id, account_id, rank, joined_at) SELECT $1, id, account_id, 'leader', $3 FROM tinkers WHERE id = $2", [
      charter,
      dee,
      new Date(clock),
    ]);
    await db.query("INSERT INTO guild_pledges (guild_id, tinker_id, crowns, at) VALUES ($1, $2, 60000, $4), ($1, $3, 25000, $4)", [charter, dee, eli, new Date(clock)]);
    const after = await call("GET", `/tinkers/${dee}/guild`);
    expect(after.body.guild).toMatchObject({ name: "Old Charter", rank: "leader" });
    expect(await purse(dee)).toBe(80_000);
    expect(await purse(eli)).toBe(30_000);
    const logged = await db.query("SELECT payload FROM events WHERE tinker_id = $1 AND type = 'guild_pledge_refunded'", [eli]);
    expect(logged.rows[0].payload).toMatchObject({ crowns: 25_000, why: "free" });
  });
});
