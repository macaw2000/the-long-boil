// The parts of content/ the rules read, already parsed and validated by
// scripts/validate/. The rules never touch the file system; a loader builds
// a Content and hands it in, so the same rules run on the server, in tests,
// and later from AWS AppConfig.

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

export interface Content {
  /** Stamped on every event, so a result can be replayed against the content that produced it. */
  version: string;
  actions: ReadonlyMap<string, Action>;
  /** totalXp[level] is the XP needed to reach that level; index 0 is unused. */
  totalXp: readonly number[];
}

export interface CurveRow {
  level: number;
  total_xp: number;
}

export function buildContent(version: string, actions: Action[], curve: CurveRow[]): Content {
  const byId = new Map<string, Action>();
  for (const action of actions) {
    if (byId.has(action.id)) throw new Error(`duplicate action id ${action.id}`);
    byId.set(action.id, action);
  }
  const totalXp: number[] = [0];
  for (const row of [...curve].sort((a, b) => a.level - b.level)) {
    if (row.level !== totalXp.length) throw new Error(`XP curve has a gap at level ${totalXp.length}`);
    totalXp.push(row.total_xp);
  }
  return { version, actions: byId, totalXp };
}
