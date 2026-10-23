// The Brass Exchange and the Counting-House window against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A Thursday, so the collectors' week has days left in it.
let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
// Most tests trade at once; the gate has its own app with the GDD's rules.
const app = buildApi({ db, content, now: () => clock, trading: { level: 0, days: 0 } });
const gated = buildApi({ db, content, now: () => clock });

const COPPER = "item.rustmoor.copper";
const NAILS = "item.rustmoor.bent_nails";
const MEAL = "item.rustmoor.barley_meal";

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await gated.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, via = app) {
  const response = await via.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

function held(tinker: { inventory: { item: string; qty: number; bound: boolean }[] }, item: string) {
  return tinker.inventory.filter((stack) => stack.item === item && !stack.bound).reduce((sum, stack) => sum + stack.qty, 0);
}

async function tinkerWith(login: string, name: string, actionId: string, hours: number) {
  const id = (await call("POST", "/tinkers", { login, name })).body.tinker.id;
  await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId, remaining: 10_000 }] });
  return id as number;
}

describe("the Counting-House window", () => {
  let bea: number;

  it("buys salvage from the collectors up to the weekly cap", async () => {
    bea = await tinkerWith("bea@example.com", "Bea", "action.rustmoor.scavenge_bent_nails", 2);
    clock += 2 * HOUR;
    const sold = await call("POST", `/tinkers/${bea}/collector`, { item: NAILS, qty: 60 });
    expect(sold.status).toBe(200);
    expect(sold.body.tinker.crowns).toBe(60 * 8);
    const over = await call("POST", `/tinkers/${bea}/collector`, { item: NAILS, qty: 7 });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/66 .* a week; 6 more/);
    expect((await call("POST", `/tinkers/${bea}/collector`, { item: NAILS, qty: 6 })).status).toBe(200);
    const market = (await call("GET", `/tinkers/${bea}/market`)).body;
    expect(market.collectorLeft[NAILS]).toBe(0);
  });

  it("opens a fresh cap on Monday", async () => {
    clock = Date.UTC(2026, 9, 26, 0, 30);
    const market = (await call("GET", `/tinkers/${bea}/market`)).body;
    expect(market.collectorLeft[NAILS]).toBe(66);
    expect(market.weekEnds).toBe(new Date(Date.UTC(2026, 10, 2)).toISOString());
  });

  it("refuses items no collector buys", async () => {
    expect((await call("POST", `/tinkers/${bea}/collector`, { item: COPPER, qty: 1 })).status).toBe(400);
  });

  it("sells ingredients at the grocer's fixed price, never on credit", async () => {
    const before = (await call("GET", `/tinkers/${bea}`)).body.tinker;
    const bought = await call("POST", `/tinkers/${bea}/grocer`, { item: MEAL, qty: 10 });
    expect(bought.status).toBe(200);
    expect(bought.body.tinker.crowns).toBe(before.crowns - 20);
    expect(held(bought.body.tinker, MEAL)).toBe(10);
    expect((await call("POST", `/tinkers/${bea}/grocer`, { item: MEAL, qty: 1_000_000 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${bea}/grocer`, { item: COPPER, qty: 1 })).status).toBe(400);
  });
});

describe("the trading gate", () => {
  it("refuses a fresh Tinker on a new account, and says why", async () => {
    const id = (await call("POST", "/tinkers", { login: "new@example.com", name: "Nell" }, gated)).body.tinker.id;
    const refused = await call("POST", `/tinkers/${id}/orders`, { item: COPPER, side: "buy", price: 10, qty: 1 }, gated);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/total level 50/);
    const market = (await call("GET", `/tinkers/${id}/market`, undefined, gated)).body;
    expect(market.canTrade).toBe(false);
    expect(market.totalLevel).toBe(16);
  });
});

describe("the order book", () => {
  let sal: number;
  let bea: number;
  let sellOrder: number;

  it("sets up a seller with copper and a buyer with Crowns", async () => {
    sal = await tinkerWith("sal@example.com", "Sal", "action.rustmoor.prospect_copper", 2);
    bea = (await call("GET", "/accounts/bea@example.com/tinkers")).body.tinkers[0].id;
    await call("PUT", `/tinkers/${bea}/queue`, { queue: [{ actionId: "action.rustmoor.scavenge_bent_nails", remaining: 10_000 }] });
    clock += 2 * HOUR;
    await call("POST", `/tinkers/${bea}/collector`, { item: NAILS, qty: 66 });
    const salNow = (await call("GET", `/tinkers/${sal}`)).body.tinker;
    expect(held(salNow, COPPER)).toBeGreaterThanOrEqual(100);
  });

  it("refuses prices off the ladder, bound items and more than is held", async () => {
    const off = await call("POST", `/tinkers/${sal}/orders`, { item: COPPER, side: "sell", price: 53, qty: 1 });
    expect(off.status).toBe(400);
    expect(off.body.error).toMatch(/e\.g\. 52/);
    const bound = await call("POST", `/tinkers/${sal}/orders`, { item: "item.rustmoor.ledger_page_1", side: "sell", price: 10, qty: 1 });
    expect(bound.status).toBe(400);
    expect((await call("POST", `/tinkers/${sal}/orders`, { item: COPPER, side: "sell", price: 10, qty: 1_000_000 })).status).toBe(400);
  });

  it("rests a sell order, holding its copper", async () => {
    const before = held((await call("GET", `/tinkers/${sal}`)).body.tinker, COPPER);
    const placed = await call("POST", `/tinkers/${sal}/orders`, { item: COPPER, side: "sell", price: 10, qty: 50 });
    expect(placed.status).toBe(201);
    expect(held(placed.body.tinker, COPPER)).toBe(before - 50);
    const market = (await call("GET", `/tinkers/${sal}/market`)).body;
    expect(market.orders).toEqual([expect.objectContaining({ item: COPPER, side: "sell", price: 10, qtyOpen: 50 })]);
    sellOrder = market.orders[0].id;
    const book = (await call("GET", `/exchange/${COPPER}`)).body;
    expect(book.asks).toEqual([{ price: 10, qty: 50, orders: 1 }]);
    expect(book.bids).toEqual([]);
  });

  it("fills a crossing buy at once at the resting price, refunding the difference", async () => {
    const before = (await call("GET", `/tinkers/${bea}`)).body.tinker;
    const bought = await call("POST", `/tinkers/${bea}/orders`, { item: COPPER, side: "buy", price: 12, qty: 30 });
    expect(bought.status).toBe(201);
    expect(bought.body.trades).toEqual([expect.objectContaining({ kind: "bought", item: COPPER, qty: 30, price: 10 })]);
    expect(bought.body.tinker.crowns).toBe(before.crowns - 300);
    expect(held(bought.body.tinker, COPPER)).toBe(held(before, COPPER) + 30);
    expect((await call("GET", `/exchange/${COPPER}`)).body.asks).toEqual([{ price: 10, qty: 20, orders: 1 }]);
  });

  it("pays the resting seller, less 2% tax, when the seller is next touched", async () => {
    const crowns = Number((await db.query("SELECT crowns FROM tinkers WHERE id = $1", [sal])).rows[0].crowns);
    const looked = await call("GET", `/tinkers/${sal}`);
    expect(looked.body.trades).toEqual([expect.objectContaining({ kind: "sold", item: COPPER, qty: 30, price: 10, tax: 6 })]);
    expect(looked.body.tinker.crowns).toBe(crowns + 294);
    expect((await call("GET", `/tinkers/${sal}`)).body.trades).toEqual([]);
  });

  it("rests what does not cross, and fills a later seller against it", async () => {
    const posted = await call("POST", `/tinkers/${bea}/orders`, { item: COPPER, side: "buy", price: 8, qty: 10 });
    expect(posted.body.trades).toEqual([]);
    expect((await call("GET", `/exchange/${COPPER}`)).body.bids).toEqual([{ price: 8, qty: 10, orders: 1 }]);
    const sold = await call("POST", `/tinkers/${sal}/orders`, { item: COPPER, side: "sell", price: 7, qty: 4 });
    expect(sold.body.trades).toEqual([expect.objectContaining({ kind: "sold", qty: 4, price: 8, tax: 1 })]);
    const collected = await call("GET", `/tinkers/${bea}`);
    expect(collected.body.trades).toEqual([expect.objectContaining({ kind: "bought", qty: 4, price: 8 })]);
  });

  it("returns a cancelled order's copper", async () => {
    const before = held((await call("GET", `/tinkers/${sal}`)).body.tinker, COPPER);
    const cancelled = await call("DELETE", `/tinkers/${sal}/orders/${sellOrder}`);
    expect(cancelled.status).toBe(200);
    expect(held(cancelled.body.tinker, COPPER)).toBe(before + 20);
    expect((await call("DELETE", `/tinkers/${sal}/orders/${sellOrder}`)).status).toBe(400);
    expect((await call("DELETE", `/tinkers/${bea}/orders/${sellOrder}`)).status).toBe(400);
  });

  it("expires an order after 30 days and returns its Crowns", async () => {
    const before = (await call("GET", `/tinkers/${bea}`)).body.tinker.crowns;
    clock += 31 * DAY;
    const looked = await call("GET", `/tinkers/${bea}`);
    expect(looked.body.trades).toEqual([expect.objectContaining({ kind: "expired", side: "buy", qty: 6, price: 8 })]);
    expect(looked.body.tinker.crowns).toBe(before + 48);
    expect((await call("GET", `/exchange/${COPPER}`)).body.bids).toEqual([]);
  });

  it("lets one Tinker per account trade", async () => {
    const second = (await call("POST", "/tinkers", { login: "sal@example.com", name: "Sal's cousin" })).body.tinker.id;
    const refused = await call("POST", `/tinkers/${second}/orders`, { item: COPPER, side: "buy", price: 1, qty: 1 });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/only Sal trades/);
  });

  it("rebuilds every purse and inventory from the event log alone", async () => {
    for (const id of [sal, bea]) {
      const { rows } = await db.query("SELECT type, payload FROM events WHERE tinker_id = $1 ORDER BY seq", [id]);
      const inventory: Record<string, number> = {};
      let crowns = 0;
      const add = (deltas: Record<string, number>, sign = 1) => {
        for (const [item, qty] of Object.entries(deltas)) inventory[item] = (inventory[item] ?? 0) + sign * qty;
      };
      for (const { type, payload } of rows) {
        if (type === "tinker_created") {
          for (const stack of payload.inventory) add({ [stack.item]: stack.qty });
          crowns += payload.crowns;
        } else if (type === "action_completed" || type === "monster_killed" || type === "boss_attempted") {
          add(payload.consumed, -1);
          add(payload.produced);
          crowns += payload.crowns ?? 0;
        } else if ("items" in payload && "crowns" in payload) {
          add(payload.items);
          crowns += payload.crowns;
        }
      }
      for (const item of Object.keys(inventory)) if (inventory[item] === 0) delete inventory[item];
      const projected: Record<string, number> = {};
      for (const row of (await db.query("SELECT item, qty FROM inventory WHERE tinker_id = $1", [id])).rows) {
        projected[row.item] = (projected[row.item] ?? 0) + Number(row.qty);
      }
      expect(projected).toEqual(inventory);
      expect(Number((await db.query("SELECT crowns FROM tinkers WHERE id = $1", [id])).rows[0].crowns)).toBe(crowns);
    }
  });
});
