// The Boiler reminder (work order 039) against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations. A stand-in Mailer keeps what
// would have been sent; as in admin.test.ts, a stand-in Auth takes Cognito's place.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { Unauthorized, type Auth } from "../src/auth.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";
import { reminderMail, sendReminders, type Mail, type Mailer } from "../src/reminders.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const HOUR = 3_600_000;
const SITE = "https://example.test";
const auth: Auth = {
  async verify(token) {
    const [kind, login] = token.split(":", 2);
    if (kind !== "good") throw new Unauthorized("sign in again");
    return { login: `cognito:${login}`, admin: false, email: login === "noemail" ? null : `${login}@example.com`, provider: "Google" };
  },
};
const app = buildApi({ db, content, auth });
let sent: Mail[] = [];
const mailer: Mailer = { ready: async () => true, send: async (mail) => void sent.push(mail) };
const run = (at = Date.now()) => sendReminders(db, content.reminder, mailer, SITE, "/api", at, at);

async function call(method: "GET" | "PUT" | "POST", url: string, token: string, payload?: object) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

/** A Tinker whose owner left 13 hours ago and whose Boiler ran out an hour ago. */
async function gone(login: string, ranOutHoursAgo = 1): Promise<number> {
  const id = (await call("POST", "/tinkers", `good:${login}`, { login: `cognito:${login}`, name: login })).body.tinker.id;
  await db.query("UPDATE tinkers SET steam_until = $2 WHERE id = $1", [id, new Date(Date.now() - ranOutHoursAgo * HOUR)]);
  await db.query("UPDATE accounts SET last_seen_at = $2 WHERE login = $1", [`cognito:${login}`, new Date(Date.now() - 13 * HOUR)]);
  return id;
}

const tokenOf = async (login: string) => (await db.query("SELECT reminder_token FROM accounts WHERE login = $1", [`cognito:${login}`])).rows[0].reminder_token;

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

beforeEach(async () => {
  sent = [];
  await db.query("UPDATE tinkers SET reminded_steam = steam_until");
});

describe("the Boiler reminder", () => {
  it("emails once when a Boiler runs out, and not again while the player stays away", async () => {
    await gone("ada");
    expect(await run()).toBe(1);
    expect(sent[0]).toMatchObject({ to: "ada@example.com" });
    expect(await run()).toBe(0);
  });

  it("leaves out old Boilers, so turning this on does not write to everyone who ever played", async () => {
    await gone("old", 30);
    expect(await run()).toBe(0);
  });

  it("leaves out a Boiler still running, anyone just seen, the banned and the opted out", async () => {
    const running = await gone("cal");
    await db.query("UPDATE tinkers SET steam_until = $2 WHERE id = $1", [running, new Date(Date.now() + HOUR)]);
    await gone("dee");
    await db.query("UPDATE accounts SET last_seen_at = now() WHERE login = 'cognito:dee'");
    await gone("eve");
    await db.query("UPDATE accounts SET ban = 'full', banned_at = now() WHERE login = 'cognito:eve'");
    await gone("fay");
    await db.query("UPDATE accounts SET reminders = false WHERE login = 'cognito:fay'");
    expect(await run()).toBe(0);
  });

  it("writes to an account at most once every two days, however often its Boiler runs out", async () => {
    const id = await gone("kit");
    await run();
    await db.query("UPDATE tinkers SET steam_until = $2 WHERE id = $1", [id, new Date(Date.now() - HOUR / 2)]);
    expect(await run()).toBe(0);
    await db.query("UPDATE accounts SET reminded_at = now() - interval '49 hours' WHERE login = 'cognito:kit'");
    expect(await run()).toBe(1);
  });

  it("holds an older account's reminders until it has seen the notice in the game", async () => {
    await gone("lou");
    await db.query("UPDATE accounts SET reminders_notice = true WHERE login = 'cognito:lou'");
    expect(await run()).toBe(0);
    expect((await call("GET", "/me", "good:lou")).body.reminderNotice).toBe(true);
    await call("POST", "/me/reminders/notice", "good:lou");
    expect((await call("GET", "/me", "good:lou")).body.reminderNotice).toBe(false);
    await db.query("UPDATE accounts SET last_seen_at = now() - interval '1 hour' WHERE login = 'cognito:lou'");
    expect(await run()).toBe(1);
  });

  it("does not try a failed send again", async () => {
    await gone("gil");
    let tries = 0;
    const failing: Mailer = { ready: async () => true, send: async () => void tries++ && Promise.reject(new Error("no")) };
    const go = () => sendReminders(db, content.reminder, failing, SITE, "/api", Date.now(), Date.now());
    await go();
    await go();
    expect(tries).toBe(1);
  });

  it("puts the opt-out in the body of both forms and in the headers' link", async () => {
    const mail = reminderMail(content.reminder, "a@example.com", "<Ada>", "t0k3n", SITE, "/api");
    expect(mail.unsubscribeUrl).toBe(`${SITE}/api/reminders/off?token=t0k3n`);
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(mail.unsubscribeUrl);
      expect(body).toContain(content.reminder.opt_out_link);
    }
    expect(mail.html).not.toContain("<Ada>");
  });

  it("turns reminders off from the emailed link, with no sign-in", async () => {
    await gone("hal");
    const response = await app.inject({ method: "GET", url: `/reminders/off?token=${await tokenOf("hal")}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Reminders are off");
    expect(await run()).toBe(0);
  });

  it("takes a mail client's one-click POST", async () => {
    await gone("ivy");
    const response = await app.inject({
      method: "POST",
      url: `/reminders/off?token=${await tokenOf("ivy")}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(response.statusCode).toBe(200);
    expect(await run()).toBe(0);
  });

  it("says plainly when a link does not work, and turns nobody off", async () => {
    expect((await app.inject({ method: "GET", url: "/reminders/off?token=00000000-0000-0000-0000-000000000000" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/reminders/off?token=x' OR 1=1" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/reminders/off" })).statusCode).toBe(404);
  });

  it("lets a player switch reminders in the game, and shows no switch without an email", async () => {
    expect((await call("GET", "/me", "good:jan")).body.reminders).toBe(true);
    await call("PUT", "/me/reminders", "good:jan", { on: false });
    expect((await call("GET", "/me", "good:jan")).body.reminders).toBe(false);
    expect((await call("GET", "/me", "good:noemail")).body.reminders).toBeNull();
    expect((await call("PUT", "/me/reminders", "good:jan", { on: "yes" })).status).toBe(400);
  });
});
