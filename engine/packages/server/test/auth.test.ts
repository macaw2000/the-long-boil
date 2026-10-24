// Real sign-in (build plan milestone 11) against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations. A stand-in Auth takes the
// place of Cognito: the token "good:<login>" speaks for that login, and
// "admin:<login>" for an admin.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi, devClockInDatabase } from "../src/api.js";
import { Unauthorized, isAdmin, type Auth } from "../src/auth.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const auth: Auth = {
  async verify(token) {
    if (token.startsWith("good:")) return { login: token.slice("good:".length), admin: false };
    if (token.startsWith("admin:")) return { login: token.slice("admin:".length), admin: true };
    throw new Unauthorized("sign in again");
  },
};
const app = buildApi({ db, content, now: () => clock, auth, prefix: "/api" });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT", url: string, login?: string, payload?: object) {
  const response = await app.inject({
    method,
    url,
    ...(login ? { headers: { authorization: `Bearer good:${login}` } } : {}),
    ...(payload ? { payload } : {}),
  });
  return { status: response.statusCode, body: response.json() };
}

describe("signing in with Cognito", () => {
  let ada: number;
  let bea: number;

  it("answers /health and /content without a token, under /api as well", async () => {
    expect((await call("GET", "/api/health")).body).toEqual({ ok: true });
    expect((await call("GET", "/health")).status).toBe(200);
    expect((await call("GET", "/api/content")).body.version).toBe(content.rules.version);
  });

  it("refuses every other route without a good token", async () => {
    expect((await call("GET", "/api/me")).status).toBe(401);
    const forged = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: "Bearer forged" } });
    expect(forged.statusCode).toBe(401);
    expect((await call("GET", "/api/me", "cognito:ada")).body).toEqual({ login: "cognito:ada", admin: false });
  });

  it("makes Tinkers only on the token's own account", async () => {
    const made = await call("POST", "/api/tinkers", "cognito:ada", { login: "cognito:ada", name: "Ada" });
    expect(made.status).toBe(201);
    ada = made.body.tinker.id;
    bea = (await call("POST", "/api/tinkers", "cognito:bea", { login: "cognito:bea", name: "Bea" })).body.tinker.id;

    expect((await call("POST", "/api/tinkers", "cognito:ada", { login: "cognito:bea", name: "Imposter" })).status).toBe(403);
    expect((await call("GET", "/api/accounts/cognito:bea/tinkers", "cognito:ada")).status).toBe(403);
    expect((await call("GET", "/api/accounts/cognito:ada/tinkers", "cognito:ada")).body.tinkers).toEqual([{ id: ada, name: "Ada" }]);
  });

  it("opens only the token's own Tinkers", async () => {
    expect((await call("GET", `/api/tinkers/${ada}`, "cognito:ada")).status).toBe(200);
    expect((await call("GET", `/api/tinkers/${bea}`, "cognito:ada")).status).toBe(403);
    expect((await call("POST", `/api/tinkers/${bea}/check-in`, "cognito:ada")).status).toBe(403);
    expect((await call("POST", `/api/tinkers/${bea}/chat`, "cognito:ada", { text: "hello" })).status).toBe(403);
    // Naming another Tinker as the other party is still allowed: that is how whispers and invites work.
    expect((await call("PUT", `/api/tinkers/${ada}/mutes/${bea}`, "cognito:ada")).status).toBe(200);
  });

  it("opens the live connection only with the owner's token in the query", async () => {
    await expect(app.injectWS(`/api/live/${ada}`)).rejects.toThrow();
    await expect(app.injectWS(`/api/live/${bea}?token=good:cognito:ada`)).rejects.toThrow();

    const socket = await app.injectWS(`/api/live/${ada}?token=good:cognito:ada`);
    const first = await new Promise<string>((resolve) => socket.once("message", (data: Buffer) => resolve(data.toString())));
    expect(JSON.parse(first)).toEqual({ type: "changed" });
    socket.terminate();
  });
});

describe("admins", () => {
  const google = (email: string, verified: unknown = true) => ({
    email,
    email_verified: verified,
    identities: [{ providerName: "Google" }],
  });
  const admins = new Set(["macaw2000@gmail.com"]);

  it("are verified Google accounts on the list, and no one else", () => {
    expect(isAdmin(google("macaw2000@gmail.com"), admins)).toBe(true);
    expect(isAdmin(google("Macaw2000@Gmail.com", "true"), admins)).toBe(true);
    expect(isAdmin(google("macaw2000@gmail.com", false), admins)).toBe(false);
    expect(isAdmin(google("someone@gmail.com"), admins)).toBe(false);
    // The same email signed in through Discord is a different account and not an admin.
    expect(isAdmin({ ...google("macaw2000@gmail.com"), identities: [{ providerName: "Discord" }] }, admins)).toBe(false);
    expect(isAdmin({ email: "macaw2000@gmail.com", email_verified: true }, admins)).toBe(false);
  });

  it("alone may skip the dev clock, which the database keeps", async () => {
    const dev = await devClockInDatabase(db);
    const devApp = buildApi({ db, content, now: dev.now, auth, prefix: "/api", devClock: dev.clock });
    const skip = (token: string) =>
      devApp.inject({ method: "POST", url: "/api/dev/skip", headers: { authorization: `Bearer ${token}` }, payload: { hours: 2 } });
    expect((await skip("good:cognito:ada")).statusCode).toBe(403);
    const skipped = await skip("admin:cognito:jeremy");
    expect(skipped.statusCode).toBe(200);
    expect(skipped.json().offsetMs).toBe(2 * 3_600_000);
    expect((await skip("admin:cognito:jeremy")).json().offsetMs).toBe(4 * 3_600_000);
    // A new server, as after a deploy, picks up where the last left off.
    expect((await devClockInDatabase(db)).clock.offset()).toBe(4 * 3_600_000);
    await devApp.close();
  });

  it("skip the trading gate; everyone else keeps it", async () => {
    const sell = { item: "item.rustmoor.brass_ingot", side: "sell", price: 10, qty: 1 };
    const cara = (await call("POST", "/api/tinkers", "cognito:cara", { login: "cognito:cara", name: "Cara" })).body.tinker.id;
    expect((await call("POST", `/api/tinkers/${cara}/orders`, "cognito:cara", sell)).status).toBe(403);
    const admin = await app.inject({
      method: "POST",
      url: "/api/tinkers",
      headers: { authorization: "Bearer admin:cognito:jeremy" },
      payload: { login: "cognito:jeremy", name: "Jeremy" },
    });
    const placed = await app.inject({
      method: "POST",
      url: `/api/tinkers/${admin.json().tinker.id}/orders`,
      headers: { authorization: "Bearer admin:cognito:jeremy" },
      payload: sell,
    });
    expect(placed.statusCode).toBe(201);
  });
});

describe("the dev login", () => {
  it("still trusts the login it is given, and says no one is signed in", async () => {
    const dev = buildApi({ db, content, now: () => clock });
    const me = await dev.inject({ method: "GET", url: "/me" });
    expect(me.json()).toEqual({ login: null, admin: true });
    const made = await dev.inject({ method: "POST", url: "/tinkers", payload: { login: "dev-cara", name: "Cara" } });
    expect(made.statusCode).toBe(201);
    await dev.close();
  });
});
