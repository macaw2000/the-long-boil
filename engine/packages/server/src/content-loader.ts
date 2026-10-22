// Loads content/ into the rules' Content. The version is a hash of every
// content file, so each event records exactly which content produced it.
// In production AWS AppConfig supplies the same files (GDD section 11).

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildContent, type Action, type Content, type CurveRow } from "@long-boil/rules";

export interface StartStack {
  item: string;
  qty: number;
  bound: boolean;
}

export interface GameContent {
  rules: Content;
  start: { inventory: StartStack[]; crowns: number };
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

  const actions: Action[] = listJson(join(dir, "actions")).flatMap((path) => readJson(path).actions);
  const curve: CurveRow[] = readJson(join(dir, "tuning", "xp-curve.json")).table;
  const start = readJson(join(dir, "start.json"));
  return {
    rules: buildContent(version, actions, curve),
    start: { inventory: start.inventory, crowns: start.crowns },
  };
}
