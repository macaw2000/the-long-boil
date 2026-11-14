// What a level gave, in one line for the level-up banner: the jobs or gear it
// opens where it opens any, what is next where it does not, and for a combat
// skill with nothing new to hold, what the skill does in a fight (GDD section
// 6, Skills). A level that says nothing reads as a number going up.

import { zoneOpen } from "@long-boil/rules";
import type { Content, Tinker } from "./api";
import { jobTitle } from "./jobs";

const DOES: Record<string, string> = {
  melee: "Your close blows land harder.",
  marksmanship: "Your shots land harder.",
  aetherics: "Your sparks land harder.",
  vitality: "More hit points: you last longer in a fight.",
  fortitude: "Every bite hurts a little less.",
  pressure: "Every hit lands a little harder, whatever you hold.",
  precision: "Truer aim, and more crits.",
};

function some(names: string[]): string {
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and ");
}

export function levelLine(skill: string, level: number, content: Content, tinker: Tinker, name: (id: string) => string): string {
  const open = (id: string) => zoneOpen(id, tinker.story.qualities);
  const jobs = content.actions.filter((action) => action.skill === skill && open(action.id));
  if (jobs.length > 0) {
    const now = jobs.filter((action) => action.level_required === level).map((action) => jobTitle(content, action.id, name));
    if (now.length > 0) return `New at the bench: ${some(now)}.`;
    const next = jobs.filter((action) => action.level_required > level).sort((a, b) => a.level_required - b.level_required)[0];
    return next ? `Next: ${jobTitle(content, next.id, name)} at level ${next.level_required}.` : "The bench has nothing left to teach you here.";
  }
  const weapons = content.weapons.filter((weapon) => weapon.style === skill && weapon.level_required === level && open(weapon.item)).map((weapon) => name(weapon.item));
  if (weapons.length > 0) return `You can now fight with: ${some(weapons)}.`;
  return DOES[skill] ?? "";
}
