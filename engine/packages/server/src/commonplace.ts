// The Commonplace Book (GDD section 5): every lore fact a Tinker has
// uncovered, written down to be read again. A fact is an outcome's note
// (storylet/1 and letter/1, optional), and the book keeps nothing of its own:
// it reads the scenes this Tinker has played from the event log, in the order
// they were played, and the Ledger Pages it holds, so it can never disagree
// with either. A note added to content later is in the book of everyone who
// already played that outcome.

import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { readLedgerPages, type LedgerPageView } from "./pages.js";

export interface CommonplaceNote {
  /** The scene the note was found in. */
  scene: string;
  /** Who sent it, for a letter; null for a storylet. */
  sender: string | null;
  note: string;
  /** When it was found: the first time that outcome was played. */
  at: number;
}

export interface CommonplaceView {
  /** Oldest first; the same note found twice is written once. */
  notes: CommonplaceNote[];
  /** Only the pages held: a page not yet found is no fact uncovered. */
  pages: LedgerPageView[];
}

export async function readCommonplace(db: Db, content: GameContent, tinkerId: number): Promise<CommonplaceView> {
  // Reading the pages first also refuses a Tinker that does not exist.
  const { pages } = await readLedgerPages(db, content, tinkerId);
  const rows = (
    await db.query<{ payload: { kind: "storylet" | "letter"; scene: string; option: number; success: boolean }; at: Date }>(
      "SELECT payload, at FROM events WHERE tinker_id = $1 AND type = 'scene_played' ORDER BY seq",
      [tinkerId],
    )
  ).rows;
  const notes: CommonplaceNote[] = [];
  const seen = new Set<string>();
  for (const { payload, at } of rows) {
    const scene = (payload.kind === "letter" ? content.rules.letters : content.rules.storylets).get(payload.scene);
    const option = scene?.options[payload.option];
    const outcome = payload.success ? option?.success : (option?.failure ?? option?.success);
    // A fact learned twice, from a replay or from another option with the same note, is written once.
    if (!scene || !outcome?.note || seen.has(outcome.note)) continue;
    seen.add(outcome.note);
    notes.push({ scene: payload.scene, sender: scene.sender ?? null, note: outcome.note, at: at.getTime() });
  }
  return { notes, pages: pages.filter((page) => page.held) };
}
