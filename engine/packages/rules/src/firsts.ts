// Firsts (work order 049): one-off goals for a new Tinker's first hours, each
// paying a few Crowns when claimed. They give a player who stays an agenda of
// their own. Every one is read from the state as it stands, so nothing new is
// counted and a Tinker from before this list finds the ones already earned
// waiting to be claimed.

import type { Content } from "./content.js";
import type { TinkerState } from "./boiler.js";
import { COMBAT_SKILLS, COMBAT_STYLES } from "./combat.js";
import { totalLevel } from "./exchange.js";
import { levelFor } from "./xp.js";

export interface FirstsContext {
  state: TinkerState;
  content: Content;
  /** Things made, gathered or beaten (the server's jobs_done). */
  jobsDone: number;
  qualities: Readonly<Record<string, number>>;
  inGuild: boolean;
}

interface First {
  id: string;
  title: string;
  crowns: number;
  done: (context: FirstsContext) => boolean;
}

const BENCHES = ["prospecting", "smithing", "tinkering", "cooking", "scavenging", "tailoring"];

function levels(context: FirstsContext): number[] {
  return Object.values(context.state.skillXp).map((xp) => levelFor(xp, context.content));
}

function benchesTried(context: FirstsContext): number {
  return BENCHES.filter((skill) => (context.state.skillXp[skill] ?? 0) > 0).length;
}

function fought(context: FirstsContext): boolean {
  return COMBAT_SKILLS.some((skill) => (context.state.skillXp[skill] ?? 0) > 0);
}

const ORIGINS = ["flag.origin_apprentice", "flag.origin_relative", "flag.origin_stranger"];

/** In the order a new Tinker is likely to meet them. */
const FIRSTS: First[] = [
  { id: "first_job", title: "Make your first thing at the bench", crowns: 5, done: (c) => benchesTried(c) > 0 },
  { id: "origin", title: "Say why No. 9 is yours", crowns: 5, done: (c) => ORIGINS.some((flag) => c.qualities[flag]) },
  { id: "armed", title: "Take a weapon in hand", crowns: 5, done: (c) => c.state.weapon !== null },
  { id: "first_fight", title: "Beat your first Rust Rat", crowns: 5, done: fought },
  { id: "first_level", title: "Raise any skill to level 2", crowns: 5, done: (c) => levels(c).some((level) => level >= 2) },
  { id: "tube", title: "Hear the brass tube rattle", crowns: 10, done: (c) => (c.qualities["prologue.progress"] ?? 0) >= 9 },
  { id: "jobs_25", title: "Make, gather or beat 25 things", crowns: 10, done: (c) => c.jobsDone >= 25 },
  { id: "fighter_3", title: "Raise a fighting style to level 3", crowns: 10, done: (c) => COMBAT_STYLES.some((style) => levelFor(c.state.skillXp[style] ?? 0, c.content) >= 3) },
  { id: "armour", title: "Wear a piece of armour", crowns: 10, done: (c) => Object.keys(c.state.worn).length > 0 || c.state.armour !== null },
  { id: "till_100", title: "Hold 100 Crowns at once", crowns: 10, done: (c) => c.state.crowns >= 100 },
  { id: "benches_3", title: "Try three different benches", crowns: 10, done: (c) => benchesTried(c) >= 3 },
  { id: "jobs_100", title: "Make, gather or beat 100 things", crowns: 15, done: (c) => c.jobsDone >= 100 },
  { id: "tool", title: "Hold a tool for a bench", crowns: 15, done: (c) => Object.keys(c.state.tools).length > 0 },
  { id: "guild", title: "Join or found a guild", crowns: 10, done: (c) => c.inGuild },
  { id: "level_5", title: "Raise any skill to level 5", crowns: 20, done: (c) => levels(c).some((level) => level >= 5) },
  { id: "benches_6", title: "Try all six benches", crowns: 20, done: (c) => benchesTried(c) >= 6 },
  { id: "total_30", title: "Reach a total level of 30", crowns: 20, done: (c) => totalLevel(c.state.skillXp, c.content) >= 30 },
  { id: "plate", title: "Finish Your First Day", crowns: 25, done: (c) => (c.qualities["prologue.progress"] ?? 0) >= 100 },
  { id: "second_monster", title: "Beat a Rust Rat Scrounger", crowns: 25, done: (c) => c.state.firstKills.includes("monster.rustmoor.rust_rat_scrounger") },
  { id: "two_at_5", title: "Raise two skills to level 5", crowns: 25, done: (c) => levels(c).filter((level) => level >= 5).length >= 2 },
  { id: "jobs_500", title: "Make, gather or beat 500 things", crowns: 25, done: (c) => c.jobsDone >= 500 },
  { id: "bill_paid", title: "Clear Pip's bill", crowns: 40, done: (c) => (c.qualities["prologue.progress"] ?? 0) >= 10 && (c.qualities["flag.owes_back_rent"] ?? 0) === 0 },
];

export interface FirstView {
  id: string;
  title: string;
  crowns: number;
  status: "open" | "ready" | "claimed";
}

/** Every first with where it stands for this Tinker. */
export function firstsFor(context: FirstsContext, claimed: readonly string[]): FirstView[] {
  return FIRSTS.map((first) => ({
    id: first.id,
    title: first.title,
    crowns: first.crowns,
    status: claimed.includes(first.id) ? "claimed" : first.done(context) ? "ready" : "open",
  }));
}

/** The Crowns a first pays, if it is earned and not yet claimed; throws otherwise. */
export function claimFirst(context: FirstsContext, claimed: readonly string[], id: string): number {
  const first = FIRSTS.find((candidate) => candidate.id === id);
  if (!first) throw new Error(`no first ${id}`);
  if (claimed.includes(id)) throw new Error("that one is already claimed");
  if (!first.done(context)) throw new Error("that one is not done yet");
  return first.crowns;
}
