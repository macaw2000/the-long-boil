// Loads content/ into the rules' Content. The version is a hash of every
// content file, so each event records exactly which content produced it.
// In production AWS AppConfig supplies the same files (GDD section 11).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildContent, readCogShop, type Action, type Content, type CurveRow } from "@long-boil/rules";

export interface StartStack {
  item: string;
  qty: number;
  bound: boolean;
}

export interface ItemInfo {
  id: string;
  name: string;
  flavour: string;
}

/** A page of Hester's Ledger (content/ledger, schema ledger_page/1), written by Jeremy (work order 024). */
export interface LedgerPage {
  id: string;
  item: string;
  title: string;
  text: string;
}

/** An item's terms at the Counting-House window and on the Exchange (tuning.economy). */
export interface ItemTerms {
  bound: boolean;
  collectorPrice: number | null;
  collectorWeeklyCap: number | null;
  grocerPrice: number | null;
}

export interface GameContent {
  rules: Content;
  start: { inventory: StartStack[]; crowns: number };
  /** Names and flavour lines, for the client; the rules never read them. */
  items: ReadonlyMap<string, ItemInfo>;
  economy: ReadonlyMap<string, ItemTerms>;
  /** Ledger page texts by the item that carries the page; a page with no file yet is not transcribed. */
  ledger: ReadonlyMap<string, LedgerPage>;
  /** Brassbuckle's first-session guide (work order 021), or no steps before it is written. */
  guide: { id: string; speaker: string; line: string; button?: string }[];
}

function guideSteps(dir: string): GameContent["guide"] {
  const path = join(dir, "guide", "first_session.json");
  try {
    return readJson(path).steps;
  } catch {
    return [];
  }
}

function economyTerms(files: any[]): Map<string, ItemTerms> {
  const terms = new Map<string, ItemTerms>();
  for (const file of files) {
    for (const [item, entry] of Object.entries<any>(file.items)) {
      terms.set(item, {
        bound: entry.bound,
        collectorPrice: entry.collector_price ?? null,
        collectorWeeklyCap: entry.collector_weekly_cap ?? null,
        grocerPrice: entry.grocer_price ?? null,
      });
    }
  }
  return terms;
}

export const DEFAULT_CONTENT_DIR = join(import.meta.dirname, "../../../../content");

function listJson(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return listJson(path);
      return name.endsWith(".json") ? [path] : [];
    })
    .sort();
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadContent(dir = DEFAULT_CONTENT_DIR): GameContent {
  const hash = createHash("sha256");
  for (const path of listJson(dir)) {
    if (path.endsWith("provenance.json")) continue;
    hash.update(relative(dir, path)).update("\0").update(readFileSync(path)).update("\0");
  }
  const version = hash.digest("hex").slice(0, 12);

  const all = (sub: string, key: string) => listJson(join(dir, sub)).flatMap((path) => readJson(path)[key]);
  const actions: Action[] = all("actions", "actions");
  const curve: CurveRow[] = readJson(join(dir, "tuning", "xp-curve.json")).table;
  const start = readJson(join(dir, "start.json"));
  const economy = economyTerms(listJson(join(dir, "tuning")).filter((path) => readJson(path).schema?.startsWith("tuning.economy")).map(readJson));
  const workOrderDir = join(dir, "work_orders");
  const ledgerDir = join(dir, "ledger");
  const ledger: LedgerPage[] = existsSync(ledgerDir) ? listJson(ledgerDir).map(readJson) : [];
  const items = new Map(all("items", "items").map((item: ItemInfo) => [item.id, { id: item.id, name: item.name, flavour: item.flavour }]));
  const shopPath = join(dir, "tuning", "cog-shop.json");
  const shop = existsSync(shopPath) ? readCogShop(readJson(shopPath)) : null;
  if (shop && !items.has(shop.crate.item)) throw new Error(`the Cog Shop sells ${shop.crate.item}, which is not an item`);
  return {
    rules: buildContent({
      version,
      actions,
      curve,
      monsters: all("monsters", "monsters"),
      gear: all("gear", "gear"),
      drops: listJson(join(dir, "drops")).map(readJson),
      combat: readJson(join(dir, "tuning", "combat.json")).constants,
      killTimeCap: readJson(join(dir, "tuning", "combat.json")).kill_time?.floor?.KILL_TIME_CAP_FRACTION?.value,
      storylets: listJson(join(dir, "storylets")).map(readJson),
      letters: listJson(join(dir, "letters")).map(readJson),
      workOrders: existsSync(workOrderDir) ? listJson(workOrderDir).map(readJson) : [],
      grocer: [...economy].filter(([, terms]) => terms.grocerPrice !== null).map(([item]) => item),
      shop,
    }),
    start: { inventory: start.inventory, crowns: start.crowns },
    guide: guideSteps(dir),
    ledger: new Map(ledger.map((page) => [page.item, { id: page.id, item: page.item, title: page.title, text: page.text }])),
    economy,
    items,
  };
}
