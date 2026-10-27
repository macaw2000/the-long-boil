// The Cog Shop through the API (GDD section 8), against a real PostgreSQL
// database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi, devClock } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";
import { grantCrates } from "../src/shop.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
const CRATE = "item.global.cog_crate";
let clock = Date.UTC(2026, 9, 27, 8, 0, 0);
const { clock: dev } = devClock();
const api = buildApi({ db, content, now: () => clock, trading: { level: 0, days: 0 }, devClock: dev });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await api.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT", url: string, payload?: object) {
  const response = await api.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

async function tinker(login: string) {
  return (await call("POST", "/tinkers", { login, name: login.split("@")[0]! })).body.tinker.id as number;
}

/** Grants and opens crates, for a Tinker with Cogs to spend. */
async function withCogs(id: number, crates: number) {
  await call("POST", `/dev/tinkers/${id}/crates`, { qty: crates });
  return call("POST", `/tinkers/${id}/shop/open`, { qty: crates });
}

describe("the Cog Shop", () => {
  it("shows a new Tinker no Cogs and every upgrade for sale", async () => {
    const id = await tinker("shop-new@example.com");
    const { status, body } = await call("GET", `/tinkers/${id}/shop`);
    expect(status).toBe(200);
    expect(body.shop).toMatchObject({ cogs: 0, crates: 0, arriving: [], upgrades: { queueSlots: 2, boilerHours: 12, nerveCap: 10, boostUntil: null } });
    expect(body.shop.offers).toEqual([
      { id: "queue_slot", cogs: 30 },
      { id: "boiler_upgrade", cogs: 20 },
      { id: "night_lamp", cogs: 40 },
      { id: "boiler_boost", cogs: 5 },
    ]);
    expect(body.tinker).toMatchObject({ cogs: 0, upgrades: { queueSlots: 2, boilerHours: 12, boostUntil: null } });
  });

  it("opens a granted crate for 10 Cogs", async () => {
    const id = await tinker("shop-open@example.com");
    const granted = await call("POST", `/dev/tinkers/${id}/crates`, { qty: 2 });
    expect(granted.body.shop.crates).toBe(2);
    expect(granted.body.tinker.inventory).toContainEqual({ item: CRATE, qty: 2, bound: false });
    const opened = await call("POST", `/tinkers/${id}/shop/open`, { qty: 1 });
    expect(opened.body.shop).toMatchObject({ cogs: 10, crates: 1 });
    expect((await call("POST", `/tinkers/${id}/shop/open`, { qty: 2 })).status).toBe(400);
  });

  it("holds a locked crate for 72 hours, then delivers it", async () => {
    const id = await tinker("shop-locked@example.com");
    const granted = await call("POST", `/dev/tinkers/${id}/crates`, { qty: 1, locked: true });
    expect(granted.body.shop.crates).toBe(0);
    expect(granted.body.shop.arriving).toEqual([{ qty: 1, unlocksAt: new Date(clock + 72 * HOUR).toISOString() }]);
    expect((await call("POST", `/tinkers/${id}/shop/open`, { qty: 1 })).status).toBe(400);
    clock += 72 * HOUR;
    const looked = await call("GET", `/tinkers/${id}`);
    expect(looked.body.tinker.inventory).toContainEqual({ item: CRATE, qty: 1, bound: false });
    expect((await call("GET", `/tinkers/${id}/shop`)).body.shop.arriving).toEqual([]);
  });

  it("delivers a payment's crates once, however often it is reported", async () => {
    const id = await tinker("shop-paid@example.com");
    await grantCrates(db, content, id, 1, clock, { source: "stripe", reference: "evt_test_1" });
    const again = await grantCrates(db, content, id, 1, clock, { source: "stripe", reference: "evt_test_1" });
    expect(again.shop.arriving).toHaveLength(1);
  });

  it("refuses an upgrade the Cogs do not cover", async () => {
    const id = await tinker("shop-poor@example.com");
    await withCogs(id, 1);
    const refused = await call("POST", `/tinkers/${id}/shop/buy`, { purchase: "queue_slot" });
    expect(refused).toEqual({ status: 400, body: { error: "that costs 30 Cogs; you have 10" } });
  });

  it("sells a third queue slot", async () => {
    const id = await tinker("shop-slot@example.com");
    const three = [
      { actionId: "action.rustmoor.prospect_copper", remaining: 1 },
      { actionId: "action.rustmoor.smelt_brass_ingot", remaining: 1 },
      { actionId: "action.rustmoor.prospect_copper", remaining: 2 },
    ];
    expect((await call("PUT", `/tinkers/${id}/queue`, { queue: three })).status).toBe(400);
    await withCogs(id, 3);
    const bought = await call("POST", `/tinkers/${id}/shop/buy`, { purchase: "queue_slot" });
    expect(bought.body.shop).toMatchObject({ cogs: 0, upgrades: { queueSlots: 3 } });
    expect(bought.body.shop.offers[0]).toEqual({ id: "queue_slot", cogs: null });
    const queued = await call("PUT", `/tinkers/${id}/queue`, { queue: three });
    expect(queued.status).toBe(200);
    expect(queued.body.tinker.queue).toHaveLength(3);
  });

  it("refills the Boiler to its new hours when they are raised", async () => {
    const id = await tinker("shop-boiler@example.com");
    await withCogs(id, 2);
    const bought = await call("POST", `/tinkers/${id}/shop/buy`, { purchase: "boiler_upgrade" });
    expect(bought.body.tinker.steamUntil).toBe(new Date(clock + 14 * HOUR).toISOString());
    clock += HOUR;
    const checked = await call("POST", `/tinkers/${id}/check-in`);
    expect(checked.body.tinker.steamUntil).toBe(new Date(clock + 14 * HOUR).toISOString());
  });

  it("raises the Nerve cap with the Night Lamp, without filling it", async () => {
    const id = await tinker("shop-lamp@example.com");
    await withCogs(id, 4);
    const lit = await call("POST", `/tinkers/${id}/shop/buy`, { purchase: "night_lamp" });
    expect(lit.body.tinker.story).toMatchObject({ nerve: 10, nerveCap: 14 });
    clock += 4 * 36 * 60_000;
    expect((await call("GET", `/tinkers/${id}`)).body.tinker.story).toMatchObject({ nerve: 14, nerveCap: 14, nextNerveAt: null });
  });

  it("speeds the next go under the Boiler Boost", async () => {
    const id = await tinker("shop-boost@example.com");
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.tinker_brass_spanner", remaining: 5 }] });
    const before = (await call("GET", `/tinkers/${id}`)).body.tinker.headMs;
    await withCogs(id, 1);
    // Buying resets nothing: the go under way keeps its pace, and the next is boosted.
    clock += before;
    const boosted = await call("POST", `/tinkers/${id}/shop/buy`, { purchase: "boiler_boost" });
    expect(boosted.body.tinker.upgrades.boostUntil).toBe(new Date(clock + 24 * HOUR).toISOString());
    expect(boosted.body.tinker.headMs).toBe(Math.round(before / 1.2));
  });
});

describe("Cog Crates on the Exchange", () => {
  it("tax the seller 15%", async () => {
    const seller = await tinker("crate-seller@example.com");
    const buyer = await tinker("crate-buyer@example.com");
    await call("POST", `/dev/tinkers/${seller}/crates`, { qty: 1 });
    await db.query("UPDATE tinkers SET crowns = 10000 WHERE id = $1", [buyer]);
    expect((await call("POST", `/tinkers/${seller}/orders`, { item: CRATE, side: "sell", price: 1000, qty: 1 })).status).toBe(201);
    expect((await call("POST", `/tinkers/${buyer}/orders`, { item: CRATE, side: "buy", price: 1000, qty: 1 })).status).toBe(201);
    const paid = await call("GET", `/tinkers/${seller}`);
    expect(paid.body.trades).toEqual([expect.objectContaining({ kind: "sold", item: CRATE, qty: 1, price: 1000, tax: 150 })]);
  });
});
