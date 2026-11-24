// Guild Contracts (work order 043): five a week for each guild, four skills
// and the fights, each asking for hours of that work. Ordinary work counts
// by itself, at the action's base seconds, so an hour at level 1 and an hour
// at level 20 count alike. These rules decide the week, the draw, the
// targets and what work counts; the server keeps the tallies.

import type { GameEvent } from "./boiler.js";
import type { Content } from "./content.js";

const DAY_MS = 86_400_000;
export const CONTRACT_WEEK_MS = 7 * DAY_MS;
/** Work is logged when its Tinker is next touched, so a week stays open this long after it ends. */
export const CONTRACT_GRACE_MS = 2 * DAY_MS;
/** Hours per full-week member for each tier. */
export const CONTRACT_TIER_HOURS = [2, 4, 8] as const;
/** Hours across the week's contracts a member needs to be paid. */
export const CONTRACT_MIN_HOURS = 2;
export const CONTRACT_SKILLS = 4;
/** The contract kind for fights; every other kind is a skill. */
export const CONTRACT_FIGHT = "fight";

/** The Monday 00:00 UTC that begins the week a moment falls in. */
export function contractWeek(at: number): number {
  // 1 January 1970 was a Thursday; the Monday after it is day 4.
  const monday = 4 * DAY_MS;
  return Math.floor((at - monday) / CONTRACT_WEEK_MS) * CONTRACT_WEEK_MS + monday;
}

/** A repeatable number from a string (FNV-1a), for drawing a guild's week. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    value ^= text.charCodeAt(at);
    value = Math.imul(value, 0x01000193);
  }
  // Mixed once more, so texts that differ only at the end do not fall in order.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return value >>> 0;
}

/** A guild's five contracts for a week: the same answer however often it is asked. */
export function drawContracts(content: Content, guildId: number, week: number): string[] {
  const skills = [...new Set([...content.actions.values()].map((action) => action.skill))];
  const order = skills.map((skill) => ({ skill, at: hash(`${guildId}:${week}:${skill}`) }));
  order.sort((a, b) => a.at - b.at || a.skill.localeCompare(b.skill));
  return [...order.slice(0, CONTRACT_SKILLS).map((entry) => entry.skill), CONTRACT_FIGHT];
}

/** Seconds of work each tier asks of a guild this size; size counts a member who joined mid-week for the part that was left. */
export function contractTargets(size: number): number[] {
  return CONTRACT_TIER_HOURS.map((hours) => Math.round(hours * 3600 * Math.max(1, size)));
}

export function tiersReached(seconds: number, size: number): number {
  return contractTargets(size).filter((target) => seconds >= target).length;
}

/** How much of a week was left when a member joined, from 0 to 1. */
export function weekShare(week: number, joinedAt: number): number {
  return Math.min(1, Math.max(0, (week + CONTRACT_WEEK_MS - joinedAt) / CONTRACT_WEEK_MS));
}

/** Base seconds of work since a moment, by week and kind. Boss attempts never count. */
export function countedWork(events: readonly GameEvent[], content: Content, since: number): Map<number, Map<string, number>> {
  const weeks = new Map<number, Map<string, number>>();
  for (const event of events) {
    if (event.at < since) continue;
    let kind: string;
    let seconds: number;
    if (event.type === "action_completed") {
      kind = event.skill;
      seconds = content.actions.get(event.actionId)?.seconds ?? 0;
    } else if (event.type === "monster_killed") {
      kind = CONTRACT_FIGHT;
      seconds = content.monsters.get(event.monsterId)?.seconds_per_kill ?? 0;
    } else continue;
    const week = contractWeek(event.at);
    const kinds = weeks.get(week) ?? new Map<string, number>();
    kinds.set(kind, (kinds.get(kind) ?? 0) + seconds);
    weeks.set(week, kinds);
  }
  return weeks;
}
