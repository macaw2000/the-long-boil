// The story engine through the API, against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations: the GDD's first session from
// Pip's bill to the rat nests.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const app = buildApi({ db, content, now: () => clock });

const LETTER = "prologue.sprocket_row.back_rent";

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

const ids = (scenes: { id: string }[]) => scenes.map((scene) => scene.id);

describe("the first session's story", () => {
  let id: number;

  it("counts the first check-in as a visit, and a reload within the hour as none", async () => {
    const kit = (await call("POST", "/tinkers", { login: "visits@example.com", name: "Vi" })).body.tinker.id;
    const visits = async () => (await call("GET", `/tinkers/${kit}/story`)).body.view.qualities["record.check_ins"];
    await call("POST", `/tinkers/${kit}/check-in`);
    expect(await visits()).toBe(1);
    clock += 30 * MINUTE;
    await call("POST", `/tinkers/${kit}/check-in`);
    expect(await visits()).toBe(1);
    clock += 30 * MINUTE;
    const counted = await call("POST", `/tinkers/${kit}/check-in`);
    expect(counted.body.story).toContainEqual(expect.objectContaining({ type: "check_in_counted", qualities: { "record.check_ins": 2 } }));
    expect(await visits()).toBe(2);
    // Only opening the workshop is a visit; the queue, a weapon and the Exchange are not.
    clock += 60 * MINUTE;
    await call("PUT", `/tinkers/${kit}/queue`, { queue: [{ actionId: "action.rustmoor.prospect_copper", remaining: 1 }] });
    await call("POST", `/tinkers/${kit}/grocer`, { item: "item.rustmoor.barley_meal", qty: 1 }).catch(() => undefined);
    expect(await visits()).toBe(2);
    await call("POST", `/tinkers/${kit}/check-in`);
    expect(await visits()).toBe(3);
  });

  it("starts with full Nerve and Pip's bill in the tube", async () => {
    id = (await call("POST", "/tinkers", { login: "ada@example.com", name: "Ada" })).body.tinker.id;
    const checked = await call("POST", `/tinkers/${id}/check-in`);
    expect(checked.body.story).toEqual([
      expect.objectContaining({ type: "check_in_counted", qualities: { "record.check_ins": 1 } }),
      expect.objectContaining({ type: "letter_arrived", letter: LETTER }),
    ]);
    expect(checked.body.tinker.story).toMatchObject({ nerve: 10, nerveCap: 10, nextNerveAt: null, letters: 1, backRent: 0 });
    const { body } = await call("GET", `/tinkers/${id}/story`);
    expect(ids(body.view.letters)).toEqual([LETTER]);
    expect(body.view.letters[0].sender).toBe("Pip Tumbler");
    expect(body.view.letters[0].options[1].challenge).toEqual({ quality: "tinkering", level: 1, difficulty: 6, odds: 0.1 });
    expect(body.view.storylets).toEqual([]);
  });

  it("spikes the bill: a Nerve spent, 15 Crowns owed, and the brass plate opens", async () => {
    const played = await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 });
    expect(played.status).toBe(200);
    expect(played.body.played).toMatchObject({ scene: LETTER, success: true, odds: null });
    expect(played.body.played.text).toMatch(/spike above the vice/);
    expect(played.body.view).toMatchObject({ nerve: 9, backRent: 15, letters: [] });
    expect(new Date(played.body.view.nextNerveAt).getTime()).toBe(clock + 36 * MINUTE);
    expect(ids(played.body.view.storylets)).toEqual(["prologue.sprocket_row.brass_plate"]);
    expect(played.body.view.qualities).toEqual({ "record.check_ins": 1, "flag.owes_back_rent": 1, "prologue.progress": 50 });
  });

  it("refuses a letter not in hand, a scene not open, and a missing option", async () => {
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "act1.lowvents.bottom_rim", option: 0 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "prologue.sprocket_row.brass_plate", option: 9 })).status).toBe(400);
  });

  it("pays the back rent at the Counting-House window once there are Crowns", async () => {
    const broke = await call("POST", `/tinkers/${id}/debts/back_rent`);
    expect(broke.status).toBe(400);
    expect(broke.body.error).toMatch(/15 Crowns; you have 0/);
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.scavenge_bent_nails", remaining: 500 }] });
    clock += 2 * HOUR;
    await call("POST", `/tinkers/${id}/collector`, { item: "item.rustmoor.bent_nails", qty: 10 });
    const paid = await call("POST", `/tinkers/${id}/debts/back_rent`);
    expect(paid.status).toBe(200);
    expect(paid.body.tinker.crowns).toBe(80 - 15);
    expect(paid.body.view.backRent).toBe(0);
    expect(paid.body.view.qualities["flag.owes_back_rent"]).toBeUndefined();
    expect(paid.body.view.debts).toEqual([]);
    expect((await call("POST", `/tinkers/${id}/debts/back_rent`)).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/debts/foundry_pass`)).status).toBe(400);
  });

  it("plays the chain in order, and the rat nests open at Scavenging 3", async () => {
    // The next visit opens Act I.
    await call("POST", `/tinkers/${id}/check-in`);
    // The opening scenes open one a visit, so each play follows a workshop check-in an hour on.
    const play = async (scene: string, option: number) => {
      clock += HOUR;
      await call("POST", `/tinkers/${id}/check-in`);
      const { status, body } = await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene, option });
      expect(status).toBe(200);
      return body;
    };
    await play("prologue.sprocket_row.brass_plate", 0);
    await play("act1.sprocket_row.altitude_review", 0);
    await play("act1.lowvents.the_list", 0);
    const last = await play("act1.polytechnic.sealed_lab", 1);
    expect(last.view.qualities["act1.progress"]).toBe(15);
    expect(last.view.needles["needle.scald"]).toBe(1);
    expect(last.tinker.skills.find((skill: { skill: string }) => skill.skill === "scavenging").level).toBeGreaterThanOrEqual(3);
    expect(ids(last.view.storylets)).toEqual(["act1.rustmoor.rat_nests"]);
    const hand = last.view.storylets[0].options.find((option: { challenge: unknown }) => option.challenge);
    expect(hand.challenge).toMatchObject({ quality: "scavenging", difficulty: 4 });
  });

  it("refills Nerve while away and lets a Needle fall after a day", async () => {
    const before = (await call("GET", `/tinkers/${id}/story`)).body.view;
    clock += 36 * MINUTE;
    expect((await call("GET", `/tinkers/${id}/story`)).body.view.nerve).toBe(before.nerve + 1);
    clock += 24 * HOUR;
    const later = (await call("GET", `/tinkers/${id}/story`)).body;
    expect(later.view.nerve).toBe(10);
    expect(later.view.needles["needle.scald"]).toBe(0);
    expect(later.story).toContainEqual(expect.objectContaining({ type: "needle_fell", needle: "needle.scald", value: 0 }));
  });

  it("rebuilds every story quality from the event log alone", async () => {
    const { rows } = await db.query("SELECT type, payload FROM events WHERE tinker_id = $1 ORDER BY seq", [id]);
    const qualities: Record<string, number> = {};
    for (const { type, payload } of rows) {
      if (type === "scene_played" || type === "debt_paid") Object.assign(qualities, payload.qualities);
      if (type === "needle_fell") qualities[payload.needle] = payload.value;
      if (type === "check_in_counted") Object.assign(qualities, payload.qualities);
    }
    // An absent quality is 0, so zeros are dropped on both sides.
    const nonZero = (entries: [string, number][]) => Object.fromEntries(entries.filter(([, value]) => value !== 0));
    const stored = nonZero((await db.query("SELECT name, value FROM qualities WHERE tinker_id = $1", [id])).rows.map((row) => [row.name, row.value]));
    expect(stored).toEqual(nonZero(Object.entries(qualities)));
    expect(stored).toMatchObject({ "prologue.progress": 100, "act1.progress": 15 });
  });
});

describe("fights before they are queued", () => {
  it("shows a boss's win chance with the Rations it would take, and why a fight cannot start", async () => {
    const id = (await call("POST", "/tinkers", { login: "fights@example.com", name: "Fen" })).body.tinker.id;
    const unarmed = (await call("GET", `/tinkers/${id}/fights`)).body.fights;
    expect(unarmed.find((f: { monsterId: string }) => f.monsterId === "monster.rustmoor.scrapjaw")).toEqual({
      monsterId: "monster.rustmoor.scrapjaw",
      ready: false,
      reason: "no_weapon",
    });
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.tinker_brass_spanner", remaining: 1 }] });
    clock += HOUR;
    await call("PUT", `/tinkers/${id}/weapon`, { item: "item.rustmoor.brass_spanner" });
    const armed = (await call("GET", `/tinkers/${id}/fights`)).body.fights;
    const boss = armed.find((f: { monsterId: string }) => f.monsterId === "monster.rustmoor.scrapjaw");
    expect(boss).toMatchObject({ ready: true, rations: 3 });
    expect(boss.winChance).toBeGreaterThanOrEqual(0);
    expect(boss.winChance).toBeLessThan(0.05);
    const runt = armed.find((f: { monsterId: string }) => f.monsterId === "monster.rustmoor.rust_rat_runt");
    expect(runt).toMatchObject({ ready: true, winChance: null });
    expect(runt.seconds).toBeGreaterThanOrEqual(54);
  });
});

describe("the Post", () => {
  it("returns a discarded letter while its requirements hold", async () => {
    const id = (await call("POST", "/tinkers", { login: "kit@example.com", name: "Kit" })).body.tinker.id;
    const discarded = await call("DELETE", `/tinkers/${id}/letters/${LETTER}`);
    expect(discarded.status).toBe(200);
    expect(discarded.body.view.letters).toEqual([]);
    expect((await call("DELETE", `/tinkers/${id}/letters/${LETTER}`)).status).toBe(400);
    clock += 2 * HOUR;
    expect(ids((await call("GET", `/tinkers/${id}/story`)).body.view.letters)).toEqual([LETTER]);
  });

  it("refuses a scene when Nerve has run out", async () => {
    const id = (await call("POST", "/tinkers", { login: "nell@example.com", name: "Nell" })).body.tinker.id;
    await db.query("UPDATE tinkers SET nerve = 0, nerve_at = $2 WHERE id = $1", [id, new Date(clock)]);
    const refused = await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/needs 1 Nerve; you have 0/);
  });
});
