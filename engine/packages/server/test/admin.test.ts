// The admin console (build plan milestone 14) against a real PostgreSQL
// database, long_boil_test, rebuilt from the migrations. As in auth.test.ts, a
// stand-in Auth takes Cognito's place: "good:<login>" speaks for that login
// with a Google email, and "admin:<login>" for an admin.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { overview } from "../src/admin.js";
import { buildApi } from "../src/api.js";
import { Unauthorized, whoIs, type Auth } from "../src/auth.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";
import { grantCrates } from "../src/shop.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
let clock = Date.UTC(2026, 10, 2, 8, 0, 0);
const auth: Auth = {
  async verify(token) {
    const [kind, login] = token.split(":", 2);
    if (kind !== "good" && kind !== "admin") throw new Unauthorized("sign in again");
    return { login: `cognito:${login}`, admin: kind === "admin", email: `${login}@example.com`, provider: "Google" };
  },
};
const logged: string[] = [];
const app = buildApi({ db, content, now: () => clock, auth, logRequest: (line) => logged.push(line) });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, token: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

async function accountOf(login: string): Promise<number> {
  return Number((await db.query("SELECT id FROM accounts WHERE login = $1", [`cognito:${login}`])).rows[0].id);
}

describe("the admin console", () => {
  let ada: number;
  let bea: number;

  it("reads the email and provider from a token's claims", () => {
    expect(whoIs({ email: "Ada@Example.com", identities: [{ providerName: "Google" }] })).toEqual({ email: "ada@example.com", provider: "Google" });
    expect(whoIs({ email: "bea@example.com" })).toEqual({ email: "bea@example.com", provider: "Cognito" });
    expect(whoIs({})).toEqual({ email: null, provider: null });
  });

  it("records who signed in and when, on any request", async () => {
    ada = (await call("POST", "/tinkers", "good:ada", { login: "cognito:ada", name: "Ada" })).body.tinker.id;
    bea = (await call("POST", "/tinkers", "good:bea", { login: "cognito:bea", name: "Bea" })).body.tinker.id;
    const row = (await db.query("SELECT email, provider, last_seen_at FROM accounts WHERE login = 'cognito:ada'")).rows[0];
    expect(row.email).toBe("ada@example.com");
    expect(row.provider).toBe("Google");
    expect(row.last_seen_at).not.toBeNull();
    expect((await call("GET", "/me", "good:ada")).body).toEqual({ login: "cognito:ada", admin: false, ban: null, reminders: true, reminderNotice: false });
  });

  it("logs each request as one line: route pattern, status, time and login, never the URL", async () => {
    logged.length = 0;
    await call("GET", `/tinkers/${ada}?token=secret`, "good:ada");
    await call("GET", "/admin/overview", "good:ada");
    const [read, refused] = logged.map((line) => JSON.parse(line));
    expect(read).toMatchObject({ request: "GET /tinkers/:id", status: 200, login: "cognito:ada", tinker: ada, phone: false });
    expect(read.ms).toBeGreaterThanOrEqual(0);
    expect(refused).toMatchObject({ request: "GET /admin/overview", status: 403, error: "admins only" });
    expect(logged.join("\n")).not.toContain("secret");
  });

  it("is for admins only", async () => {
    expect((await call("GET", "/admin/overview", "good:ada")).status).toBe(403);
    expect((await call("GET", "/admin/players", "good:ada")).status).toBe(403);
    expect((await call("GET", "/admin/overview", "admin:jeremy")).status).toBe(200);
  });

  it("lists players with their Tinkers and what they spent, and finds them by email or name", async () => {
    await grantCrates(db, content, ada, 2, clock, { source: "stripe", reference: "cs_test_ada" });
    const { players } = (await call("GET", "/admin/players", "admin:jeremy")).body;
    const row = players.find((player: { email: string }) => player.email === "ada@example.com");
    expect(row.spentCents).toBe(2 * content.rules.shop!.crate.priceCents);
    expect(row.tinkers).toEqual([expect.objectContaining({ id: ada, name: "Ada", act1: 0 })]);
    expect((await call("GET", "/admin/players?q=bea", "admin:jeremy")).body.players.map((player: { email: string }) => player.email)).toEqual([
      "bea@example.com",
    ]);
  });

  it("sums revenue, active players and the story funnel", async () => {
    const view = (await call("GET", "/admin/overview", "admin:jeremy")).body;
    expect(view.accounts).toBeGreaterThanOrEqual(3);
    expect(view.revenue).toEqual({ cents: 2 * content.rules.shop!.crate.priceCents, crates: 2, buyers: 1, refunded: 0 });
    expect(view.newAccounts).toHaveLength(14);
    expect(view.funnel[0]).toEqual({ label: "Started a Tinker", tinkers: 2 });
    expect((await call("GET", "/admin/purchases", "admin:jeremy")).body.purchases).toEqual([
      expect.objectContaining({ tinkerId: ada, email: "ada@example.com", crates: 2, refunded: false }),
    ]);
  });

  it("counts who comes back on the wall clock, leaving out admins and anyone too new", async () => {
    const hours = (n: number) => new Date(Date.now() - n * 3_600_000);
    const visit = async (tinker: number, seq: number, at: Date) =>
      db.query("INSERT INTO events (tinker_id, seq, type, at, payload, content_version, recorded_at) VALUES ($1, $2, 'check_in_counted', $3, '{}', 'test', $3)", [
        tinker,
        seq,
        at,
      ]);
    await db.query("DELETE FROM events WHERE type = 'check_in_counted'");
    // Ada came back 14 hours later; Bea came once, 80 hours ago; Jeremy's own Tinker would otherwise be a third.
    await visit(ada, 9001, hours(80));
    await visit(ada, 9002, hours(66));
    await visit(bea, 9001, hours(80));
    const jeremy = (await call("POST", "/tinkers", "admin:jeremy", { login: "cognito:jeremy", name: "Jem" })).body.tinker.id;
    await visit(jeremy, 9001, hours(80));
    await visit(jeremy, 9002, hours(1));
    const fresh = (await call("POST", "/tinkers", "good:cleo", { login: "cognito:cleo", name: "Cleo" })).body.tinker.id;
    await visit(fresh, 9001, hours(2));
    const adminEmails = ["Jeremy@example.com "];
    const { returns } = await overview(db, content, 0, adminEmails);
    expect(returns).toEqual([
      { label: "Came back at all", back: 1, of: 3, tooNew: 0 },
      { label: "After 12 hours", back: 1, of: 2, tooNew: 1 },
      { label: "After 3 days", back: 0, of: 2, tooNew: 1 },
      { label: "After 7 days", back: 0, of: 0, tooNew: 3 },
    ]);
    const { players } = (await call("GET", "/admin/players?q=ada", "admin:jeremy")).body;
    expect(players[0].tinkers[0]).toMatchObject({ visits: 2, stage: "sitting 1" });
  });

  it("shows one player's events, purchases and chat", async () => {
    clock += 10_000;
    await call("POST", `/tinkers/${ada}/chat`, "good:ada", { text: "Hello, Kettleport" });
    const detail = (await call("GET", `/admin/players/${await accountOf("ada")}`, "admin:jeremy")).body;
    expect(detail.email).toBe("ada@example.com");
    expect(detail.purchases).toHaveLength(1);
    expect(detail.chat).toEqual([expect.objectContaining({ text: "Hello, Kettleport", removed: false })]);
    expect(detail.events.length).toBeGreaterThan(0);
  });

  it("removes one chat message from everyone's view", async () => {
    const message = (await call("GET", `/admin/players/${await accountOf("ada")}`, "admin:jeremy")).body.chat[0].id;
    expect((await call("DELETE", `/admin/chat/${message}`, "admin:jeremy")).status).toBe(200);
    expect((await call("GET", `/tinkers/${bea}/chat`, "good:bea")).body.messages).toEqual([]);
  });

  it("chat-bans an account: it plays on, cannot post, and its messages are hidden", async () => {
    clock += 10_000;
    await call("POST", `/tinkers/${bea}/chat`, "good:bea", { text: "Rats for sale" });
    const banned = await call("PUT", `/admin/players/${await accountOf("bea")}/ban`, "admin:jeremy", { kind: "chat", reason: "spam" });
    expect(banned.body.ban).toMatchObject({ kind: "chat", reason: "spam" });
    expect((await call("GET", `/tinkers/${bea}`, "good:bea")).status).toBe(200);
    clock += 10_000;
    expect((await call("POST", `/tinkers/${bea}/chat`, "good:bea", { text: "Again" })).status).toBe(403);
    expect((await call("GET", `/tinkers/${ada}/chat`, "good:ada")).body.messages).toEqual([]);
  });

  it("locks a fully banned account out, says why on /me, and cancels its open orders", async () => {
    // A new account cannot trade yet (the trading gate), so the open buy order is set up directly, its 50 Crowns held.
    await db.query("UPDATE tinkers SET crowns = 950 WHERE id = $1", [bea]);
    await db.query(
      `INSERT INTO exchange_orders (tinker_id, item, side, price, qty_total, qty_open, placed_at, expires_at)
       VALUES ($1, 'item.rustmoor.rat_scrap', 'buy', 10, 5, 5, $2, $3)`,
      [bea, new Date(clock), new Date(clock + 30 * 86_400_000)],
    );
    await call("PUT", `/admin/players/${await accountOf("bea")}/ban`, "admin:jeremy", { kind: "full", reason: "cheating" });
    expect((await call("GET", `/tinkers/${bea}`, "good:bea")).body).toEqual({ error: "this account is suspended: cheating" });
    expect((await call("GET", "/me", "good:bea")).body.ban).toMatchObject({ kind: "full", reason: "cheating" });
    const orders = (await db.query("SELECT closed_reason FROM exchange_orders WHERE tinker_id = $1", [bea])).rows;
    expect(orders.map((order) => order.closed_reason)).toEqual(["cancelled"]);
    expect(Number((await db.query("SELECT crowns FROM tinkers WHERE id = $1", [bea])).rows[0].crowns)).toBe(1000);
  });

  it("lifts a ban and restores everything", async () => {
    await call("DELETE", `/admin/players/${await accountOf("bea")}/ban`, "admin:jeremy");
    expect((await call("GET", `/tinkers/${bea}`, "good:bea")).status).toBe(200);
    expect((await call("GET", `/tinkers/${ada}/chat`, "good:ada")).body.messages.map((message: { text: string }) => message.text)).toEqual([
      "Rats for sale",
    ]);
  });
});
