// Buying Cog Crates through Stripe Checkout (GDD section 8, Payments path),
// against a real PostgreSQL database, long_boil_test. Webhooks are signed
// with Stripe's own test helper, so signature checks run for real; only the
// call that opens a Checkout Session is replaced, since it needs Stripe.

import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { Unauthorized } from "../src/auth.js";
import { connect, migrate } from "../src/db.js";
import { stripePayments, type CheckoutRequest } from "../src/payments.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
const CRATE = "item.global.cog_crate";
const WEBHOOK_SECRET = "whsec_test_long_boil";
let clock = Date.UTC(2026, 9, 27, 8, 0, 0);

const opened: CheckoutRequest[] = [];
const payments = {
  ...stripePayments({ apiKey: "rk_test_long_boil", webhookSecret: WEBHOOK_SECRET }),
  checkout: async (request: CheckoutRequest) => {
    opened.push(request);
    return "https://checkout.stripe.com/c/pay/cs_test_fake";
  },
};
const api = buildApi({ db, content, now: () => clock, payments, siteUrl: "https://thelongboil.com" });
const without = buildApi({ db, content, now: () => clock });
// As deployed: behind sign-in, under /api. Stripe has no token; its signature is its sign-in.
const signedIn = buildApi({
  db,
  content,
  now: () => clock,
  payments,
  prefix: "/api",
  auth: {
    async verify() {
      throw new Unauthorized("sign in again");
    },
  },
});
const signer = new Stripe("rk_test_long_boil");

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await api.close();
  await without.close();
  await signedIn.close();
  await db.end();
});

async function call(method: "GET" | "POST", url: string, payload?: object, via = api) {
  const response = await via.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

async function tinker(login: string) {
  return (await call("POST", "/tinkers", { login, name: "Payer" })).body.tinker.id as number;
}

function event(type: string, session: { id: string; payment_status: string; metadata: Record<string, string> }) {
  return JSON.stringify({ id: `evt_${session.id}_${type}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
}

/** Posts a webhook as Stripe would, signed with `secret`. */
async function webhook(payload: string, secret = WEBHOOK_SECRET, via = api, url = "/stripe/webhook") {
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  const response = await via.inject({
    method: "POST",
    url,
    payload,
    headers: { "content-type": "application/json", "stripe-signature": signature },
  });
  return { status: response.statusCode, body: response.json() };
}

describe("buying Cog Crates", () => {
  it("tells the client whether crates are sold for money, and in test mode", async () => {
    expect((await call("GET", "/content")).body.payments).toEqual({ testMode: true });
    expect((await call("GET", "/content", undefined, without)).body.payments).toBeNull();
  });

  it("refuses a live key unless live payments are asked for", () => {
    expect(() => stripePayments({ apiKey: "rk_live_x", webhookSecret: WEBHOOK_SECRET })).toThrow(/test mode/);
    expect(stripePayments({ apiKey: "rk_live_x", webhookSecret: WEBHOOK_SECRET, allowLive: true }).testMode).toBe(false);
  });

  it("opens a checkout at the shop's price, returning the page to send the player to", async () => {
    const id = await tinker("pay-checkout@example.com");
    const { status, body } = await call("POST", `/tinkers/${id}/shop/checkout`, { crates: 2 });
    expect(status).toBe(200);
    expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_test_fake");
    expect(opened.at(-1)).toEqual({ tinkerId: id, crates: 2, priceCents: 499, cogsPerCrate: 10, lockHours: 72, siteUrl: "https://thelongboil.com" });
    expect((await call("POST", `/tinkers/${id}/shop/checkout`, { crates: 11 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/shop/checkout`, { crates: 1 }, without)).status).toBe(400);
  });

  it("queues a paid session's crates, locked for 72 hours, once however often it is reported", async () => {
    const id = await tinker("pay-paid@example.com");
    const paid = event("checkout.session.completed", { id: "cs_test_paid", payment_status: "paid", metadata: { tinkerId: String(id), crates: "3" } });
    expect(await webhook(paid)).toEqual({ status: 200, body: { received: true } });
    expect(await webhook(paid)).toEqual({ status: 200, body: { received: true } });
    const shop = (await call("GET", `/tinkers/${id}/shop`)).body.shop;
    expect(shop.arriving).toEqual([{ qty: 3, unlocksAt: new Date(clock + 72 * HOUR).toISOString() }]);
    expect(shop.crates).toBe(0);
    clock += 72 * HOUR;
    expect((await call("GET", `/tinkers/${id}`)).body.tinker.inventory).toContainEqual({ item: CRATE, qty: 3, bound: false });
  });

  it("waits for a delayed payment to succeed", async () => {
    const id = await tinker("pay-delayed@example.com");
    const session = { id: "cs_test_delayed", metadata: { tinkerId: String(id), crates: "1" } };
    await webhook(event("checkout.session.completed", { ...session, payment_status: "unpaid" }));
    expect((await call("GET", `/tinkers/${id}/shop`)).body.shop.arriving).toEqual([]);
    await webhook(event("checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" }));
    expect((await call("GET", `/tinkers/${id}/shop`)).body.shop.arriving).toHaveLength(1);
  });

  it("refuses a webhook that Stripe did not sign", async () => {
    const id = await tinker("pay-forged@example.com");
    const forged = event("checkout.session.completed", { id: "cs_test_forged", payment_status: "paid", metadata: { tinkerId: String(id), crates: "10" } });
    expect((await webhook(forged, "whsec_someone_else")).status).toBe(400);
    const unsigned = await api.inject({ method: "POST", url: "/stripe/webhook", payload: forged, headers: { "content-type": "application/json" } });
    expect(unsigned.statusCode).toBe(400);
    expect((await call("GET", `/tinkers/${id}/shop`)).body.shop.arriving).toEqual([]);
  });

  it("takes Stripe's webhook without a sign-in token behind sign-in, and nothing else", async () => {
    const id = await tinker("pay-deployed@example.com");
    const paid = event("checkout.session.completed", { id: "cs_test_deployed", payment_status: "paid", metadata: { tinkerId: String(id), crates: "1" } });
    expect((await webhook(paid, WEBHOOK_SECRET, signedIn, "/api/stripe/webhook")).status).toBe(200);
    expect((await signedIn.inject({ method: "POST", url: `/api/tinkers/${id}/shop/checkout`, payload: { crates: 1 } })).statusCode).toBe(401);
    expect((await call("GET", `/tinkers/${id}/shop`)).body.shop.arriving).toHaveLength(1);
  });

  it("ignores events it does not act on", async () => {
    const other = JSON.stringify({ id: "evt_other", object: "event", type: "customer.created", data: { object: { object: "customer", id: "cus_1" } } });
    expect(await webhook(other)).toEqual({ status: 200, body: { received: true } });
  });
});
