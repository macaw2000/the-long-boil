import type { Content } from "./api";

export function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

export function seconds(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`;
}

/** Display names for every id the client shows: items, monsters and actions. */
export function namer(content: Content) {
  const names = new Map<string, string>();
  for (const item of content.items) names.set(item.id, item.name);
  for (const monster of content.monsters) names.set(monster.id, monster.name);
  for (const action of content.actions) {
    const verb = action.id.split(".")[2]?.split("_")[0] ?? "";
    const product = action.outputs[0] ? names.get(action.outputs[0].item) : undefined;
    names.set(action.id, product ? `${titleCase(verb)} ${product}` : action.id);
  }
  return (id: string) => names.get(id) ?? id;
}

/** XP into the current level and the size of that level, from the curve's totals. */
export function levelProgress(content: Content, xp: number, level: number): { into: number; span: number } | null {
  const floor = content.totalXp[level];
  const next = content.totalXp[level + 1];
  if (floor === undefined || next === undefined) return null;
  return { into: xp - floor, span: next - floor };
}
