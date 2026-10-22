// Runs against a real PostgreSQL database, long_boil_test, rebuilt from the
// migrations before the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
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
      if (type === "action_completed") {
        for (const [item, qty] of Object.entries(payload.consumed as Record<string, number>)) inventory[item] = (inventory[item] ?? 0) - qty;
        for (const [item, qty] of Object.entries(payload.produced as Record<string, number>)) inventory[item] = (inventory[item] ?? 0) + qty;
        skills[payload.skill] = (skills[payload.skill] ?? 0) + payload.xp;
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
