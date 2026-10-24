// Hester's Ledger (GDD section 4): the pages of Hester Vane's notebook, one
// item each, and what a Tinker can read of them. A page's text is sent only
// to a Tinker who holds the page, so the mystery is never in the public
// content. The texts are Jeremy's (work order 024); a page without one yet
// reads as not transcribed.

import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { NotFound } from "./settle.js";

export interface LedgerPageView {
  item: string;
  name: string;
  held: boolean;
  /** Null until the page is held, or while it has no text yet. */
  title: string | null;
  text: string | null;
}

/** Every Ledger Page item in content order: those with a text, and any item named as a page. */
function pageItems(content: GameContent): string[] {
  const items = [...content.items.keys()].filter((item) => item.includes(".ledger_page") || content.ledger.has(item));
  for (const item of content.ledger.keys()) if (!items.includes(item)) items.push(item);
  return items;
}

export async function readLedgerPages(db: Db, content: GameContent, tinkerId: number): Promise<{ pages: LedgerPageView[] }> {
  const exists = await db.query("SELECT 1 FROM tinkers WHERE id = $1", [tinkerId]);
  if (!exists.rowCount) throw new NotFound(`no Tinker ${tinkerId}`);
  const held = new Set(
    (await db.query<{ item: string }>("SELECT DISTINCT item FROM inventory WHERE tinker_id = $1 AND qty > 0", [tinkerId])).rows.map((row) => row.item),
  );
  return {
    pages: pageItems(content).map((item) => {
      const page = held.has(item) ? content.ledger.get(item) : undefined;
      return {
        item,
        name: content.items.get(item)?.name ?? item,
        held: held.has(item),
        title: page?.title ?? null,
        text: page?.text ?? null,
      };
    }),
  };
}
