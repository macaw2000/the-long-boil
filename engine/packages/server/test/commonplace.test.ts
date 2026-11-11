// The Commonplace Book (GDD section 5) against a real PostgreSQL database,
// long_boil_test, rebuilt from the migrations. No scene carries a note yet
// and the page texts are Jeremy's and not written yet, so a note and a page
// are supplied here.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const loaded = loadContent();
const PAGE = "item.rustmoor.ledger_page_1";
const SCENE = "act1.lowvents.the_list";
const LETTER = "act1.lowvents.vent_sleeves";
const NOTE = "The Lowvents call a review Ballast, and the list for it is written in pencil.";
const LETTER_NOTE = "Mother Ash speaks for the Stokers' Fellowship.";

/** The real scene with a note on one option and none on the others, whatever the content says. */
function noted(scene: { options: { success: { note?: string } }[] }, index: number, note: string) {
  return {
    ...scene,
    options: scene.options.map((option, i) => ({ ...option, success: { ...option.success, note: i === index ? note : undefined } })),
  };
}

const content = {
  ...loaded,
  rules: {
    ...loaded.rules,
    storylets: new Map([...loaded.rules.storylets, [SCENE, noted(loaded.rules.storylets.get(SCENE)!, 0, NOTE)]]),
    letters: new Map([...loaded.rules.letters, [LETTER, noted(loaded.rules.letters.get(LETTER)!, 1, LETTER_NOTE)]]),
  },
  ledger: new Map([[PAGE, { id: "ledger.rustmoor.page_1", item: PAGE, title: "Seventy fathoms", text: "A test page." }]]),
} as typeof loaded;
const app = buildApi({ db, content, now: () => Date.UTC(2026, 9, 22, 8, 0, 0) });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
});

afterAll(async () => {
  await app.close();
  await db.end();
});

const book = async (id: number) => {
  const response = await app.inject({ method: "GET", url: `/tinkers/${id}/commonplace` });
  return { status: response.statusCode, body: response.json() };
};

/** A scene_played event, as playStory logs it. */
async function played(id: number, seq: number, kind: "storylet" | "letter", scene: string, option: number, at: string) {
  await db.query("INSERT INTO events (tinker_id, seq, type, at, payload, content_version) VALUES ($1, $2, 'scene_played', $3, $4, 'test')", [
    id,
    seq,
    at,
    JSON.stringify({ type: "scene_played", kind, scene, option, success: true }),
  ]);
}

describe("the Commonplace Book", () => {
  it("holds each note a Tinker has uncovered, in the order found, and the pages it holds", async () => {
    const id = (await app.inject({ method: "POST", url: "/tinkers", payload: { login: "book@example.com", name: "Book" } })).json().tinker.id;

    expect((await book(id)).body).toEqual({ notes: [], pages: [] });

    // The letter's noted option, the storylet's unnoted one, then its noted one twice.
    await played(id, 1001, "letter", LETTER, 1, "2026-10-20T08:00:00Z");
    await played(id, 1002, "storylet", SCENE, 1, "2026-10-21T08:00:00Z");
    await played(id, 1003, "storylet", SCENE, 0, "2026-10-21T09:00:00Z");
    await played(id, 1004, "storylet", SCENE, 0, "2026-10-21T10:00:00Z");
    await db.query("INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, true, 1)", [id, PAGE]);

    const after = (await book(id)).body;
    expect(after.notes).toEqual([
      { scene: LETTER, sender: "Mother Ash", note: LETTER_NOTE, at: Date.UTC(2026, 9, 20, 8) },
      { scene: SCENE, sender: null, note: NOTE, at: Date.UTC(2026, 9, 21, 9) },
    ]);
    expect(after.pages).toEqual([{ item: PAGE, name: "Ledger Page 1", held: true, title: "Seventy fathoms", text: "A test page." }]);
  });

  it("does not know a Tinker that does not exist", async () => {
    expect((await book(999_999)).status).toBe(404);
  });
});
