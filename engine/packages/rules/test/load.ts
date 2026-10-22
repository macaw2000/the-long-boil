// Test helper: builds Content from the real files in content/.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildContent, type Action, type Content, type CurveRow } from "../src/index.js";

const CONTENT_DIR = join(import.meta.dirname, "../../../../content");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadRealContent(): Content {
  const actions: Action[] = [];
  for (const file of readdirSync(join(CONTENT_DIR, "actions"))) {
    if (file.endsWith(".json")) actions.push(...readJson(join(CONTENT_DIR, "actions", file)).actions);
  }
  const curve: CurveRow[] = readJson(join(CONTENT_DIR, "tuning", "xp-curve.json")).table;
  return buildContent("test", actions, curve);
}
