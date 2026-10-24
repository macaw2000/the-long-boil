// Real sign-in (build plan milestone 11) against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations. A stand-in Auth takes the
// place of Cognito: the token "good:<login>" speaks for that login.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { Unauthorized, type Auth } from "../src/auth.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const auth: Auth = {
  async verify(token) {
    if (!token.startsWith("good:")) throw new Unauthorized("sign in again");
    return token.slice("good:".length);
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
    expect((await call("GET", "/api/me", "cognito:ada")).body).toEqual({ login: "cognito:ada" });
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

describe("the dev login", () => {
  it("still trusts the login it is given, and says no one is signed in", async () => {
    const dev = buildApi({ db, content, now: () => clock });
    const me = await dev.inject({ method: "GET", url: "/me" });
    expect(me.json()).toEqual({ login: null });
    const made = await dev.inject({ method: "POST", url: "/tinkers", payload: { login: "dev-cara", name: "Cara" } });
    expect(made.statusCode).toBe(201);
    await dev.close();
  });
});
