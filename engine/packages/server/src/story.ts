// The Story tab's operations (GDD section 5): reading what is open, playing
// a storylet or a letter in hand, discarding a letter, and paying the back
// rent at the Counting-House window. The rules decide; this file logs and
// saves, inside the same transaction that brings the Tinker up to now.

import * as rules from "@long-boil/rules";
import type { OptionView, Scene, StoryState, TinkerState } from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db } from "./db.js";
import { appendEvents, type LogEntry } from "./events.js";
import { advance, BadRequest, lockAndLoad, outcome, saveState, saveStory, view, type Advanced, type Outcome } from "./tinkers.js";

export interface SceneView {
  id: string;
  kind: "storylet" | "letter";
  act: number;
  location: string;
  description: string;
  nerve: number;
  sender: string | null;
  options: OptionView[];
}

export interface StoryView {
  nerve: number;
  nerveCap: number;
  nextNerveAt: string | null;
  needles: Record<string, number>;
  /** Every story quality above 0, for the character sheet. */
  qualities: Record<string, number>;
  letters: SceneView[];
  storylets: SceneView[];
  /** Next beats held back by a skill, an item or a visit, with what they need. */
  upcoming: rules.UpcomingScene[];
  /** Storylets closed by their cooldown, with when each opens again. */
  cooling: { id: string; location: string; opensAt: string }[];
  backRent: number;
  debts: { id: string; label: string; crowns: number }[];
}

function sceneView(scene: Scene, kind: "storylet" | "letter", tinker: TinkerState, story: StoryState, content: GameContent): SceneView {
  return {
    id: scene.id,
    kind,
    act: scene.act,
    location: scene.location,
    description: scene.description,
    nerve: scene.nerve,
    sender: scene.sender ?? null,
    options: scene.options.map((option) => rules.optionView(option, tinker, story, content.rules)),
  };
}

function storyView(tinker: TinkerState, story: StoryState, content: GameContent, now: number): StoryView {
  return {
    nerve: story.nerve,
    nerveCap: rules.NERVE_CAP,
    nextNerveAt: story.nerve >= rules.NERVE_CAP ? null : new Date(story.nerveAt + rules.NERVE_MS).toISOString(),
    needles: Object.fromEntries(rules.NEEDLES.map((needle) => [needle, story.qualities[needle] ?? 0])),
    qualities: Object.fromEntries(Object.entries(story.qualities).filter(([, value]) => value > 0)),
    letters: story.hand.flatMap((id) => {
      const letter = content.rules.letters.get(id);
      return letter ? [sceneView(letter, "letter", tinker, story, content)] : [];
    }),
    storylets: rules.availableStorylets(tinker, story, content.rules, now).map((scene) => sceneView(scene, "storylet", tinker, story, content)),
    upcoming: rules.upcomingStorylets(tinker, story, content.rules),
    cooling: rules
      .coolingStorylets(tinker, story, content.rules, now)
      .map((scene) => ({ id: scene.id, location: scene.location, opensAt: new Date(scene.opensAt).toISOString() })),
    backRent: rules.backRentOwed(story),
    debts: rules.debtsOwed(story).map(({ id, label, crowns }) => ({ id, label, crowns })),
  };
}

export interface StoryOutcome extends Outcome {
  view: StoryView;
  /** The outcome just played, for the result card; `roll` is the challenge's draw, for the odds dial. */
  played: { scene: string; success: boolean; text: string; odds: number | null; roll: number | null } | null;
}

interface StoryStep {
  story: StoryState;
  tinker: TinkerState;
  entries: LogEntry[];
  played: StoryOutcome["played"];
}

/**
 * Runs one story operation after bringing the Tinker up to now, then logs
 * and saves what it changed: story qualities, Nerve and the hand, and any
 * items or Crowns.
 */
async function storyOp(db: Db, content: GameContent, tinkerId: number, now: number, step: (advanced: Advanced) => StoryStep): Promise<StoryOutcome> {
  try {
    return await withTransaction(db, async (tx) => {
      const advanced = await advance(tx, content, tinkerId, now, false);
      const result = step(advanced);
      const version = content.rules.version;
      const seq = await appendEvents(tx, tinkerId, advanced.seq, result.entries, version);
      // The advance saved its own changes; read them back so the story's are saved on top.
      await saveState(tx, tinkerId, await lockAndLoad(tx, tinkerId), result.tinker, seq, version);
      await saveStory(tx, tinkerId, advanced.story, result.story);
      const done = outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents);
      return { ...done, view: storyView(result.tinker, result.story, content, now), played: result.played };
    });
  } catch (error) {
    if (error instanceof rules.StoryRefusal) throw new BadRequest(error.message);
    throw error;
  }
}

/** The Story tab: brings the Tinker up to now and lists what is open. */
export async function readStory(db: Db, content: GameContent, tinkerId: number, now: number): Promise<StoryOutcome> {
  return storyOp(db, content, tinkerId, now, ({ state, story }) => ({ story, tinker: state, entries: [], played: null }));
}

/** Plays one option of a storylet, or of a letter in hand. */
export async function playStory(
  db: Db,
  content: GameContent,
  tinkerId: number,
  kind: "storylet" | "letter",
  sceneId: string,
  option: number,
  now: number,
): Promise<StoryOutcome> {
  return storyOp(db, content, tinkerId, now, ({ state, story }) => {
    const played = rules.playScene(story, state, content.rules, kind, sceneId, option, now);
    const inventory = { ...played.tinker.inventory };
    for (const [item, delta] of Object.entries(played.event.type === "scene_played" ? played.event.items : {})) {
      inventory[item] = (inventory[item] ?? 0) + delta;
      if (inventory[item] === 0) delete inventory[item];
    }
    const event = played.event;
    return {
      story: played.story,
      tinker: { ...played.tinker, inventory },
      entries: [{ type: event.type, at: event.at, payload: event }],
      played: {
        scene: sceneId,
        success: event.type === "scene_played" ? event.success : true,
        text: played.outcome.text,
        odds: event.type === "scene_played" && event.challenge ? event.challenge.odds : null,
        roll: event.type === "scene_played" && event.challenge ? event.challenge.roll : null,
      },
    };
  });
}

/** Discards a letter in hand, for free. */
export async function discardLetter(db: Db, content: GameContent, tinkerId: number, letterId: string, now: number): Promise<StoryOutcome> {
  return storyOp(db, content, tinkerId, now, ({ state, story }) => {
    const discarded = rules.discardLetter(story, letterId, now);
    return { story: discarded.story, tinker: state, entries: [{ type: discarded.event.type, at: now, payload: discarded.event }], played: null };
  });
}

/** Pays a story debt at the Counting-House window and clears its flags (work orders 016 and 018). */
export async function payDebt(db: Db, content: GameContent, tinkerId: number, debtId: string, now: number): Promise<StoryOutcome> {
  return storyOp(db, content, tinkerId, now, ({ state, story }) => {
    const { story: paid, debt } = rules.payDebt(story, debtId);
    if (state.crowns < debt.crowns) throw new BadRequest(`${debt.label} is ${debt.crowns} Crowns; you have ${state.crowns}`);
    return {
      story: paid,
      tinker: { ...state, crowns: state.crowns - debt.crowns },
      entries: [
        {
          type: "debt_paid",
          at: now,
          payload: { debt: debt.id, crowns: -debt.crowns, items: {}, qualities: Object.fromEntries(debt.clears.map((flag) => [flag, 0])) },
        },
      ],
      played: null,
    };
  });
}
