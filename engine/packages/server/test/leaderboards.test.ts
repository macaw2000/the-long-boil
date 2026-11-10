// Leaderboards through the API (GDD section 6, Leaderboards), against a real
// PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { levelFor, totalLevel } from "@long-boil/rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
const clock = Date.UTC(2026, 10, 10, 8, 0, 0);
const app = buildApi({ db, content, now: () => clock });

// An item the collectors buy, for valuing goods in net worth.
const [goods, terms] = [...content.economy].find(([, entry]) => entry.collectorPrice !== null)!;
const goodsPrice = terms.collectorPrice!;

let ada: number;
let bram: number;
let cog: number;

async function call(method: "GET" | "POST", url: string, payload?: object) {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

/** Test setup: a Tinker with an empty pack, a set purse, and the XP given. */
async function tinker(login: string, name: string, crowns: number, xp: Record<string, number>): Promise<number> {
  const id = (await call("POST", "/tinkers", { login, name })).body.tinker.id;
  await db.query("DELETE FROM inventory WHERE tinker_id = $1", [id]);
  await db.query("UPDATE tinkers SET crowns = $2 WHERE id = $1", [id, crowns]);
  for (const [skill, amount] of Object.entries(xp)) {
    await db.query(
      "INSERT INTO skills (tinker_id, skill, xp) VALUES ($1, $2, $3) ON CONFLICT (tinker_id, skill) DO UPDATE SET xp = EXCLUDED.xp",
      [id, skill, amount],
    );
  }
  return id;
}

async function expectedTotal(id: number): Promise<number> {
  const rows = (await db.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [id])).rows;
  return totalLevel(Object.fromEntries(rows.map((row) => [row.skill, Number(row.xp)])), content.rules);
}

async function board(id: number, name: string) {
  return (await call("GET", `/tinkers/${id}/leaderboards/${name}`)).body;
}

async function guild(name: string, status: "active" | "charter", members: [number, string][]) {
  const at = new Date(clock);
  const id = (
    await db.query("INSERT INTO guilds (name, status, pledged, created_at, charter_ends, formed_at) VALUES ($1, $2, 500000, $3, $3, $4) RETURNING id", [
      name,
      status,
      at,
      status === "active" ? at : null,
    ])
  ).rows[0].id;
  for (const [tinkerId, rank] of members) {
    await db.query(
      "INSERT INTO guild_members (guild_id, tinker_id, account_id, rank, joined_at) SELECT $1, id, account_id, $3, $4 FROM tinkers WHERE id = $2",
      [id, tinkerId, rank, at],
    );
  }
  return Number(id);
}

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  ada = await tinker("lb-ada@example.com", "Ada", 1_000, { smithing: 2_000_000, cooking: 5_000 });
  bram = await tinker("lb-bram@example.com", "Bram", 5_000, { smithing: 20_000, cooking: 5_000 });
  cog = await tinker("lb-cog@example.com", "Cog", 200, { cooking: 0 });
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe("the leaderboards", () => {
  it("ranks total level, best first, and marks your own row", async () => {
    const view = await board(cog, "total");
    expect(view.boards).toEqual(expect.arrayContaining(["total", "net_worth", "guilds", "cooking", "tea_blending", "aetherics"]));
    expect(view.boards).toHaveLength(19);
    expect(view.rows.map((row: { name: string }) => row.name)).toEqual(["Ada", "Bram", "Cog"]);
    expect(view.rows[0]).toMatchObject({ rank: 1, value: await expectedTotal(ada), you: false });
    expect(view.you).toMatchObject({ rank: 3, name: "Cog", value: await expectedTotal(cog), you: true });
  });

  it("ranks a skill by XP, shares a rank on a tie, and leaves out the untrained", async () => {
    const view = await board(ada, "cooking");
    expect(view.rows).toEqual([
      expect.objectContaining({ rank: 1, name: "Ada", value: levelFor(5_000, content.rules), detail: 5_000, you: true }),
      expect.objectContaining({ rank: 1, name: "Bram", detail: 5_000, you: false }),
    ]);
    expect((await board(cog, "cooking")).you).toBeNull();
  });

  it("counts net worth from the purse, open buy orders and goods at the collectors' price", async () => {
    await db.query("INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, false, 3), ($1, $2, true, 2)", [ada, goods]);
    await db.query(
      `INSERT INTO exchange_orders (tinker_id, item, side, price, qty_total, qty_open, placed_at, expires_at)
       VALUES ($1, $2, 'buy', 100, 5, 5, $3, $4)`,
      [cog, goods, new Date(clock), new Date(clock + 30 * 86_400_000)],
    );
    const view = await board(bram, "net_worth");
    const worth = Object.fromEntries(view.rows.map((row: { name: string; value: number }) => [row.name, row.value]));
    expect(worth).toEqual({ Ada: 1_000 + 3 * goodsPrice, Bram: 5_000, Cog: 700 });
    const values = view.rows.map((row: { value: number }) => row.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(view.you.name).toBe("Bram");
  });

  it("ranks formed guilds by their members' total levels", async () => {
    const owls = await guild("Iron Owls", "active", [
      [ada, "leader"],
      [bram, "member"],
    ]);
    await guild("Tin Larks", "active", [[cog, "leader"]]);
    await guild("Paper Wings", "charter", []);
    const view = await board(ada, "guilds");
    expect(view.rows).toEqual([
      expect.objectContaining({ rank: 1, id: owls, name: "Iron Owls", value: (await expectedTotal(ada)) + (await expectedTotal(bram)), detail: 2, you: true }),
      expect.objectContaining({ rank: 2, name: "Tin Larks", value: await expectedTotal(cog), detail: 1, you: false }),
    ]);
    expect((await board(cog, "guilds")).you.name).toBe("Tin Larks");
  });

  it("never shows a fully banned player, but still shows a chat-banned one", async () => {
    await db.query("UPDATE accounts SET ban = 'full', banned_at = now() WHERE login = 'lb-bram@example.com'");
    await db.query("UPDATE accounts SET ban = 'chat', banned_at = now() WHERE login = 'lb-cog@example.com'");
    for (const name of ["total", "cooking", "smithing", "net_worth"]) {
      const names = (await board(ada, name)).rows.map((row: { name: string }) => row.name);
      expect(names).not.toContain("Bram");
    }
    expect((await board(ada, "total")).rows.map((row: { name: string }) => row.name)).toEqual(["Ada", "Cog"]);
    const owls = (await board(ada, "guilds")).rows.find((row: { name: string }) => row.name === "Iron Owls");
    expect(owls).toMatchObject({ value: await expectedTotal(ada), detail: 1 });
  });

  it("refuses a board that does not exist, and a Tinker that does not", async () => {
    expect((await call("GET", `/tinkers/${ada}/leaderboards/story`)).status).toBe(400);
    expect((await call("GET", "/tinkers/999999/leaderboards/total")).status).toBe(404);
  });
});
