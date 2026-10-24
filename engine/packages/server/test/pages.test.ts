// Hester's Ledger (work order 024) against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations. The page texts are Jeremy's
// and not written yet, so one is supplied here.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const loaded = loadContent();
const PAGE = "item.rustmoor.ledger_page_1";
const content = {
  ...loaded,
  ledger: new Map([[PAGE, { id: "ledger.rustmoor.page_1", item: PAGE, title: "Seventy fathoms", text: "A test page." }]]),
};
const app = buildApi({ db, content, now: () => Date.UTC(2026, 9, 22, 8, 0, 0) });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

const pages = async (id: number) => {
  const response = await app.inject({ method: "GET", url: `/tinkers/${id}/pages` });
  return { status: response.statusCode, body: response.json() };
};

describe("Hester's Ledger", () => {
  it("lists every page, and gives text only for the pages a Tinker holds", async () => {
    const id = (await app.inject({ method: "POST", url: "/tinkers", payload: { login: "pages@example.com", name: "Pages" } })).json().tinker.id;

    const before = (await pages(id)).body.pages;
    expect(before.map((page: { item: string }) => page.item)).toEqual([
      PAGE,
      "item.rustmoor.ledger_page_drop_1",
      "item.rustmoor.ledger_page_drop_2",
      "item.rustmoor.ledger_page_drop_3",
      "item.rustmoor.ledger_page_drop_4",
    ]);
    expect(before.every((page: { held: boolean; text: string | null }) => !page.held && page.text === null)).toBe(true);

    await db.query("INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, true, 1), ($1, $3, false, 1)", [
      id,
      PAGE,
      "item.rustmoor.ledger_page_drop_2",
    ]);
    const after = (await pages(id)).body.pages;
    expect(after[0]).toEqual({ item: PAGE, name: "Ledger Page 1", held: true, title: "Seventy fathoms", text: "A test page." });
    // Held, but not transcribed yet.
    expect(after[2]).toMatchObject({ held: true, title: null, text: null });
    expect(after[1]).toMatchObject({ held: false, text: null });
  });

  it("does not know a Tinker that does not exist", async () => {
    expect((await pages(999_999)).status).toBe(404);
  });
});
