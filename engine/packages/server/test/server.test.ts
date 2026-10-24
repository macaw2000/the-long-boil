// Runs against a real PostgreSQL database, long_boil_test, rebuilt from the
// migrations before the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi, devClock } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const app = buildApi({ db, content, now: () => clock });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT", url: string, payload?: object) {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

describe("a Tinker's first session", () => {
  let id: number;

  it("starts with the first session's stock (content/start.json)", async () => {
    const { status, body } = await call("POST", "/tinkers", { login: "ada@example.com", name: "Ada" });
    expect(status).toBe(201);
    id = body.tinker.id;
    expect(body.tinker.crowns).toBe(0);
    expect(body.tinker.inventory).toEqual([
      { item: "item.rustmoor.brass_ingot", qty: 50, bound: false },
      { item: "item.rustmoor.rustmoor_ration", qty: 342, bound: true },
    ]);
  });

  it("queues 50 spanners and finds them made after a 6-hour break", async () => {
    const queued = await call("PUT", `/tinkers/${id}/queue`, {
      queue: [
        { actionId: "action.rustmoor.tinker_brass_spanner", remaining: 50 },
        { actionId: "action.rustmoor.prospect_copper", remaining: 5000 },
      ],
    });
    expect(queued.status).toBe(200);

    clock += 6 * HOUR;
    const { body } = await call("POST", `/tinkers/${id}/check-in`);
    const spanners = body.tinker.inventory.find((stack: { item: string }) => stack.item === "item.rustmoor.brass_spanner");
    expect(spanners.qty).toBe(50);
    const copper = body.tinker.inventory.find((stack: { item: string }) => stack.item === "item.rustmoor.copper");
    expect(copper.qty).toBe(Math.floor((6 * 3600 - 50 * 54) / 54));
    expect(body.tinker.skills.find((skill: { skill: string }) => skill.skill === "tinkering")).toMatchObject({ xp: 450, level: 3 });
    expect(new Date(body.tinker.steamUntil).getTime()).toBe(clock + 12 * HOUR);
  });

  it("stops at the Boiler's 12 hours however long the break", async () => {
    const before = (await call("POST", `/tinkers/${id}/check-in`)).body.tinker;
    const copperBefore = before.inventory.find((stack: { item: string }) => stack.item === "item.rustmoor.copper").qty;
    clock += 48 * HOUR;
    const { body } = await call("POST", `/tinkers/${id}/check-in`);
    const copperAfter = body.tinker.inventory.find((stack: { item: string }) => stack.item === "item.rustmoor.copper").qty;
    expect(copperAfter - copperBefore).toBe(800);
    expect(body.events.some((event: { type: string }) => event.type === "boiler_dry")).toBe(true);
  });

  it("equips the spanner and fights Rust Rats, eating the bound Rations first", async () => {
    expect((await call("PUT", `/tinkers/${id}/weapon`, { item: "item.rustmoor.brass_spanner" })).status).toBe(200);
    const queued = await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "monster.rustmoor.rust_rat_runt", remaining: 200 }] });
    expect(queued.status).toBe(200);
    clock += 2 * HOUR;
    const { body } = await call("POST", `/tinkers/${id}/check-in`);
    const kills = body.events.filter((event: { type: string }) => event.type === "monster_killed");
    expect(kills.length).toBeGreaterThan(100);
    expect(body.tinker.crowns).toBe(kills.reduce((sum: number, kill: { crowns: number }) => sum + kill.crowns, 0));
    const scrap = body.tinker.inventory.find((stack: { item: string }) => stack.item === "item.rustmoor.rat_scrap");
    expect(scrap.qty).toBe(kills.length);
    const rations = body.tinker.inventory.filter((stack: { item: string }) => stack.item === "item.rustmoor.rustmoor_ration");
    expect(rations).toHaveLength(1);
    expect(rations[0].bound).toBe(true);
    expect(rations[0].qty).toBeLessThan(342);
    expect(body.tinker.skills.find((skill: { skill: string }) => skill.skill === "melee").level).toBeGreaterThan(1);
  });

  it("refuses a weapon the Tinker does not hold", async () => {
    expect((await call("PUT", `/tinkers/${id}/weapon`, { item: "item.rustmoor.steel_blade" })).status).toBe(400);
  });

  it("keeps every change in the ordered event log", async () => {
    const { rows } = await db.query("SELECT seq, type FROM events WHERE tinker_id = $1 ORDER BY seq", [id]);
    expect(rows[0]).toEqual({ seq: "1", type: "tinker_created" });
    expect(rows.map((row) => Number(row.seq))).toEqual(rows.map((_, index) => index + 1));
    const completed = rows.filter((row) => row.type === "action_completed").length;
    const { rows: tinker } = await db.query("SELECT last_seq FROM tinkers WHERE id = $1", [id]);
    expect(Number(tinker[0].last_seq)).toBe(rows.length);
    expect(completed).toBeGreaterThan(50);
  });

  it("rebuilds the inventory and skills projections from the log alone", async () => {
    const { rows } = await db.query("SELECT type, payload FROM events WHERE tinker_id = $1 ORDER BY seq", [id]);
    const inventory: Record<string, number> = {};
    const skills: Record<string, number> = {};
    for (const { type, payload } of rows) {
      if (type === "tinker_created") for (const stack of payload.inventory) inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.qty;
      if (type === "action_completed" || type === "monster_killed" || type === "boss_attempted") {
        for (const [item, qty] of Object.entries(payload.consumed as Record<string, number>)) inventory[item] = (inventory[item] ?? 0) - qty;
        for (const [item, qty] of Object.entries(payload.produced as Record<string, number>)) inventory[item] = (inventory[item] ?? 0) + qty;
        const xp: Record<string, number> = type === "action_completed" ? { [payload.skill]: payload.xp } : payload.xp;
        for (const [skill, gained] of Object.entries(xp)) skills[skill] = (skills[skill] ?? 0) + gained;
      }
    }
    for (const item of Object.keys(inventory)) if (inventory[item] === 0) delete inventory[item];

    const projected: Record<string, number> = {};
    for (const row of (await db.query("SELECT item, qty FROM inventory WHERE tinker_id = $1", [id])).rows) {
      projected[row.item] = (projected[row.item] ?? 0) + Number(row.qty);
    }
    const projectedSkills = Object.fromEntries(
      (await db.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [id])).rows.map((row) => [row.skill, Number(row.xp)]),
    );
    expect(projected).toEqual(inventory);
    expect(projectedSkills).toEqual(skills);
  });
});

describe("the rules the database enforces", () => {
  it("allows at most 3 Tinkers per account", async () => {
    for (const name of ["One", "Two", "Three"]) {
      expect((await call("POST", "/tinkers", { login: "busy@example.com", name })).status).toBe(201);
    }
    expect((await call("POST", "/tinkers", { login: "busy@example.com", name: "Four" })).status).toBe(409);
  });

  it("rejects a third queue slot and unknown actions", async () => {
    const { body } = await call("POST", "/tinkers", { login: "eve@example.com", name: "Eve" });
    const id = body.tinker.id;
    const action = { actionId: "action.rustmoor.prospect_copper", remaining: 1 };
    expect((await call("PUT", `/tinkers/${id}/queue`, { queue: [action, action, action] })).status).toBe(400);
    expect((await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.nowhere.nothing", remaining: 1 }] })).status).toBe(400);
  });

  it("returns 404 for a Tinker that does not exist", async () => {
    expect((await call("POST", "/tinkers/999999/check-in")).status).toBe(404);
  });

  it("serialises concurrent check-ins on one Tinker", async () => {
    const { body } = await call("POST", "/tinkers", { login: "kit@example.com", name: "Kit" });
    const id = body.tinker.id;
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.prospect_copper", remaining: 500 }] });
    clock += 2 * HOUR;
    await Promise.all(Array.from({ length: 8 }, () => call("POST", `/tinkers/${id}/check-in`)));
    const { rows } = await db.query("SELECT qty FROM inventory WHERE tinker_id = $1 AND item = 'item.rustmoor.copper'", [id]);
    expect(Number(rows[0].qty)).toBe(Math.floor((2 * 3600) / 54));
  });
});

describe("what the client reads", () => {
  it("serves item names with the content", async () => {
    const { body } = await call("GET", "/content");
    expect(body.items).toContainEqual(expect.objectContaining({ id: "item.rustmoor.brass_spanner", name: "Brass Spanner" }));
    expect(body.totalXp[2]).toBe(16);
  });

  it("lists an account's Tinkers, and none for an unknown login", async () => {
    await call("POST", "/tinkers", { login: "list@example.com", name: "First" });
    await call("POST", "/tinkers", { login: "list@example.com", name: "Second" });
    const { body } = await call("GET", "/accounts/list@example.com/tinkers");
    expect(body.tinkers.map((tinker: { name: string }) => tinker.name)).toEqual(["First", "Second"]);
    expect((await call("GET", "/accounts/nobody@example.com/tinkers")).body.tinkers).toEqual([]);
  });

  it("shows work landing on a look without refilling the Boiler", async () => {
    const created = (await call("POST", "/tinkers", { login: "look@example.com", name: "Lou" })).body.tinker;
    await call("PUT", `/tinkers/${created.id}/queue`, { queue: [{ actionId: "action.rustmoor.prospect_copper", remaining: 100 }] });
    clock += 10 * 60_000;
    const { status, body } = await call("GET", `/tinkers/${created.id}`);
    expect(status).toBe(200);
    expect(body.ledger.lines).toEqual([expect.objectContaining({ id: "action.rustmoor.prospect_copper", count: 11 })]);
    expect(body.tinker.inventory).toContainEqual({ item: "item.rustmoor.copper", qty: 11, bound: false });
    expect(body.tinker.steamUntil).toBe(created.steamUntil);
    expect((await call("GET", `/tinkers/${created.id}`)).body.events).toEqual([]);
  });
});

describe("a browser client on another origin", () => {
  it("is allowed every method the client uses", async () => {
    const browser = buildApi({ db, content, now: () => clock, corsOrigins: ["http://localhost:8081"] });
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const response = await browser.inject({
        method: "OPTIONS",
        url: "/tinkers/1/queue",
        headers: { origin: "http://localhost:8081", "access-control-request-method": method, "access-control-request-headers": "content-type" },
      });
      expect(response.statusCode).toBe(204);
      expect(String(response.headers["access-control-allow-methods"])).toContain(method);
    }
    await browser.close();
  });
});

describe("the loadout", () => {
  it("compares every owned weapon on how each fight would go", async () => {
    const id = (await call("POST", "/tinkers", { login: "loadout@example.com", name: "Lo" })).body.tinker.id;
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.tinker_brass_spanner", remaining: 1 }, { actionId: "action.rustmoor.tinker_brass_catapult", remaining: 1 }] });
    clock += HOUR;
    await call("POST", `/tinkers/${id}/check-in`);
    await call("PUT", `/tinkers/${id}/weapon`, { item: "item.rustmoor.brass_spanner" });
    const { status, body } = await call("GET", `/tinkers/${id}/loadout`);
    expect(status).toBe(200);
    const byItem = Object.fromEntries(body.weapons.map((weapon: { item: string }) => [weapon.item, weapon]));
    expect(Object.keys(byItem).sort()).toEqual(["item.rustmoor.brass_catapult", "item.rustmoor.brass_spanner"]);
    expect(byItem["item.rustmoor.brass_spanner"]).toMatchObject({ style: "melee", equipped: true, usable: true });
    expect(byItem["item.rustmoor.brass_catapult"].equipped).toBe(false);
    const runt = (weapon: { outlooks: { monsterId: string; seconds?: number }[] }) =>
      weapon.outlooks.find((outlook) => outlook.monsterId === "monster.rustmoor.rust_rat_runt")!;
    // Runts are weak to Melee, so the spanner kills them faster than the catapult.
    expect(runt(byItem["item.rustmoor.brass_spanner"]).seconds!).toBeLessThan(runt(byItem["item.rustmoor.brass_catapult"]).seconds!);
  });
});

describe("the dev clock", () => {
  it("exists only when given, and moves the game forward", async () => {
    expect((await call("POST", "/dev/skip", { hours: 1 })).status).toBe(404);
    const dev = devClock();
    const local = buildApi({ db, content, devClock: dev.clock, now: dev.now });
    const before = dev.now();
    const skipped = await local.inject({ method: "POST", url: "/dev/skip", payload: { hours: 12 } });
    expect(skipped.statusCode).toBe(200);
    expect(skipped.json().offsetMs).toBe(12 * HOUR);
    expect(dev.now() - before).toBeGreaterThanOrEqual(12 * HOUR);
    expect((await local.inject({ method: "GET", url: "/content" })).json().dev).toEqual({ offsetMs: 12 * HOUR });
    expect((await local.inject({ method: "POST", url: "/dev/skip", payload: { hours: 0 } })).statusCode).toBe(400);
    await local.close();
  });

  it("sets story qualities and fills Nerve on a dev server only, and logs the change", async () => {
    const kit = (await call("POST", "/tinkers", { login: "dev-story@example.com", name: "Dev" })).body.tinker.id;
    expect((await call("POST", `/dev/tinkers/${kit}/story`, { qualities: { "needle.scald": 8 } })).status).toBe(404);

    const dev = devClock();
    const local = buildApi({ db, content, devClock: dev.clock, now: dev.now });
    const set = async (payload: object) => {
      const response = await local.inject({ method: "POST", url: `/dev/tinkers/${kit}/story`, payload });
      return { status: response.statusCode, body: response.json() };
    };
    await db.query("UPDATE tinkers SET nerve = 2 WHERE id = $1", [kit]);
    const redlined = await set({ qualities: { "needle.scald": 8 }, fillNerve: true });
    expect(redlined.status).toBe(200);
    expect(redlined.body.view.needles["needle.scald"]).toBe(8);
    expect(redlined.body.view.nerve).toBe(10);
    // Redline sends the Tinker to St. Pinion's (work order 020).
    expect(redlined.body.view.inInfirmary).toBe(true);
    expect(redlined.body.view.storylets.every((scene: { location: string }) => scene.location === "infirmary")).toBe(true);
    const logged = await db.query("SELECT payload FROM events WHERE tinker_id = $1 AND type = 'dev_story_set'", [kit]);
    expect(logged.rows[0].payload.qualities).toEqual({ "needle.scald": 8 });

    expect((await set({ qualities: { "needle.scald": 9 } })).status).toBe(400);
    expect((await set({ qualities: { "skill.smithing": 50 } })).status).toBe(400);
    expect((await set({ qualities: { "favour.stokers": 3 } })).body.view.qualities["favour.stokers"]).toBe(3);
    await local.close();
  });
});
