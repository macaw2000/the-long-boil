// The story engine (GDD section 5, Narrative Systems; section 10, Story
// engine): qualities, requirements, challenge odds, Nerve, the Needles and
// the Pneumatic Post. Pure: the server stores what these functions return,
// and rolls use the Tinker's own seeded generator, so every story result
// is replayable from the event log.

import type { TinkerState } from "./boiler.js";
import { nextRandom } from "./combat.js";
import type { Content } from "./content.js";
import { levelFor } from "./xp.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** GDD section 5, Nerve: "caps at 10, refills by 1 every 36 minutes". */
export const NERVE_CAP = 10;
export const NERVE_MS = 36 * MINUTE_MS;
/** GDD section 5, The Four Needles: each "falls by 1 every 24 hours on its own". */
export const NEEDLE_FALL_MS = 24 * HOUR_MS;
export const NEEDLES = ["needle.scald", "needle.arrears", "needle.notice", "needle.haze"] as const;

/** Set the first time a scene moves a Needle, so the Needle stays on screen after it falls back to 0. */
export const needleMoved = (needle: string) => `record.moved.${needle}`;

/**
 * The Needles a player can see, with their readings. Each stays hidden until
 * a scene first moves it (docs/first-day-plan.md, decision 5): a new player
 * met all three at 0/8 with nothing to explain them. Haze also shows from Act
 * II, when the Whistle brings it in (GDD section 4, Act II beat 2).
 */
export function visibleNeedles(qualities: Readonly<Record<string, number>>): Record<string, number> {
  const shown = NEEDLES.filter(
    (needle) =>
      (qualities[needle] ?? 0) > 0 || (qualities[needleMoved(needle)] ?? 0) > 0 || (needle === "needle.haze" && (qualities["act2.progress"] ?? 0) > 0),
  );
  return Object.fromEntries(shown.map((needle) => [needle, qualities[needle] ?? 0]));
}
/** GDD section 5, The Pneumatic Post: "You hold up to 3, and a new one arrives every 2 hours". */
export const HAND_SIZE = 3;
export const POST_MS = 2 * HOUR_MS;
/**
 * A check-in counts as a new visit for record.check_ins when it comes at
 * least an hour after the last counted one, so a reload is not a visit.
 * (The hour is an engine choice; the registry says only that the engine counts.)
 */
export const VISIT_GAP_MS = HOUR_MS;
export const CHECK_INS = "record.check_ins";
/**
 * Hester's back rent: a year's, at 350 a quarter, so one night of fighting does not cover it and
 * selling at the Counting-House matters (work order 037, decision 8; the draftsman's derivation is
 * the back_rent anchor in content/tuning/economy-rustmoor.json). The repair takes 80 off for 10 Rat Scrap.
 */
export const BACK_RENT = 1400;
export const BACK_RENT_REDUCTION = 80;
/**
 * Work order 020: a stay at the Infirmary of St. Pinion. While the flag is
 * set, the story offers only Infirmary scenes and Scald does not fall on its
 * own; letters still arrive, and the workshop is untouched (GDD section 5).
 */
export const INFIRMARY_FLAG = "flag.in_st_pinion";
export const INFIRMARY = "infirmary";

export function inInfirmary(story: StoryState): boolean {
  return (story.qualities[INFIRMARY_FLAG] ?? 0) === 1;
}

/**
 * Redlined Scald or a stay at St. Pinion's: the story sends the Tinker to the
 * Infirmary (GDD section 5, "At 8, the Needle is redlined and the story sends
 * you somewhere you would rather not be"), and Scald holds until discharge.
 */
export function heldAtInfirmary(story: StoryState): boolean {
  return inInfirmary(story) || (story.qualities["needle.scald"] ?? 0) >= 8;
}

/** While held, only the Infirmary's own scenes are open. */
function openDuringStay(scene: Scene, story: StoryState): boolean {
  return !heldAtInfirmary(story) || scene.location === INFIRMARY;
}

/** Work order 018: Tallow's Foundry Pass goes on the account at 600 Crowns (from GDD appendix A.2). */
export const FOUNDRY_PASS_DEBT = 600;

/**
 * Skills that open with the story rather than on day one. None today:
 * Tailoring opened with the Foundry Pass until work order 032 gave it a
 * Rustmoor ladder and opened it on day one (Jeremy, 30 October 2026).
 */
export const SKILL_GATES: Readonly<Record<string, { quality: string; at: number; reason: string }>> = {};

/**
 * Zones that open with the story, by the zone in an id's second part
 * (GDD section 6: "Entering a new zone needs the level and a pass from the
 * previous act, and every road through the act provides one"). Every road
 * through Act I's act1.brass_exchange.foundry_pass sets act1.progress to 80
 * (work order 033).
 */
export const ZONE_GATES: Readonly<Record<string, { quality: string; at: number; reason: string }>> = {
  cinderworks: { quality: "act1.progress", at: 80, reason: "The Cinderworks opens with the Foundry Pass, earned in the story near the end of Act I" },
};

/** The gate on the zone an action, monster or item id belongs to, if it has one. */
export function zoneGate(id: string): { quality: string; at: number; reason: string } | null {
  return ZONE_GATES[id.split(".")[1] ?? ""] ?? null;
}

/** Whether the zone an action or monster id belongs to is open to a Tinker with these story qualities. */
export function zoneOpen(id: string, qualities: Readonly<Record<string, number>>): boolean {
  const gate = zoneGate(id);
  return !gate || (qualities[gate.quality] ?? 0) >= gate.at;
}

/** Whether a skill is open to a Tinker with these story qualities. */
export function skillOpen(skill: string, qualities: Readonly<Record<string, number>>): boolean {
  const gate = SKILL_GATES[skill];
  return !gate || (qualities[gate.quality] ?? 0) >= gate.at;
}

export type Requires = Record<string, string>;
export type Changes = Record<string, string | number>;

export interface Outcome {
  text: string;
  changes: Changes;
}

export interface StoryOption {
  label: string;
  requires?: Requires;
  challenge?: { quality: string; difficulty: number };
  success: Outcome;
  failure?: Outcome;
}

/** A storylet or a letter (storylet/1, letter/1). */
export interface Scene {
  id: string;
  act: number;
  location: string;
  requires: Requires;
  nerve: number;
  description: string;
  options: StoryOption[];
  /** Storylets only: once played, closed this long (work order 019). */
  cooldown_hours?: number;
  /** Letters only. */
  sender?: string;
  weight?: number;
}

export interface StoryState {
  /** Every story quality that is not a skill, an item or Nerve; absent means 0. */
  qualities: Record<string, number>;
  nerve: number;
  /** When the next point of Nerve started accruing. */
  nerveAt: number;
  /** Per Needle above 0: when its current 24-hour fall started. */
  needleAt: Record<string, number>;
  /** Letter ids in hand, oldest first. */
  hand: string[];
  /** When the Post's current 2-hour interval started. */
  postAt: number;
  /** When the last counted visit began, or null before the first. */
  checkInAt: number | null;
  /** Letters answered; they never return to the deck (work order 018). */
  answered: string[];
  /** When each storylet with a cooldown was last played. */
  playedAt: Record<string, number>;
  /** The Nerve cap, raised by the Cog Shop's Night Lamp (GDD section 8); absent means NERVE_CAP. */
  nerveCap?: number;
}

/** A Tinker's Nerve cap. */
export function nerveCapOf(story: StoryState): number {
  return story.nerveCap ?? NERVE_CAP;
}

export type StoryEvent =
  | { type: "letter_arrived"; at: number; letter: string }
  | { type: "needle_fell"; at: number; needle: string; value: number }
  | {
      type: "scene_played";
      at: number;
      kind: "storylet" | "letter";
      scene: string;
      option: number;
      nerve: number;
      challenge: { quality: string; level: number; difficulty: number; odds: number; roll: number } | null;
      success: boolean;
      /** Each changed quality's new value. */
      qualities: Record<string, number>;
      items: Record<string, number>;
      crowns: number;
    }
  | { type: "letter_discarded"; at: number; letter: string }
  | { type: "check_in_counted"; at: number; qualities: Record<string, number> };

/** A fresh Tinker's story: full Nerve, and Pip's first letter already in the tube. */
export function newStory(now: number): StoryState {
  return { qualities: {}, nerve: NERVE_CAP, nerveAt: now, needleAt: {}, hand: [], postAt: now - POST_MS, checkInAt: null, answered: [], playedAt: {} };
}

export function cloneStory(story: StoryState): StoryState {
  return { ...story, qualities: { ...story.qualities }, needleAt: { ...story.needleAt }, hand: [...story.hand], answered: [...story.answered], playedAt: { ...story.playedAt } };
}

const RANGES: [string, number, number][] = [
  ["needle.", 0, 8],
  ["favour.", 0, 7],
  ["flag.", 0, 1],
  ["lore.", 0, 24],
  ["ambition.", 0, 100],
];

/** A story quality's range (docs/canon/qualities.json types). */
export function rangeOf(name: string): [number, number] {
  for (const [prefix, min, max] of RANGES) if (name.startsWith(prefix)) return [min, max];
  if (name.endsWith(".progress")) return [0, 100];
  return [0, Number.MAX_SAFE_INTEGER];
}

/** Any quality's current value: a skill's level, an item's count, Nerve, or a story quality. */
export function qualityOf(name: string, tinker: TinkerState, story: StoryState, content: Content): number {
  if (name === "nerve") return story.nerve;
  if (name.startsWith("item.")) return tinker.inventory[name] ?? 0;
  if (!name.includes(".")) return levelFor(tinker.skillXp[name] ?? 0, content);
  return story.qualities[name] ?? 0;
}

const CONDITION = /^(>=|<=|==|>|<)(\d+)$/;

export function meets(condition: string, value: number): boolean {
  const match = CONDITION.exec(condition);
  if (!match) throw new Error(`bad condition ${condition}`);
  const target = Number(match[2]);
  switch (match[1]) {
    case ">=":
      return value >= target;
    case "<=":
      return value <= target;
    case "==":
      return value === target;
    case ">":
      return value > target;
    default:
      return value < target;
  }
}

/** The requirements not met, as [quality, condition, current value]. */
export function unmet(requires: Requires | undefined, tinker: TinkerState, story: StoryState, content: Content): [string, string, number][] {
  return Object.entries(requires ?? {})
    .map(([name, condition]): [string, string, number] => [name, condition, qualityOf(name, tinker, story, content)])
    .filter(([, condition, value]) => !meets(condition, value));
}

/** GDD section 5: P(success) = min(1, max(0.1, 0.6 x skill / difficulty)). */
export function odds(skill: number, difficulty: number): number {
  return Math.min(1, Math.max(0.1, (0.6 * skill) / difficulty));
}

/** Nerve as of `now`, with the time the next point started accruing. */
function regainNerve(story: StoryState, now: number) {
  const cap = nerveCapOf(story);
  if (story.nerve >= cap) {
    story.nerveAt = Math.max(story.nerveAt, now);
    return;
  }
  const gained = Math.floor((now - story.nerveAt) / NERVE_MS);
  if (gained <= 0) return;
  story.nerve = Math.min(cap, story.nerve + gained);
  story.nerveAt = story.nerve >= cap ? now : story.nerveAt + gained * NERVE_MS;
}

function random(tinker: TinkerState): number {
  const [value, next] = nextRandom(tinker.rng);
  tinker.rng = next;
  return value;
}

/**
 * Letters the Post can deal: requirements hold, not already in hand, and
 * never answered. A discarded letter returns; an answered one does not.
 */
export function drawable(tinker: TinkerState, story: StoryState, content: Content): Scene[] {
  return [...content.letters.values()].filter(
    (letter) =>
      !story.hand.includes(letter.id) && !story.answered.includes(letter.id) && unmet(letter.requires, tinker, story, content).length === 0,
  );
}

/**
 * Brings the story up to `now`: Nerve refills, Needles fall, and the Post
 * delivers. Draws use the Tinker's generator, so the Tinker state changes too.
 */
export function refreshStory(previous: StoryState, previousTinker: TinkerState, content: Content, now: number) {
  const story = cloneStory(previous);
  const tinker = { ...previousTinker };
  const events: StoryEvent[] = [];

  regainNerve(story, now);

  for (const needle of NEEDLES) {
    const value = story.qualities[needle] ?? 0;
    const since = story.needleAt[needle];
    if (value <= 0 || since === undefined) continue;
    // Redline and a stay at St. Pinion's hold Scald where it is until the Tinker is discharged.
    if (needle === "needle.scald" && heldAtInfirmary(story)) continue;
    const falls = Math.min(value, Math.floor((now - since) / NEEDLE_FALL_MS));
    for (let i = 1; i <= falls; i++) events.push({ type: "needle_fell", at: since + i * NEEDLE_FALL_MS, needle, value: value - i });
    story.qualities[needle] = value - falls;
    if (story.qualities[needle] === 0) delete story.needleAt[needle];
    else story.needleAt[needle] = since + falls * NEEDLE_FALL_MS;
  }

  // A Prologue letter is a step in the first day's plan (docs/first-day-plan.md), so it
  // comes the moment it opens instead of waiting up to two hours for the next delivery.
  for (const letter of drawable(tinker, story, content).filter((candidate) => candidate.act === 0)) {
    if (story.hand.length >= HAND_SIZE) break;
    story.hand.push(letter.id);
    events.push({ type: "letter_arrived", at: now, letter: letter.id });
  }

  // A full hand does not bank deliveries; the tube starts again when a letter goes.
  while (story.postAt + POST_MS <= now) {
    if (story.hand.length >= HAND_SIZE) {
      story.postAt = now;
      break;
    }
    story.postAt += POST_MS;
    const deck = drawable(tinker, story, content);
    const total = deck.reduce((sum, letter) => sum + (letter.weight ?? 1), 0);
    if (total <= 0) continue;
    let pick = random(tinker) * total;
    const letter = deck.find((candidate) => (pick -= candidate.weight ?? 1) < 0) ?? deck[deck.length - 1]!;
    story.hand.push(letter.id);
    events.push({ type: "letter_arrived", at: story.postAt, letter: letter.id });
  }

  return { story, tinker, events };
}

export class StoryRefusal extends Error {}

export interface OptionView {
  label: string;
  available: boolean;
  /** Unmet requirements, for a locked option. */
  locked: [string, string, number][];
  /** For a challenge: the skill, its level, the difficulty and the odds shown before committing. */
  challenge: { quality: string; level: number; difficulty: number; odds: number } | null;
}

export function optionView(option: StoryOption, tinker: TinkerState, story: StoryState, content: Content): OptionView {
  const locked = unmet(option.requires, tinker, story, content);
  const challenge = option.challenge
    ? (() => {
        const level = qualityOf(option.challenge.quality, tinker, story, content);
        return { quality: option.challenge.quality, level, difficulty: option.challenge.difficulty, odds: odds(level, option.challenge.difficulty) };
      })()
    : null;
  return { label: option.label, available: locked.length === 0, locked, challenge };
}

/** A requirement the player works toward through play: a skill, an item, or a record such as visits. */
function earned(name: string): boolean {
  return !name.includes(".") || name.startsWith("item.") || name.startsWith("record.");
}

/** When a storylet's cooldown ends, or null when it is not cooling down. */
export function coolsUntil(scene: Scene, story: StoryState, now: number): number | null {
  const played = story.playedAt[scene.id];
  if (!scene.cooldown_hours || played === undefined) return null;
  const until = played + scene.cooldown_hours * HOUR_MS;
  return until > now ? until : null;
}

export interface UpcomingScene {
  id: string;
  location: string;
  /** The requirements still unmet, all of them skills, items or records. */
  needs: [string, string, number][];
}

/**
 * Storylets that are next in the story but held back by a skill, an item or
 * a visit: every story requirement holds and only earned ones are unmet, so
 * a locked beat can show its gate without being spoiled.
 */
export function upcomingStorylets(tinker: TinkerState, story: StoryState, content: Content): UpcomingScene[] {
  // A Prologue letter is a step in the first day (it comes the moment it opens), so it counts as coming up too.
  const prologueLetters = [...content.letters.values()].filter(
    (letter) => letter.act === 0 && !story.hand.includes(letter.id) && !story.answered.includes(letter.id),
  );
  return [...content.storylets.values(), ...prologueLetters].flatMap((scene): UpcomingScene[] => {
    const needs = unmet(scene.requires, tinker, story, content);
    return openDuringStay(scene, story) && needs.length > 0 && needs.every(([name]) => earned(name))
      ? [{ id: scene.id, location: scene.location, needs }]
      : [];
  });
}

/** The nearest skill level alone holding back a scene: the one a goal line can honestly point at. */
export function nextSkillGate(tinker: TinkerState, story: StoryState, content: Content): { skill: string; level: number } | null {
  const gates = upcomingStorylets(tinker, story, content).flatMap(({ id, needs }) => {
    // Visits pass by themselves; a second skill or an item is not one line's work.
    const earnedByWork = needs.filter(([name]) => !name.startsWith("record."));
    const [need] = earnedByWork;
    if (earnedByWork.length !== 1 || !need || need[0].includes(".")) return [];
    const level = Number(need[1].replace(/[^0-9]/g, ""));
    const spine = content.storylets.get(id)?.requires["act1.progress"] !== undefined;
    return [{ skill: need[0], level, gap: level - need[2], spine }];
  });
  // The main story's gates first: a side scene should not send a player off training.
  gates.sort((a, b) => Number(b.spine) - Number(a.spine) || a.gap - b.gap || a.skill.localeCompare(b.skill));
  const nearest = gates[0];
  return nearest ? { skill: nearest.skill, level: nearest.level } : null;
}

/** Storylets the Tinker can see now: every one whose requirements hold and that is not cooling down. */
export function availableStorylets(tinker: TinkerState, story: StoryState, content: Content, now = Number.NEGATIVE_INFINITY): Scene[] {
  return [...content.storylets.values()].filter(
    (scene) => openDuringStay(scene, story) && unmet(scene.requires, tinker, story, content).length === 0 && coolsUntil(scene, story, now) === null,
  );
}

/**
 * During a stay at St. Pinion's, when the Tinker can next play a ward scene:
 * now if one is open and Nerve covers it, else the earliest moment one is off
 * its cooldown with the Nerve for it. Null when not held, or when no ward
 * scene will open without something else changing.
 */
export function wardOpensAt(tinker: TinkerState, story: StoryState, content: Content, now: number): number | null {
  if (!heldAtInfirmary(story)) return null;
  const nerveFor = (need: number) => (story.nerve >= need ? now : story.nerveAt + (need - story.nerve) * NERVE_MS);
  const times = [...content.storylets.values()]
    .filter((scene) => scene.location === INFIRMARY && unmet(scene.requires, tinker, story, content).length === 0)
    .map((scene) => Math.max(now, coolsUntil(scene, story, now) ?? now, nerveFor(scene.nerve)));
  return times.length > 0 ? Math.min(...times) : null;
}

/** Storylets open but for their cooldown, with when each opens again. */
export function coolingStorylets(tinker: TinkerState, story: StoryState, content: Content, now: number): { id: string; location: string; opensAt: number }[] {
  return [...content.storylets.values()].flatMap((scene) => {
    const until = coolsUntil(scene, story, now);
    return until !== null && openDuringStay(scene, story) && unmet(scene.requires, tinker, story, content).length === 0
      ? [{ id: scene.id, location: scene.location, opensAt: until }]
      : [];
  });
}

/**
 * Plays one option of a storylet or a letter in hand: checks requirements and
 * Nerve, spends it, rolls a challenge, and applies the outcome's changes.
 * Item changes come back as deltas for the caller to apply to the inventory.
 */
export function playScene(
  previous: StoryState,
  previousTinker: TinkerState,
  content: Content,
  kind: "storylet" | "letter",
  sceneId: string,
  optionIndex: number,
  now: number,
) {
  const scene = (kind === "storylet" ? content.storylets : content.letters).get(sceneId);
  if (!scene) throw new StoryRefusal(`no ${kind} ${sceneId}`);
  if (kind === "letter" && !previous.hand.includes(sceneId)) throw new StoryRefusal(`${sceneId} is not in your hand`);
  // A letter's requirements decide when it is dealt; once in hand, only its options' own requirements apply (work order 018).
  if (kind === "storylet" && unmet(scene.requires, previousTinker, previous, content).length) {
    throw new StoryRefusal(`${sceneId} is not open to you now`);
  }
  if (kind === "storylet" && coolsUntil(scene, previous, now) !== null) throw new StoryRefusal(`${sceneId} is closed until later`);
  if (kind === "storylet" && !openDuringStay(scene, previous)) throw new StoryRefusal("you are at St. Pinion's until you are discharged");
  const option = scene.options[optionIndex];
  if (!option) throw new StoryRefusal(`${sceneId} has no option ${optionIndex}`);
  if (unmet(option.requires, previousTinker, previous, content).length) throw new StoryRefusal("that option is not open to you");
  if (previous.nerve < scene.nerve) throw new StoryRefusal(`that needs ${scene.nerve} Nerve; you have ${previous.nerve}`);

  const story = cloneStory(previous);
  const tinker = { ...previousTinker };
  if (story.nerve >= nerveCapOf(story)) story.nerveAt = now;
  story.nerve -= scene.nerve;

  let success = true;
  let challenge: Extract<StoryEvent, { type: "scene_played" }>["challenge"] = null;
  if (option.challenge) {
    const level = qualityOf(option.challenge.quality, tinker, story, content);
    const chance = odds(level, option.challenge.difficulty);
    const roll = random(tinker);
    success = roll < chance;
    challenge = { quality: option.challenge.quality, level, difficulty: option.challenge.difficulty, odds: chance, roll };
  }
  const outcome = success ? option.success : option.failure!;

  const qualities: Record<string, number> = {};
  const items: Record<string, number> = {};
  for (const [name, change] of Object.entries(outcome.changes)) {
    if (name.startsWith("item.")) {
      const held = tinker.inventory[name] ?? 0;
      const next = typeof change === "number" ? change : Math.max(0, held + Number(change));
      if (next !== held) items[name] = next - held;
      continue;
    }
    if (!name.includes(".") || name === "nerve" || name.startsWith("record.")) throw new StoryRefusal(`a story outcome cannot set ${name}`);
    const [min, max] = rangeOf(name);
    const before = story.qualities[name] ?? 0;
    const next = Math.min(max, Math.max(min, typeof change === "number" ? change : before + Number(change)));
    story.qualities[name] = next;
    qualities[name] = next;
    if (name.startsWith("needle.")) {
      // In the event's qualities too, so a replay of the log rebuilds it.
      if (next !== before) story.qualities[needleMoved(name)] = qualities[needleMoved(name)] = 1;
      if (next > before) story.needleAt[name] = now;
      if (next === 0) delete story.needleAt[name];
    }
  }
  if (kind === "letter") {
    story.hand = story.hand.filter((id) => id !== sceneId);
    story.answered.push(sceneId);
  }
  if (kind === "storylet" && scene.cooldown_hours) story.playedAt[sceneId] = now;
  // Discharged: Scald's daily fall starts counting again from now.
  if (inInfirmary(previous) && !inInfirmary(story) && (story.qualities["needle.scald"] ?? 0) > 0) story.needleAt["needle.scald"] = now;

  const event: StoryEvent = { type: "scene_played", at: now, kind, scene: sceneId, option: optionIndex, nerve: scene.nerve, challenge, success, qualities, items, crowns: 0 };
  return { story, tinker, event, outcome };
}

/** Discards a letter in hand. Free; the letter returns to the deck while its requirements hold. */
export function discardLetter(previous: StoryState, letterId: string, now: number) {
  if (!previous.hand.includes(letterId)) throw new StoryRefusal(`${letterId} is not in your hand`);
  const story = cloneStory(previous);
  story.hand = story.hand.filter((id) => id !== letterId);
  // A full hand had stopped the tube; it starts again from now.
  if (previous.hand.length >= HAND_SIZE) story.postAt = now;
  const event: StoryEvent = { type: "letter_discarded", at: now, letter: letterId };
  return { story, event };
}

/** Visits counted since the Prologue's last scene, which is what opens Act I (work order 037: the Prologue now spans three visits). */
export const VISITS_SINCE_PROLOGUE = "record.visits_since_prologue";
const ORIGINS = ["flag.origin_apprentice", "flag.origin_relative", "flag.origin_stranger"];

/** Counts a check-in as a visit when it is the first, or an hour or more after the last counted one. */
export function countCheckIn(previous: StoryState, now: number): { story: StoryState; event: StoryEvent | null } {
  if (previous.checkInAt !== null && now - previous.checkInAt < VISIT_GAP_MS) return { story: previous, event: null };
  const story = cloneStory(previous);
  story.checkInAt = now;
  story.qualities[CHECK_INS] = (story.qualities[CHECK_INS] ?? 0) + 1;
  const qualities: Record<string, number> = { [CHECK_INS]: story.qualities[CHECK_INS] };
  if ((story.qualities["prologue.progress"] ?? 0) >= 100) {
    // A Tinker who finished the one-visit Prologue before work order 037 never chose an origin; its visits since are all but the first.
    const before = story.qualities[VISITS_SINCE_PROLOGUE] ?? (ORIGINS.some((flag) => story.qualities[flag]) ? 0 : story.qualities[CHECK_INS] - 2);
    story.qualities[VISITS_SINCE_PROLOGUE] = qualities[VISITS_SINCE_PROLOGUE] = before + 1;
  }
  return { story, event: { type: "check_in_counted", at: now, qualities } };
}

export interface Debt {
  id: "back_rent" | "foundry_pass";
  label: string;
  crowns: number;
  /** The flags paying it sets back to 0. */
  clears: string[];
}

/** Crown debts the story has run up, paid at the Counting-House window. */
export function debtsOwed(story: StoryState): Debt[] {
  const debts: Debt[] = [];
  const rent = backRentOwed(story);
  if (rent > 0) debts.push({ id: "back_rent", label: "Pip's bill for the back rent", crowns: rent, clears: ["flag.owes_back_rent"] });
  if ((story.qualities["flag.owes_foundry_pass"] ?? 0) === 1) {
    debts.push({ id: "foundry_pass", label: "Tallow's account for the Foundry Pass", crowns: FOUNDRY_PASS_DEBT, clears: ["flag.owes_foundry_pass"] });
  }
  return debts;
}

/** Settles one debt: clears its flags. The caller takes the Crowns. Needles are left to fall on their own. */
export function payDebt(previous: StoryState, debtId: string): { story: StoryState; debt: Debt } {
  const debt = debtsOwed(previous).find((candidate) => candidate.id === debtId);
  if (!debt) throw new StoryRefusal(`nothing is owed for ${debtId}`);
  const story = cloneStory(previous);
  for (const flag of debt.clears) story.qualities[flag] = 0;
  return { story, debt };
}

/** What the back rent still costs (work order 016): 0 when nothing is owed. */
export function backRentOwed(story: StoryState): number {
  if ((story.qualities["flag.owes_back_rent"] ?? 0) !== 1) return 0;
  return (story.qualities["flag.back_rent_reduced"] ?? 0) === 1 ? BACK_RENT - BACK_RENT_REDUCTION : BACK_RENT;
}
