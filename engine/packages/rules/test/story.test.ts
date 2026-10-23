import { describe, expect, it } from "vitest";
import {
  NERVE_CAP,
  backRentOwed,
  countCheckIn,
  debtsOwed,
  upcomingStorylets,
  payDebt,
  discardLetter,
  meets,
  newStory,
  newTinker,
  odds,
  optionView,
  playScene,
  qualityOf,
  refreshStory,
  availableStorylets,
  type StoryState,
  type TinkerState,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const LETTER = "prologue.sprocket_row.back_rent";

function fresh(seed = 1): { tinker: TinkerState; story: StoryState } {
  return { tinker: newTinker({}, 0, 0, seed), story: newStory(0) };
}

describe("qualities and requirements", () => {
  it("reads skills as levels, items as counts, and everything else from the story", () => {
    const tinker = newTinker({ "item.rustmoor.copper": 7 }, 0, 0, 1);
    tinker.skillXp.tinkering = 450;
    const story = { ...newStory(0), qualities: { "act1.progress": 15 } };
    expect(qualityOf("tinkering", tinker, story, content)).toBe(3);
    expect(qualityOf("smithing", tinker, story, content)).toBe(1);
    expect(qualityOf("item.rustmoor.copper", tinker, story, content)).toBe(7);
    expect(qualityOf("act1.progress", tinker, story, content)).toBe(15);
    expect(qualityOf("flag.own_reading", tinker, story, content)).toBe(0);
    expect(qualityOf("nerve", tinker, story, content)).toBe(NERVE_CAP);
  });

  it("evaluates every condition form", () => {
    expect([meets(">=3", 3), meets(">3", 3), meets("==0", 0), meets("<=2", 3), meets("<1", 0)]).toEqual([true, false, true, false, true]);
  });

  it("uses the GDD's odds: 60% at par, a 10% floor, certain at 5/3 of the difficulty", () => {
    expect(odds(15, 15)).toBeCloseTo(0.6);
    expect(odds(1, 20)).toBe(0.1);
    expect(odds(25, 15)).toBe(1);
    expect(odds(3, 4)).toBeCloseTo(0.45);
  });
});

describe("Nerve", () => {
  it("refills 1 every 36 minutes up to 10, offline too", () => {
    const { tinker, story } = fresh();
    let { story: spent } = playScene(refreshStory(story, tinker, content, 0).story, tinker, content, "letter", LETTER, 0, 0);
    expect(spent.nerve).toBe(9);
    expect(refreshStory(spent, tinker, content, 35 * MINUTE).story.nerve).toBe(9);
    expect(refreshStory(spent, tinker, content, 36 * MINUTE).story.nerve).toBe(10);
    expect(refreshStory(spent, tinker, content, 100 * HOUR).story.nerve).toBe(10);
  });

  it("refuses a scene without enough Nerve", () => {
    const { tinker } = fresh();
    const story = { ...newStory(0), nerve: 0, hand: [LETTER] };
    expect(() => playScene(story, tinker, content, "letter", LETTER, 0, 0)).toThrow(/needs 1 Nerve/);
  });
});

describe("the Pneumatic Post", () => {
  it("delivers Pip's bill at once to a new Tinker", () => {
    const { tinker, story } = fresh();
    const { story: after, events } = refreshStory(story, tinker, content, 0);
    expect(after.hand).toEqual([LETTER]);
    expect(events).toEqual([{ type: "letter_arrived", at: 0, letter: LETTER }]);
  });

  it("never deals a letter twice into one hand, nor one whose requirements fail", () => {
    const { tinker, story } = fresh();
    const { story: after } = refreshStory(story, tinker, content, 12 * HOUR);
    expect(after.hand).toEqual([LETTER]);
    const answered = playScene(after, tinker, content, "letter", LETTER, 0, 12 * HOUR).story;
    expect(refreshStory(answered, tinker, content, 24 * HOUR).story.hand).toEqual([]);
  });

  it("never deals an answered letter again, even when its requirements still hold", () => {
    const { tinker } = fresh();
    const letter = { id: "test.x.repeatable", act: 0, location: "x", requires: {}, nerve: 1, description: "d", options: [{ label: "l", success: { text: "t", changes: {} } }], weight: 1 };
    const rigged = { ...content, letters: new Map([[letter.id, letter]]) };
    const dealt = refreshStory(newStory(0), tinker, rigged, 0).story;
    expect(dealt.hand).toEqual([letter.id]);
    const answered = playScene(dealt, tinker, rigged, "letter", letter.id, 0, 0).story;
    expect(answered.answered).toEqual([letter.id]);
    expect(refreshStory(answered, tinker, rigged, 24 * HOUR).story.hand).toEqual([]);
  });

  it("lets a letter in hand be answered after its dealing requirements stop holding", () => {
    const { tinker } = fresh();
    const story = { ...newStory(0), hand: [LETTER], qualities: { "prologue.progress": 50 } };
    const { event } = playScene(story, tinker, content, "letter", LETTER, 0, 0);
    expect(event).toMatchObject({ type: "scene_played", scene: LETTER });
  });

  it("returns a discarded letter to the deck while its requirements hold", () => {
    const { tinker, story } = fresh();
    const dealt = refreshStory(story, tinker, content, 0).story;
    const { story: discarded } = discardLetter(dealt, LETTER, MINUTE);
    expect(discarded.hand).toEqual([]);
    expect(refreshStory(discarded, tinker, content, 2 * HOUR).story.hand).toEqual([LETTER]);
  });
});

describe("the Needles", () => {
  it("raise on a failed risk and fall 1 a day from the last rise", () => {
    const tinker = newTinker({}, 0, 0, 1);
    // Seed 1's first roll fails Tinkering 1 against difficulty 6 (10% odds).
    const story = { ...newStory(0), hand: [LETTER] };
    const { story: after, event } = playScene(story, tinker, content, "letter", LETTER, 1, 0);
    expect(event.type).toBe("scene_played");
    if (event.type !== "scene_played") return;
    expect(event.challenge).toMatchObject({ quality: "tinkering", level: 1, difficulty: 6, odds: 0.1 });
    expect(event.success).toBe(false);
    expect(after.qualities["needle.arrears"]).toBe(2);
    expect(refreshStory(after, tinker, content, 23 * HOUR).story.qualities["needle.arrears"]).toBe(2);
    expect(refreshStory(after, tinker, content, 24 * HOUR).story.qualities["needle.arrears"]).toBe(1);
    const healed = refreshStory(after, tinker, content, 72 * HOUR);
    expect(healed.story.qualities["needle.arrears"]).toBe(0);
    expect(healed.events.filter((e) => e.type === "needle_fell")).toHaveLength(2);
  });
});

describe("cooldowns", () => {
  it("closes a storylet for its cooldown_hours once played, then opens it again", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const scene = {
      id: "act1.test.urn", act: 1, location: "test", requires: {}, nerve: 1, description: "d", cooldown_hours: 24,
      options: [{ label: "l", success: { text: "t", changes: { "needle.scald": "-1" } } }],
    };
    const rigged = { ...content, storylets: new Map([[scene.id, scene]]) };
    const { story } = playScene(newStory(0), tinker, rigged, "storylet", scene.id, 0, 0);
    expect(story.playedAt).toEqual({ [scene.id]: 0 });
    expect(availableStorylets(tinker, story, rigged, 23 * HOUR)).toEqual([]);
    expect(() => playScene(story, tinker, rigged, "storylet", scene.id, 0, 23 * HOUR)).toThrow(/closed until later/);
    expect(availableStorylets(tinker, story, rigged, 24 * HOUR).map((s) => s.id)).toEqual([scene.id]);
  });
});

describe("visits", () => {
  it("counts a check-in as a visit only an hour or more after the last counted one", () => {
    let story = newStory(0);
    const count = (at: number) => (story = countCheckIn(story, at).story).qualities["record.check_ins"];
    expect(count(0)).toBe(1);
    expect(count(59 * MINUTE)).toBe(1);
    expect(count(60 * MINUTE)).toBe(2);
    expect(count(61 * MINUTE)).toBe(2);
    expect(countCheckIn(story, 3 * HOUR).event).toEqual({ type: "check_in_counted", at: 3 * HOUR, qualities: { "record.check_ins": 3 } });
  });

  it("never lets a story outcome set a record", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const scene = { id: "test.x.y", act: 0, location: "x", requires: {}, nerve: 1, description: "d", options: [{ label: "l", success: { text: "t", changes: { "record.check_ins": 9 } } }] };
    const rigged = { ...content, storylets: new Map([[scene.id, scene]]) };
    expect(() => playScene(newStory(0), tinker, rigged, "storylet", scene.id, 0, 0)).toThrow(/cannot set record.check_ins/);
  });
});

describe("the first storylets, end to end", () => {
  it("walks the Prologue and Act I chain in order, gated on Scavenging 3 for rat_nests", () => {
    const tinker = newTinker({}, 0, 0, 5);
    let story = refreshStory(countCheckIn(newStory(0), 0).story, tinker, content, 0).story;
    let t = 0;
    // Each play is a fresh visit, as the opening scenes now open one a visit.
    const play = (kind: "storylet" | "letter", id: string, option: number) => {
      t += 10 * HOUR;
      story = refreshStory(countCheckIn(story, t).story, tinker, content, t).story;
      const played = playScene(story, tinker, content, kind, id, option, t);
      story = played.story;
      return played;
    };
    // The spine only: district scenes (work order 019) open alongside and never move progress.
    const spine = (id: string) =>
      content.storylets.get(id)!.options.some((option) =>
        [option.success, option.failure].some((outcome) => outcome && Object.keys(outcome.changes).some((name) => name.endsWith(".progress"))),
      );
    const visible = () => availableStorylets(tinker, story, content).map((scene) => scene.id).filter(spine);

    expect(visible()).toEqual([]);
    play("letter", LETTER, 0);
    expect(backRentOwed(story)).toBe(15);
    expect(visible()).toEqual(["prologue.sprocket_row.brass_plate"]);
    play("storylet", "prologue.sprocket_row.brass_plate", 0);
    expect(visible()).toEqual(["act1.sprocket_row.altitude_review"]);
    play("storylet", "act1.sprocket_row.altitude_review", 0);
    play("storylet", "act1.lowvents.the_list", 0);
    play("storylet", "act1.polytechnic.sealed_lab", 1);
    expect(story.qualities["act1.progress"]).toBe(15);
    expect(visible()).toEqual([]);
    expect(upcomingStorylets(tinker, story, content).filter((scene) => spine(scene.id))).toEqual([
      { id: "act1.rustmoor.rat_nests", location: "rustmoor", needs: [["scavenging", ">=3", 1]] },
    ]);
    tinker.skillXp.scavenging = 152;
    expect(visible()).toEqual(["act1.rustmoor.rat_nests"]);
  });

  it("shows each option's odds and locks before the player commits", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const scene = content.storylets.get("act1.sprocket_row.altitude_review")!;
    const views = scene.options.map((option) => optionView(option, tinker, newStory(0), content));
    expect(views.filter((view) => view.available)).toHaveLength(2);
    expect(views.find((view) => !view.available)!.locked[0]).toEqual(["flag.kept_brass_plate", "==1", 0]);
  });

  it("rolls from the Tinker's seeded generator, so a replay gives the same result", () => {
    const run = () => {
      const tinker = newTinker({}, 0, 0, 42);
      const story = { ...newStory(0), hand: [LETTER] };
      return playScene(story, tinker, content, "letter", LETTER, 1, 0);
    };
    expect(run().event).toEqual(run().event);
    expect(run().tinker.rng).not.toBe(42);
  });

  it("lists Tallow's 600-Crown account for the pass, and paying clears its flag but not Arrears", () => {
    const story = { ...newStory(0), qualities: { "flag.owes_foundry_pass": 1, "needle.arrears": 2 } };
    expect(debtsOwed(story).map(({ id, crowns }) => ({ id, crowns }))).toEqual([{ id: "foundry_pass", crowns: 600 }]);
    const { story: paid, debt } = payDebt(story, "foundry_pass");
    expect(debt.crowns).toBe(600);
    expect(paid.qualities).toEqual({ "flag.owes_foundry_pass": 0, "needle.arrears": 2 });
    expect(() => payDebt(paid, "foundry_pass")).toThrow(/nothing is owed/);
  });

  it("charges 5 Crowns after a successful repair", () => {
    const story = { ...newStory(0), qualities: { "flag.owes_back_rent": 1, "flag.back_rent_reduced": 1 } };
    expect(backRentOwed(story)).toBe(5);
    expect(backRentOwed(newStory(0))).toBe(0);
  });
});
