// Guilds through the API (build plan milestone 10), against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const DAY = 24 * 3_600_000;
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

  it("waits for the trading gate", async () => {
    const newcomer = await tinker("g-new@example.com", "New", 100_000);
    const view = await call("GET", `/tinkers/${newcomer}/guild`, undefined, gated);
    expect(view.body.locked).toMatch(/total level/);
    expect((await call("POST", `/tinkers/${newcomer}/guild`, { name: "Too Soon", crowns: 50_000 }, gated)).status).toBe(400);
  });

  it("opens a charter with at least 50,000 Crowns and a fair name", async () => {
    ada = await tinker("g-ada@example.com", "Ada", 300_000);
    expect((await call("POST", `/tinkers/${ada}/guild`, { name: "Iron Owls", crowns: 49_999 })).body.error).toMatch(/at least 50,000/);
    expect((await call("POST", `/tinkers/${ada}/guild`, { name: "Owls #1", crowns: 50_000 })).body.error).toMatch(/letters/);
    const founded = await call("POST", `/tinkers/${ada}/guild`, { name: "  Iron   Owls ", crowns: 100_000 });
    expect(founded.status).toBe(200);
    expect(founded.body.guild).toMatchObject({ name: "Iron Owls", status: "charter", pledged: 100_000, rank: "leader" });
    guildId = founded.body.guild.id;
    expect(await purse(ada)).toBe(200_000);
    const other = await tinker("g-copy@example.com", "Copy", 100_000);
    expect((await call("POST", `/tinkers/${other}/guild`, { name: "iron owls", crowns: 50_000 })).body.error).toMatch(/taken/);
  });

  it("forms when pledges pay the fee in full, and takes no more", async () => {
    bram = await tinker("g-bram@example.com", "Bram", 500_000);
    expect((await call("POST", `/tinkers/${bram}/guilds/${guildId}/pledge`, { crowns: 400_001 })).body.error).toMatch(/only 400,000 more/);
    const pledged = await call("POST", `/tinkers/${bram}/guilds/${guildId}/pledge`, { crowns: 400_000 });
    expect(pledged.status).toBe(200);
    const formed = (await call("GET", `/tinkers/${ada}/guild`)).body.guild;
    expect(formed.status).toBe("active");
    expect(formed.formedAt).not.toBeNull();
    expect((await call("POST", `/tinkers/${bram}/guilds/${guildId}/pledge`, { crowns: 1 })).body.error).toMatch(/already formed/);
  });

  it("lets Tinkers in by application or invitation, one guild per account", async () => {
    const applied = await call("POST", `/tinkers/${bram}/guilds/${guildId}/apply`);
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
    await db.query("UPDATE tinkers SET crowns = 60000 WHERE id = $1", [alt]);
    expect((await call("POST", `/tinkers/${alt}/guild`, { name: "Second Guild", crowns: 50_000 })).body.error).toMatch(/already in a guild/);
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

  it("keeps guild chat to its members", async () => {
    const outsider = await tinker("g-out@example.com", "Out");
    expect((await call("POST", `/tinkers/${outsider}/chat`, { text: "Let me in", channel: "guild" })).status).toBe(400);
    expect((await call("POST", `/tinkers/${bram}/chat`, { text: "Owls only.", channel: "guild" })).status).toBe(201);
    const guildChat = (await call("GET", `/tinkers/${bram}/chat?channel=guild`)).body.messages.map((m: { text: string }) => m.text);
    expect(guildChat).toEqual(["Owls only."]);
    const city = (await call("GET", `/tinkers/${outsider}/chat`)).body.messages.map((m: { text: string }) => m.text);
    expect(city).not.toContain("Owls only.");
  });
});

describe("a charter that does not fill", () => {
  it("refunds every pledge after 14 days", async () => {
    const dee = await tinker("g-dee@example.com", "Dee", 80_000);
    const eli = await tinker("g-eli@example.com", "Eli", 30_000);
    const founded = (await call("POST", `/tinkers/${dee}/guild`, { name: "Short Lived", crowns: 60_000 })).body.guild;
    await call("POST", `/tinkers/${eli}/guilds/${founded.id}/pledge`, { crowns: 25_000 });
    expect(await purse(dee)).toBe(20_000);
    expect(await purse(eli)).toBe(5_000);
    clock += 14 * DAY;
    const after = await call("GET", `/tinkers/${dee}/guild`);
    expect(after.body.guild).toBeNull();
    expect(after.body.guilds.map((g: { name: string }) => g.name)).not.toContain("Short Lived");
    expect(await purse(dee)).toBe(80_000);
    expect(await purse(eli)).toBe(30_000);
    const logged = await db.query("SELECT payload FROM events WHERE tinker_id = $1 AND type = 'guild_pledge_refunded'", [eli]);
    expect(logged.rows[0].payload).toMatchObject({ crowns: 25_000, why: "expired" });
  });

  it("refunds when its leader abandons it", async () => {
    const fay = await tinker("g-fay@example.com", "Fay", 50_000);
    await call("POST", `/tinkers/${fay}/guild`, { name: "Second Thoughts", crowns: 50_000 });
    expect(await purse(fay)).toBe(0);
    expect((await call("POST", `/tinkers/${fay}/guild/disband`)).body.guild).toBeNull();
    expect(await purse(fay)).toBe(50_000);
  });
});
