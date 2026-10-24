// Work Orders through the API (build plan milestone 9; work order 022),
// against a real PostgreSQL database, long_boil_test, rebuilt from the
// migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
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

async function call(method: "GET" | "POST" | "DELETE", url: string, payload?: object, via = open) {
  const response = await via.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

const INGOTS_AND_RATIONS = "wo.rustmoor.stokers.ingots_and_rations";
const BRASS_INGOTS = "wo.rustmoor.board.brass_ingots";

/** Puts one offer on a Tinker's desk, so a test does not depend on the draw. */
async function lay(id: number, choices: string[]) {
  const desk = { offers: [{ id: 1, arrivedAt: clock, choices, chosen: null }], nextAt: clock + 8 * HOUR, serial: 1 };
  await db.query("UPDATE tinkers SET work_orders = $2 WHERE id = $1", [id, JSON.stringify(desk)]);
}

/** Test setup: unbound goods straight into the inventory. */
async function give(id: number, item: string, qty: number) {
  await db.query(
    `INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, false, $3)
     ON CONFLICT (tinker_id, item, bound) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
    [id, item, qty],
  );
}

describe("Work Orders", () => {
  it("keeps the desk shut behind the trading gate", async () => {
    const id = (await call("POST", "/tinkers", { login: "wo-new@example.com", name: "New" })).body.tinker.id;
    const { status, body } = await call("GET", `/tinkers/${id}/work-orders`, undefined, gated);
    expect(status).toBe(200);
    expect(body.desk.locked).toMatch(/total level/);
    expect(body.desk.offers).toEqual([]);
  });

  it("issues the first order when the gate opens, with two seals to choose from", async () => {
    const id = (await call("POST", "/tinkers", { login: "wo-open@example.com", name: "Opal" })).body.tinker.id;
    const { body } = await call("GET", `/tinkers/${id}/work-orders`);
    expect(body.desk.locked).toBeNull();
    expect(body.desk.offers).toHaveLength(1);
    const choices = body.desk.offers[0].choices;
    expect(choices).toHaveLength(2);
    expect(choices[0].seal).not.toBe(choices[1].seal);
    expect(choices[0].request.length).toBeGreaterThan(0);
    expect(body.desk.favourCap).toBe(3);
    expect(body.tinker.workOrders).toBe(1);

    clock += 8 * HOUR;
    expect((await call("GET", `/tinkers/${id}/work-orders`)).body.desk.offers).toHaveLength(2);
  });

  it("refuses the bound starter Rations, then pays for unbound goods and raises Favour", async () => {
    const id = (await call("POST", "/tinkers", { login: "wo-stoker@example.com", name: "Stoke" })).body.tinker.id;
    await lay(id, [INGOTS_AND_RATIONS, BRASS_INGOTS]);
    expect((await call("POST", `/tinkers/${id}/work-orders/1/turn-in`)).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/work-orders/1/choose`, { order: "wo.rustmoor.gaugers.rat_scrap" })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/work-orders/1/choose`, { order: INGOTS_AND_RATIONS })).status).toBe(200);

    // The start holds 50 unbound Brass Ingots and 342 bound Rations: the Rations do not count.
    const refused = await call("POST", `/tinkers/${id}/work-orders/1/turn-in`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/still needed: 50 item\.rustmoor\.rustmoor_ration/);

    await give(id, "item.rustmoor.rustmoor_ration", 50);
    const done = await call("POST", `/tinkers/${id}/work-orders/1/turn-in`);
    expect(done.status).toBe(200);
    const order = content.rules.workOrders.get(INGOTS_AND_RATIONS)!;
    expect(done.body.tinker.crowns).toBe(order.reward.crowns);
    expect(done.body.desk.offers).toEqual([]);
    expect(done.body.desk.favour["favour.stokers"]).toBe(1);
    const stacks = done.body.tinker.inventory as { item: string; qty: number; bound: boolean }[];
    expect(stacks.find((stack) => stack.item === "item.rustmoor.rustmoor_ration" && stack.bound)?.qty).toBe(342);
    expect(stacks.find((stack) => stack.item === "item.rustmoor.rustmoor_ration" && !stack.bound)).toBeUndefined();
    expect(stacks.find((stack) => stack.item === "item.rustmoor.brass_ingot" && !stack.bound)?.qty).toBe(25);
    const logged = await db.query("SELECT payload FROM events WHERE tinker_id = $1 AND type = 'work_order_completed'", [id]);
    expect(logged.rows[0].payload.crowns).toBe(order.reward.crowns);
  });

  it("stops Favour at 3 but still pays", async () => {
    const id = (await call("POST", "/tinkers", { login: "wo-board@example.com", name: "Bord" })).body.tinker.id;
    await db.query("INSERT INTO qualities (tinker_id, name, value) VALUES ($1, 'favour.board', 3)", [id]);
    await lay(id, [BRASS_INGOTS, INGOTS_AND_RATIONS]);
    await call("POST", `/tinkers/${id}/work-orders/1/choose`, { order: BRASS_INGOTS });
    const done = await call("POST", `/tinkers/${id}/work-orders/1/turn-in`);
    expect(done.status).toBe(200);
    expect(done.body.desk.favour["favour.board"]).toBe(3);
    expect(done.body.tinker.crowns).toBe(content.rules.workOrders.get(BRASS_INGOTS)!.reward.crowns);
  });

  it("discards for free", async () => {
    const id = (await call("POST", "/tinkers", { login: "wo-toss@example.com", name: "Toss" })).body.tinker.id;
    await lay(id, [BRASS_INGOTS, INGOTS_AND_RATIONS]);
    const tossed = await call("DELETE", `/tinkers/${id}/work-orders/1`);
    expect(tossed.status).toBe(200);
    expect(tossed.body.desk.offers).toEqual([]);
    expect(tossed.body.tinker.crowns).toBe(0);
    expect((await call("DELETE", `/tinkers/${id}/work-orders/1`)).status).toBe(400);
  });
});
