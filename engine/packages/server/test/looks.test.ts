// A Tinker's looks through the API (work order 042), against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi, devClock } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const clock = Date.UTC(2026, 10, 15, 8, 0, 0);
const { clock: dev } = devClock();
const api = buildApi({ db, content, now: () => clock, trading: { level: 0, days: 0 }, devClock: dev });
const SOOT = "look.outfit.soot_black";
const GREEN = "look.outfit.gaugers_green";
const ROW = "look.backdrop.sprocket_row";

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

async function tinker(login: string, body?: string) {
  return (await call("POST", "/tinkers", { login, name: login.split("@")[0]!, ...(body ? { body } : {}) })).body.tinker.id as number;
}

async function withCogs(id: number, crates: number) {
  await call("POST", `/dev/tinkers/${id}/crates`, { qty: crates });
  return call("POST", `/tinkers/${id}/shop/open`, { qty: crates });
}

describe("a Tinker's looks", () => {
  it("starts a Tinker as the body picked, or the first body until one is", async () => {
    const picked = await tinker("looks-f@example.com", "look.body.f");
    expect((await call("GET", `/tinkers/${picked}`)).body.tinker.look).toEqual({ body: "look.body.f", outfit: null, backdrop: null, picked: true });
    const unpicked = await tinker("looks-none@example.com");
    expect((await call("GET", `/tinkers/${unpicked}`)).body.tinker.look).toEqual({ body: "look.body.m", outfit: null, backdrop: null, picked: false });
    expect((await call("POST", "/tinkers", { login: "looks-bad@example.com", name: "bad", body: "look.body.x" })).status).toBe(400);
  });

  it("changes body for nothing, and wears only what is held", async () => {
    const id = await tinker("looks-wear@example.com");
    const changed = await call("PUT", `/tinkers/${id}/look`, { body: "look.body.f", backdrop: "look.backdrop.workshop" });
    expect(changed.status).toBe(200);
    expect(changed.body.tinker.look).toEqual({ body: "look.body.f", outfit: null, backdrop: "look.backdrop.workshop", picked: true });
    expect((await call("PUT", `/tinkers/${id}/look`, { outfit: SOOT })).status).toBe(400);
    expect((await call("PUT", `/tinkers/${id}/look`, { outfit: "look.outfit.none" })).status).toBe(400);
    expect((await call("PUT", `/tinkers/${id}/look`, { backdrop: null })).body.tinker.look.backdrop).toBeNull();
  });

  it("sells a look for Cogs once, puts it on, and logs the Cogs", async () => {
    const id = await tinker("looks-buy@example.com");
    expect((await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: SOOT })).status).toBe(400);
    await withCogs(id, 2);
    const bought = await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: SOOT });
    expect(bought.status).toBe(200);
    expect(bought.body.tinker).toMatchObject({ cogs: 5, look: { outfit: SOOT } });
    expect(bought.body.wardrobe.outfits.find((offer: { id: string }) => offer.id === SOOT)).toMatchObject({ held: true, cogs: 15 });
    expect((await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: SOOT })).status).toBe(400);
    const row = await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: ROW });
    expect(row.body.tinker).toMatchObject({ cogs: 0, look: { outfit: SOOT, backdrop: ROW } });
    const log = (await db.query("SELECT payload FROM events WHERE tinker_id = $1 AND type = 'look_bought' ORDER BY seq", [id])).rows;
    expect(log.map((event) => event.payload)).toEqual([
      { look: SOOT, items: {}, cogs: -15 },
      { look: ROW, items: {}, cogs: -5 },
    ]);
    // Taking it off and putting it back costs nothing.
    await call("PUT", `/tinkers/${id}/look`, { outfit: null });
    expect((await call("PUT", `/tinkers/${id}/look`, { outfit: SOOT })).body.tinker).toMatchObject({ cogs: 0, look: { outfit: SOOT } });
  });

  it("opens a Favour look at its level, never for Cogs", async () => {
    const id = await tinker("looks-favour@example.com");
    await withCogs(id, 5);
    expect((await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: GREEN })).status).toBe(400);
    expect((await call("PUT", `/tinkers/${id}/look`, { outfit: GREEN })).status).toBe(400);
    await call("POST", `/dev/tinkers/${id}/story`, { qualities: { "favour.gaugers": 2 } });
    const wardrobe = (await call("GET", `/tinkers/${id}/wardrobe`)).body.wardrobe;
    expect(wardrobe.outfits.find((offer: { id: string }) => offer.id === GREEN)).toEqual({ id: GREEN, held: true, cogs: null, tokens: null, favour: { quality: "favour.gaugers", level: 2, have: 2 } });
    expect((await call("PUT", `/tinkers/${id}/look`, { outfit: GREEN })).body.tinker.look.outfit).toBe(GREEN);
  });

  it("keeps a bought look through starting over, and takes off one Favour opened", async () => {
    const id = await tinker("looks-reset@example.com", "look.body.f");
    await withCogs(id, 1);
    await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: ROW });
    await call("POST", `/dev/tinkers/${id}/story`, { qualities: { "favour.gaugers": 2 } });
    await call("PUT", `/tinkers/${id}/look`, { outfit: GREEN });
    const reset = await call("POST", `/tinkers/${id}/reset`, { name: "looks-reset" });
    expect(reset.body.tinker.look).toEqual({ body: "look.body.f", outfit: null, backdrop: ROW, picked: true });
  });

  it("shows a look to anyone who inspects, and finds a Tinker by the start of its name", async () => {
    const id = await tinker("Looks-Seen@example.com", "look.body.f");
    const other = await tinker("looks-viewer@example.com");
    await withCogs(id, 1);
    await call("POST", `/tinkers/${id}/wardrobe/buy`, { look: ROW });
    expect((await call("GET", `/tinkers/${other}/inspect/${id}`)).body.look).toEqual({ body: "look.body.f", outfit: null, backdrop: ROW });
    const found = (await call("GET", `/tinkers/${other}/find?name=looks-se`)).body.found;
    expect(found).toEqual([{ id, name: "Looks-Seen", totalLevel: expect.any(Number) }]);
    expect((await call("GET", `/tinkers/${other}/find?name=l`)).body.found).toEqual([]);
    expect((await call("GET", `/tinkers/${other}/find?name=100%25`)).body.found).toEqual([]);
  });

  it("finds the Tinker a chat command names by whole name, longest first, and not when two share it", async () => {
    const named = async (login: string, name: string) => (await call("POST", "/tinkers", { login, name })).body.tinker.id as number;
    const ada = await named("named-ada@example.com", "Adaline");
    const bell = await named("named-bell@example.com", "Adaline Bell");
    await named("named-twin-1@example.com", "Twin_Cog");
    await named("named-twin-2@example.com", "twin_cog");
    const look = async (text: string) => (await call("GET", `/tinkers/${ada}/named?text=${encodeURIComponent(text)}`)).body;
    expect(await look("adaline  hello there")).toEqual({ tinker: { id: ada, name: "Adaline" }, rest: "hello there", shared: 1 });
    expect(await look("Adaline Bell hello")).toEqual({ tinker: { id: bell, name: "Adaline Bell" }, rest: "hello", shared: 1 });
    expect(await look("Adal hello")).toEqual({ tinker: null, rest: "Adal hello", shared: 0 });
    expect(await look("twin_cog hi")).toEqual({ tinker: null, rest: "hi", shared: 2 });
    expect(await look("Twin%Cog hi")).toMatchObject({ tinker: null, shared: 0 });
    expect(await look("")).toEqual({ tinker: null, rest: "", shared: 0 });
  });
});
