// The parts of content/ the rules read, already parsed and validated by
// scripts/validate/. The rules never touch the file system; a loader builds
// a Content and hands it in, so the same rules run on the server, in tests,
// and later from AWS AppConfig.

import type { CombatConstants, DropTable, Monster, Weapon } from "./combat.js";

export interface ItemStack {
  item: string;
  qty: number;
}

export interface Action {
  id: string;
  skill: string;
  level_required: number;
  seconds: number;
  xp: number;
  inputs: ItemStack[];
  outputs: ItemStack[];
}

export interface PityEntry {
  item: string;
  kills: number;
}

export interface Content {
  /** Stamped on every event, so a result can be replayed against the content that produced it. */
  version: string;
  actions: ReadonlyMap<string, Action>;
  /** totalXp[level] is the XP needed to reach that level; index 0 is unused. */
  totalXp: readonly number[];
  monsters: ReadonlyMap<string, Monster>;
  weapons: ReadonlyMap<string, Weapon>;
  drops: ReadonlyMap<string, DropTable>;
  /** Each zone's rare Ledger Pages, in reading order, on one shared pity counter (GDD section 5). */
  zonePity: ReadonlyMap<string, readonly PityEntry[]>;
  combat: CombatConstants;
  ration: { item: string; heal: number };
}

export interface CurveRow {
  level: number;
  total_xp: number;
}

export interface GearEntry {
  item: string;
  slot: string;
  style?: string;
  level_required: number;
  stats_by_calibration: ({ power?: number; accuracy?: number } | null)[];
}

export interface DropsFile {
  zone_pity: PityEntry[];
  tables: DropTable[];
}

export interface ContentSources {
  version: string;
  actions: Action[];
  curve: CurveRow[];
  monsters?: Monster[];
  gear?: GearEntry[];
  drops?: DropsFile[];
  combat?: Record<string, { value: number | null; item?: string }>;
}

function index<T>(rows: T[], key: (row: T) => string, what: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (map.has(key(row))) throw new Error(`duplicate ${what} ${key(row)}`);
    map.set(key(row), row);
  }
  return map;
}

export function buildContent(sources: ContentSources): Content {
  const totalXp: number[] = [0];
  for (const row of [...sources.curve].sort((a, b) => a.level - b.level)) {
    if (row.level !== totalXp.length) throw new Error(`XP curve has a gap at level ${totalXp.length}`);
    totalXp.push(row.total_xp);
  }

  const weapons: Weapon[] = (sources.gear ?? [])
    .filter((entry) => entry.slot === "weapon" && entry.style)
    .map((entry) => ({
      item: entry.item,
      style: entry.style!,
      level_required: entry.level_required,
      power: entry.stats_by_calibration[0]?.power ?? 0,
      accuracy: entry.stats_by_calibration[0]?.accuracy ?? 0,
    }));

  const zonePity = new Map<string, PityEntry[]>();
  const tables: DropTable[] = [];
  for (const file of sources.drops ?? []) {
    tables.push(...file.tables);
    for (const entry of file.zone_pity) {
      const zone = entry.item.split(".")[1] ?? "";
      zonePity.set(zone, [...(zonePity.get(zone) ?? []), entry]);
    }
  }

  const combat: CombatConstants = {};
  for (const [name, constant] of Object.entries(sources.combat ?? {})) {
    if (typeof constant.value === "number") combat[name] = constant.value;
  }
  const rationConstant = sources.combat?.RATION_HEAL_HP;

  return {
    version: sources.version,
    actions: index(sources.actions, (action) => action.id, "action id"),
    totalXp,
    monsters: index(sources.monsters ?? [], (monster) => monster.id, "monster id"),
    weapons: index(weapons, (weapon) => weapon.item, "weapon"),
    drops: index(tables, (table) => table.monster, "drop table for"),
    zonePity,
    combat,
    ration: { item: rationConstant?.item ?? "", heal: rationConstant?.value ?? 0 },
  };
}
