import type { Content } from "./content.js";

/** The highest level whose total XP the given XP reaches. */
export function levelFor(xp: number, content: Content): number {
  const table = content.totalXp;
  let lo = 1;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((table[mid] ?? Infinity) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
