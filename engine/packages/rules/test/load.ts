// Test helper: builds Content from the real files in content/.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildContent, type Content } from "../src/index.js";

const CONTENT_DIR = join(import.meta.dirname, "../../../../content");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function all(dir: string, key: string): any[] {
  return readdirSync(join(CONTENT_DIR, dir))
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => readJson(join(CONTENT_DIR, dir, file))[key]);
}

function files(dir: string): any[] {
  return readdirSync(join(CONTENT_DIR, dir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(join(CONTENT_DIR, dir, file)));
}

export function loadRealContent(): Content {
  return buildContent({
    version: "test",
    actions: all("actions", "actions"),
    curve: readJson(join(CONTENT_DIR, "tuning", "xp-curve.json")).table,
    monsters: all("monsters", "monsters"),
    gear: all("gear", "gear"),
    drops: readdirSync(join(CONTENT_DIR, "drops"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson(join(CONTENT_DIR, "drops", file))),
    combat: readJson(join(CONTENT_DIR, "tuning", "combat.json")).constants,
    storylets: files("storylets"),
    letters: files("letters"),
  });
}
