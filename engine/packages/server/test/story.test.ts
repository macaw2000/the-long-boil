// The story engine through the API, against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations: the first day's three sittings
// (work order 037), then Act I to the rat nests.

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

const HAUL = "prologue.sprocket_row.the_first_haul";
const SILK = "item.rustmoor.umbrella_silk";

/** Five rats' silk in the stores, as five kills leave it: the first sitting's third scene waits on it (work order 041). */
const fiveRats = (id: number) => db.query("INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, false, 5)", [id, SILK]);

/** Plays a new Tinker's first sitting, then opens the second visit, so Pip's bill is in hand. */
async function toTheBill(id: number) {
  await call("POST", `/tinkers/${id}/check-in`);
  await fiveRats(id);
  for (const scene of ["prologue.sprocket_row.who_you_are", "prologue.sprocket_row.rats_in_the_workshop", HAUL])
    await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene, option: 0 });
  clock += HOUR;
  await call("POST", `/tinkers/${id}/check-in`);
}

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

  it("starts with full Nerve, no Needles and no letter: the first scene is about you", async () => {
    id = (await call("POST", "/tinkers", { login: "ada@example.com", name: "Ada" })).body.tinker.id;
    const checked = await call("POST", `/tinkers/${id}/check-in`);
    expect(checked.body.story).toEqual([expect.objectContaining({ type: "check_in_counted", qualities: { "record.check_ins": 1 } })]);
    expect(checked.body.tinker.story).toMatchObject({ nerve: 10, nerveCap: 10, nextNerveAt: null, letters: 0, backRent: 0, needles: {} });
    const { body } = await call("GET", `/tinkers/${id}/story`);
    expect(body.view.letters).toEqual([]);
    expect(ids(body.view.storylets)).toEqual(["prologue.sprocket_row.who_you_are"]);
  });

  it("plays the first sitting's three scenes: who you are, rats in the workshop, then the first haul", async () => {
    const who = await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "prologue.sprocket_row.who_you_are", option: 0 });
    expect(who.status).toBe(200);
    expect(who.body.view.qualities).toMatchObject({ "flag.origin_apprentice": 1, "prologue.progress": 4 });
    expect(ids(who.body.view.storylets)).toEqual(["prologue.sprocket_row.rats_in_the_workshop"]);
    const rats = await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "prologue.sprocket_row.rats_in_the_workshop", option: 0 });
    expect(rats.body.view).toMatchObject({ nerve: 8, letters: [], storylets: [] });
    // The third scene waits on five rats beaten, and the road says so in the player's words.
    expect(rats.body.view.upcoming).toEqual([{ id: HAUL, location: "sprocket_row", needs: [[SILK, ">=5", 0]] }]);
    expect(rats.body.view.road.next).toMatchObject({ state: "waiting", scene: HAUL, hint: "Beat five Rust Rats in Rustmoor." });
    await fiveRats(id);
    expect(ids((await call("GET", `/tinkers/${id}/story`)).body.view.storylets)).toEqual([HAUL]);
    const haul = await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: HAUL, option: 0 });
    expect(haul.body.view).toMatchObject({ nerve: 7, letters: [], storylets: [] });
    expect(haul.body.view.qualities["prologue.progress"]).toBe(9);
    // The rest of the first day waits for the next visit, and says when that is.
    expect(new Date(haul.body.view.nextVisitAt).getTime()).toBe(clock + HOUR);
    expect(haul.body.view.upcoming).toEqual([{ id: LETTER, location: "sprocket_row", needs: [["record.check_ins", ">=2", 1]] }]);
  });

  it("delivers Pip's bill the moment the second visit opens; spiking it owes a year's rent", async () => {
    clock += HOUR;
    const checked = await call("POST", `/tinkers/${id}/check-in`);
    expect(checked.body.story).toContainEqual(expect.objectContaining({ type: "letter_arrived", letter: LETTER }));
    const { body } = await call("GET", `/tinkers/${id}/story`);
    expect(ids(body.view.letters)).toEqual([LETTER]);
    expect(body.view.letters[0].sender).toBe("Pip Tumbler");
    // Both answers are certain: odds wait for the third sitting.
    expect(body.view.letters[0].options.every((option: { challenge: unknown }) => option.challenge === null)).toBe(true);
    const played = await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 });
    expect(played.status).toBe(200);
    expect(played.body.played).toMatchObject({ scene: LETTER, success: true, odds: null });
    // Pip calls whether or not it is paid, so the receipt opens at once.
    expect(played.body.view).toMatchObject({ backRent: 1400, letters: [] });
    expect(ids(played.body.view.storylets)).toEqual(["prologue.sprocket_row.the_receipt"]);
    expect(played.body.view.qualities).toMatchObject({ "record.check_ins": 2, "flag.owes_back_rent": 1, "prologue.progress": 10 });
  });

  it("refuses a letter not in hand, a scene not open, and a missing option", async () => {
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "act1.lowvents.bottom_rim", option: 0 })).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene: "prologue.sprocket_row.brass_plate", option: 9 })).status).toBe(400);
  });

  it("pays the back rent at the Counting-House window once there are Crowns", async () => {
    const broke = await call("POST", `/tinkers/${id}/debts/back_rent`);
    expect(broke.status).toBe(400);
    expect(broke.body.error).toMatch(/1400 Crowns; you have 0/);
    await call("PUT", `/tinkers/${id}/queue`, { queue: [{ actionId: "action.rustmoor.scavenge_bent_nails", remaining: 500 }] });
    clock += 2 * HOUR;
    // A night of rats short of the rent, made up at the collectors' window.
    await db.query("UPDATE tinkers SET crowns = 1340 WHERE id = $1", [id]);
    await call("POST", `/tinkers/${id}/collector`, { item: "item.rustmoor.bent_nails", qty: 10 });
    const paid = await call("POST", `/tinkers/${id}/debts/back_rent`);
    expect(paid.status).toBe(200);
    expect(paid.body.tinker.crowns).toBe(1340 + 80 - 1400);
    expect(paid.body.view.backRent).toBe(0);
    expect(paid.body.view.qualities["flag.owes_back_rent"]).toBeUndefined();
    expect(paid.body.view.debts).toEqual([]);
    expect((await call("POST", `/tinkers/${id}/debts/back_rent`)).status).toBe(400);
    expect((await call("POST", `/tinkers/${id}/debts/foundry_pass`)).status).toBe(400);
  });

  it("plays the chain in order, and the rat nests open at Scavenging 3", async () => {
    // Each play follows a workshop check-in an hour on, so every sitting's gate is met.
    const play = async (scene: string, option: number) => {
      clock += HOUR;
      await call("POST", `/tinkers/${id}/check-in`);
      const { status, body } = await call("POST", `/tinkers/${id}/story`, { kind: "storylet", scene, option });
      expect(status).toBe(200);
      return body;
    };
    // The rest of the Prologue (the rent is paid above), then the plate; Act I opens at the visit after it.
    for (const scene of ["sprocket_row.the_receipt", "sprocket_row.the_neighbours", "polytechnic.the_register", "rustmoor.the_tip_book",
      "rustmoor.the_first_nest", "polytechnic.the_lift_lecture"])
      await play(`prologue.${scene}`, 0);
    await play("prologue.sprocket_row.brass_plate", 0);
    await play("act1.sprocket_row.altitude_review", 0);
    await play("act1.lowvents.the_list", 0);
    const last = await play("act1.polytechnic.sealed_lab", 1);
    expect(last.view.qualities["act1.progress"]).toBe(15);
    expect(last.view.needles["needle.scald"]).toBe(1);
    expect(last.tinker.skills.find((skill: { skill: string }) => skill.skill === "scavenging").level).toBeGreaterThanOrEqual(3);
    // District scenes (work order 019) open alongside the spine; the next beat, rat_nests, opens at the next visit.
    expect(ids(last.view.storylets)).not.toContain("act1.rustmoor.rat_nests");
    clock += HOUR;
    await call("POST", `/tinkers/${id}/check-in`);
    const next = (await call("GET", `/tinkers/${id}/story`)).body;
    expect(ids(next.view.storylets)).toContain("act1.rustmoor.rat_nests");
    const nests = next.view.storylets.find((scene: { id: string }) => scene.id === "act1.rustmoor.rat_nests");
    const hand = nests.options.find((option: { challenge: unknown }) => option.challenge);
    expect(hand.challenge).toMatchObject({ quality: "scavenging", difficulty: 4 });
  });

  it("refills Nerve while away and lets a Needle fall after a day", async () => {
    await db.query("UPDATE tinkers SET nerve = 5, nerve_at = $2 WHERE id = $1", [id, new Date(clock)]);
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
    await toTheBill(id);
    const discarded = await call("DELETE", `/tinkers/${id}/letters/${LETTER}`);
    expect(discarded.status).toBe(200);
    expect(discarded.body.view.letters).toEqual([]);
    // A Prologue letter is a step in the first day, so it comes straight back (and the client offers no Discard for it).
    expect(ids((await call("GET", `/tinkers/${id}/story`)).body.view.letters)).toEqual([LETTER]);
  });

  it("refuses a scene when Nerve has run out", async () => {
    const id = (await call("POST", "/tinkers", { login: "nell@example.com", name: "Nell" })).body.tinker.id;
    await toTheBill(id);
    await db.query("UPDATE tinkers SET nerve = 0, nerve_at = $2 WHERE id = $1", [id, new Date(clock)]);
    const refused = await call("POST", `/tinkers/${id}/story`, { kind: "letter", scene: LETTER, option: 0 });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/needs 1 Nerve; you have 0/);
  });
});
