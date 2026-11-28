// Guild Contracts through the API (work order 043), against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import * as rules from "@long-boil/rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { countGuildWork } from "../src/contracts.js";
import { connect, migrate, withTransaction } from "../src/db.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
// Monday 19 October 2026, 08:00 UTC.
const MONDAY = Date.UTC(2026, 9, 19);
let clock = MONDAY + 8 * HOUR;
const app = buildApi({ db, content, now: () => clock });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

let made = 0;
async function tinker(name: string): Promise<number> {
  return (await call("POST", "/tinkers", { login: `contract-${made++}`, name })).body.tinker.id;
}
async function guild(lead: number, name: string): Promise<number> {
  return (await call("POST", `/tinkers/${lead}/guild`, { name })).body.guild.id;
}
const join = (id: number, to: number) => call("POST", `/tinkers/${id}/guilds/${to}/apply`);
const contracts = async (id: number) => (await call("GET", `/tinkers/${id}/guild`)).body.guild.contracts;
const tokens = async (id: number) => Number((await db.query("SELECT guild_tokens FROM tinkers WHERE id = $1", [id])).rows[0].guild_tokens);
/** Goes of a Runt fight worth a number of hours, all at one moment. */
const fights = (hours: number, at: number): rules.GameEvent[] => {
  const seconds = content.rules.monsters.get("monster.rustmoor.rust_rat_runt")!.seconds_per_kill;
  return Array.from({ length: Math.ceil((hours * 3600) / seconds) }, () => ({
    type: "monster_killed" as const, at, monsterId: "monster.rustmoor.rust_rat_runt", xp: {}, crowns: 0, consumed: {}, produced: {},
  }));
};
const work = (id: number, hours: number, at = clock) => withTransaction(db, (tx) => countGuildWork(tx, content, id, fights(hours, at), clock));
const fight = (view: { contracts: { kind: string; seconds: number; mine: number; reached: number; targets: number[] }[] }) => view.contracts.find((c) => c.kind === "fight")!;

describe("the rules", () => {
  it("begin a week on Monday at midnight and draw four skills and the fights, the same every time", () => {
    expect(rules.contractWeek(MONDAY)).toBe(MONDAY);
    expect(rules.contractWeek(MONDAY - 1)).toBe(MONDAY - 7 * DAY);
    expect(rules.contractWeek(MONDAY + 7 * DAY - 1)).toBe(MONDAY);
    const drawn = rules.drawContracts(content.rules, 7, MONDAY);
    expect(drawn).toHaveLength(5);
    expect(new Set(drawn).size).toBe(5);
    expect(drawn.at(-1)).toBe("fight");
    expect(rules.drawContracts(content.rules, 7, MONDAY)).toEqual(drawn);
    // Every skill comes up over enough weeks, and weeks differ.
    const weeks = Array.from({ length: 30 }, (_, n) => rules.drawContracts(content.rules, 7, MONDAY + n * 7 * DAY));
    expect(new Set(weeks.flat()).size).toBe(new Set([...content.rules.actions.values()].map((a) => a.skill)).size + 1);
    expect(new Set(weeks.map((w) => w.join())).size).toBeGreaterThan(3);
  });

  it("scale the targets to the guild and count no boss attempts", () => {
    expect(rules.contractTargets(0)).toEqual([7200, 14400, 28800]);
    expect(rules.contractTargets(2.5)).toEqual([18000, 36000, 72000]);
    expect(rules.tiersReached(14400, 1)).toBe(2);
    const boss: rules.GameEvent = { type: "boss_attempted", at: MONDAY, monsterId: "monster.rustmoor.scrapjaw", won: true, winChance: 1, xp: {}, crowns: 0, consumed: {}, produced: {} };
    expect(rules.countedWork([boss], content.rules, 0).size).toBe(0);
  });
});

describe("a guild's week", () => {
  it("counts ordinary work through a real check-in, and only since joining", async () => {
    const lead = await tinker("Worker");
    await call("PUT", `/tinkers/${lead}/queue`, { queue: [{ actionId: "action.rustmoor.prospect_copper", remaining: 1000 }] });
    // Two hours before there is a guild count for nothing.
    clock += 2 * HOUR;
    await call("POST", `/tinkers/${lead}/check-in`);
    // Guilds are founded until one draws Prospecting, so the work queued has a contract.
    let id = await guild(lead, "Prospect Row");
    for (let n = 0; n < 40 && !(await contracts(lead)).contracts.some((c: { kind: string }) => c.kind === "prospecting"); n++) {
      await call("POST", `/tinkers/${lead}/guild/disband`);
      id = await guild(lead, "Prospect Row");
    }
    clock += 3 * HOUR;
    await call("POST", `/tinkers/${lead}/check-in`);
    const row = (await contracts(lead)).contracts.find((c: { kind: string }) => c.kind === "prospecting");
    expect(row.mine).toBeGreaterThan(2.9 * 3600);
    // The minute and a half after the check-in before runs hot (work order 045), which is worth a few minutes more.
    expect(row.mine).toBeLessThan(3.2 * 3600);
    // A second look counts nothing again.
    await call("POST", `/tinkers/${lead}/check-in`);
    expect((await contracts(lead)).contracts.find((c: { kind: string }) => c.kind === "prospecting").mine).toBe(row.mine);
    expect(row.reached).toBe(1);
    const activity = (await call("GET", `/tinkers/${lead}/guild`)).body.guild.activity;
    expect(activity).toContainEqual(expect.objectContaining({ kind: "tier", contract: "prospecting", tier: 1 }));
    expect(id).toBeGreaterThan(0);
  });

  it("raises the targets by the part of the week a joiner has, and keeps a tier once reached", async () => {
    const lead = await tinker("Early");
    const late = await tinker("Late");
    const id = await guild(lead, "Late Comers");
    await work(lead, 2.1);
    expect(fight(await contracts(lead)).reached).toBe(1);
    clock = MONDAY + 3.5 * DAY;
    await join(late, id);
    const after = fight(await contracts(late));
    expect(after.targets[0]).toBeGreaterThan(1.3 * 7200);
    expect(after.targets[0]).toBeLessThan(1.5 * 7200);
    expect(after.reached).toBe(1);
    // Leaving and coming back does not count an account twice.
    await call("DELETE", `/tinkers/${late}/guild/members/${late}`);
    await join(late, id);
    expect(fight(await contracts(late)).targets).toEqual(after.targets);
  });

  it("leaves a long-absent member out of a new week until they work again", async () => {
    clock = MONDAY + 4 * DAY;
    const lead = await tinker("Here");
    const gone = await tinker("Gone");
    const id = await guild(lead, "Half Empty");
    await join(gone, id);
    await db.query("UPDATE tinkers SET resolved_to = $2 WHERE id = $1", [gone, new Date(clock)]);
    clock = MONDAY + 3 * 7 * DAY + HOUR;
    await call("POST", `/tinkers/${lead}/check-in`);
    expect(fight(await contracts(lead)).targets[0]).toBe(7200);
    await work(gone, 0.5);
    expect(fight(await contracts(lead)).targets[0]).toBe(14400);
  });

  it("counts late work for 48 hours after the week, pays once, and then is shut", async () => {
    const start = MONDAY + 10 * 7 * DAY;
    clock = start + HOUR;
    const lead = await tinker("Payer");
    const idle = await tinker("Idler");
    const id = await guild(lead, "Paid Up");
    await join(idle, id);
    await work(lead, 3);
    // Sunday's last hour, settled on Tuesday: inside the 48 hours.
    clock = start + 7 * DAY + 47 * HOUR;
    await work(lead, 13.5, start + 7 * DAY - 1);
    await contracts(lead);
    expect((await db.query("SELECT closed_at FROM guild_weeks WHERE guild_id = $1 AND week = $2", [id, new Date(start)])).rows[0].closed_at).toBeNull();
    clock = start + 7 * DAY + 48 * HOUR;
    expect(await work(lead, 10, start + 7 * DAY - 1)).toEqual([]);
    // Two members opening the Guild tab together close it once.
    await Promise.all([contracts(lead), contracts(idle), contracts(lead)]);
    // All 3 tiers of one contract were reached (16.5 hours against 8 for each of 2 members).
    expect((await contracts(lead)).tokens).toBe(3);
    expect(await tokens(lead)).toBe(0);
    await call("POST", `/tinkers/${lead}/check-in`);
    await call("POST", `/tinkers/${lead}/check-in`);
    expect(await tokens(lead)).toBe(3);
    expect((await contracts(lead)).tokens).toBe(3);
    // Under two hours earns nothing.
    await call("POST", `/tinkers/${idle}/check-in`);
    expect(await tokens(idle)).toBe(0);
    expect(Number((await db.query("SELECT workshop_points FROM guilds WHERE id = $1", [id])).rows[0].workshop_points)).toBe(3);
  });

  it("pays an account by one guild a week", async () => {
    const start = MONDAY + 20 * 7 * DAY;
    clock = start + HOUR;
    const mover = await tinker("Mover");
    const one = await tinker("One Lead");
    const two = await tinker("Two Lead");
    const first = await guild(one, "First Stop");
    const second = await guild(two, "Second Stop");
    await join(mover, first);
    await work(mover, 5);
    await call("DELETE", `/tinkers/${mover}/guild/members/${mover}`);
    await join(mover, second);
    clock += HOUR;
    await work(mover, 5);
    clock = start + 9 * DAY;
    await contracts(one);
    await contracts(mover);
    await call("POST", `/tinkers/${mover}/check-in`);
    const paid = (await db.query("SELECT guild_id FROM guild_token_payments WHERE tinker_id = $1", [mover])).rows;
    expect(paid.map((row) => Number(row.guild_id))).toEqual([second]);
  });

  it("counts members working at once without losing any", async () => {
    clock = MONDAY + 30 * 7 * DAY + HOUR;
    const lead = await tinker("Crowd");
    const id = await guild(lead, "Crowded");
    const others = await Promise.all(Array.from({ length: 6 }, (_, n) => tinker(`Hand ${n}`)));
    for (const other of others) await join(other, id);
    await Promise.all([...others.map((other) => work(other, 1)), ...others.map((other) => call("GET", `/tinkers/${other}/guild`))]);
    expect(fight(await contracts(lead)).seconds).toBeGreaterThanOrEqual(6 * 3600);
  });

  it("grows the guild by its Workshop and spends tokens on a look, once", async () => {
    const lead = await tinker("Builder");
    const id = await guild(lead, "Built Up");
    await db.query("UPDATE guilds SET workshop_points = 12 WHERE id = $1", [id]);
    const other = await tinker("Looker");
    expect((await call("GET", `/tinkers/${lead}/guild`)).body.guild).toMatchObject({ maxMembers: 32, workshop: { level: 1, into: 2, cost: 20 } });
    expect((await call("GET", `/tinkers/${other}/guilds/${id}`)).body.maxMembers).toBe(32);
    const crowd = await Promise.all(Array.from({ length: 32 }, (_, n) => tinker(`Place ${n}`)));
    const joined = await Promise.all(crowd.map((each) => join(each, id)));
    expect(joined.filter((each) => each.status === 200)).toHaveLength(31);
    expect(joined.find((each) => each.status !== 200)!.body.error).toMatch(/full, at 32/);

    const buy = () => call("POST", `/tinkers/${lead}/wardrobe/buy`, { look: "look.outfit.guild_plum" });
    expect((await buy()).body.error).toMatch(/20 Guild Tokens; you have 0/);
    await db.query("UPDATE tinkers SET guild_tokens = 45, cogs = 3 WHERE id = $1", [lead]);
    const both = await Promise.all([buy(), buy()]);
    expect(both.map((each) => each.status).sort()).toEqual([200, 400]);
    const after = (await call("GET", `/tinkers/${lead}/wardrobe`)).body.wardrobe;
    expect(after).toMatchObject({ cogs: 3, tokens: 25, wearing: { outfit: "look.outfit.guild_plum" } });
    // It is theirs whether or not they stay.
    await db.query("DELETE FROM guild_members WHERE tinker_id = $1", [lead]);
    expect((await call("PUT", `/tinkers/${lead}/look`, { outfit: "look.outfit.guild_plum" })).status).toBe(200);
  });

  it("lets a brand-new Tinker join a new guild in one step", async () => {
    const lead = await tinker("Open Door");
    const id = await guild(lead, "Open House");
    const newcomer = await tinker("Newcomer");
    expect((await join(newcomer, id)).body.guild).toMatchObject({ id, rank: "member" });
  });
});
