import { describe, expect, it } from "vitest";
import {
  NERVE_MS,
  wardOpensAt,
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
  visibleNeedles,
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

/** A Tinker at the second visit with the first sitting's two scenes played: Pip's bill opens now (work order 037). */
function atBill(seed = 1): { tinker: TinkerState; story: StoryState } {
  return { tinker: newTinker({}, 0, 0, seed), story: { ...newStory(0), qualities: { "prologue.progress": 8, "record.check_ins": 2 } } };
}

/** A test letter with the old bill's risk: Tinkering 1 against 6 (10% odds), Arrears +2 on a failure. */
const RISK = {
  id: "test.x.risk", act: 1, location: "x", requires: {}, nerve: 1, description: "d", weight: 1,
  options: [
    { label: "safe", success: { text: "t", changes: {} } },
    { label: "risky", challenge: { quality: "tinkering", difficulty: 6 }, success: { text: "t", changes: {} }, failure: { text: "f", changes: { "needle.arrears": "+2" } } },
  ],
};
const risky = { ...content, letters: new Map([[RISK.id, RISK]]) };

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
    const { tinker } = fresh();
    let { story: spent } = playScene({ ...newStory(0), hand: [LETTER] }, tinker, content, "letter", LETTER, 0, 0);
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
  it("delivers no letter in the first sitting, and Pip's bill the moment the second opens", () => {
    const { tinker, story } = fresh();
    expect(refreshStory(story, tinker, content, 0).story.hand).toEqual([]);
    // Not on a two-hour delivery: a Prologue letter comes as soon as it opens.
    const bill = atBill();
    const { story: after, events } = refreshStory(bill.story, bill.tinker, content, 90 * MINUTE);
    expect(after.hand).toEqual([LETTER]);
    expect(events).toEqual([{ type: "letter_arrived", at: 90 * MINUTE, letter: LETTER }]);
  });

  it("never deals a letter twice into one hand, nor one whose requirements fail", () => {
    const { tinker, story } = atBill();
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
    const { tinker, story } = atBill();
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
    const story = { ...newStory(0), hand: [RISK.id] };
    const { story: after, event } = playScene(story, tinker, risky, "letter", RISK.id, 1, 0);
    expect(event.type).toBe("scene_played");
    if (event.type !== "scene_played") return;
    expect(event.challenge).toMatchObject({ quality: "tinkering", level: 1, difficulty: 6, odds: 0.1 });
    expect(event.success).toBe(false);
    expect(after.qualities["needle.arrears"]).toBe(2);
    expect(refreshStory(after, tinker, risky, 23 * HOUR).story.qualities["needle.arrears"]).toBe(2);
    expect(refreshStory(after, tinker, risky, 24 * HOUR).story.qualities["needle.arrears"]).toBe(1);
    const healed = refreshStory(after, tinker, risky, 72 * HOUR);
    expect(healed.story.qualities["needle.arrears"]).toBe(0);
    expect(healed.events.filter((e) => e.type === "needle_fell")).toHaveLength(2);
  });

  it("stay hidden until a scene first moves one, then stay on screen at 0", () => {
    expect(visibleNeedles(newStory(0).qualities)).toEqual({});
    const tinker = newTinker({}, 0, 0, 1);
    const story = { ...newStory(0), hand: [RISK.id] };
    const { story: after } = playScene(story, tinker, risky, "letter", RISK.id, 1, 0);
    expect(visibleNeedles(after.qualities)).toEqual({ "needle.arrears": 2 });
    const healed = refreshStory(after, tinker, risky, 72 * HOUR).story;
    expect(visibleNeedles(healed.qualities)).toEqual({ "needle.arrears": 0 });
  });
});

describe("a stay at St. Pinion's", () => {
  const scene = (id: string, location: string, requires: Record<string, string>, changes: Record<string, string | number>) => ({
    id, act: 1, location, requires, nerve: 1, description: "d",
    options: [{ label: "l", success: { text: "t", changes } }],
  });
  const ward = scene("act1.infirmary.ward", "infirmary", { "needle.scald": ">=8", "flag.in_st_pinion": "==0" }, { "flag.in_st_pinion": 1 });
  const out = scene("act1.infirmary.out", "infirmary", { "flag.in_st_pinion": "==1" }, { "flag.in_st_pinion": 0, "needle.scald": "-4" });
  const street = scene("act1.row.street", "row", {}, { "needle.notice": "+1" });
  const rigged = { ...content, storylets: new Map([ward, out, street].map((s) => [s.id, s])) };

  it("sends a redlined Tinker to the Infirmary before admission, and holds Scald at 8", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const redlined = { ...newStory(0), qualities: { "needle.scald": 8 }, needleAt: { "needle.scald": 0 } };
    expect(availableStorylets(tinker, redlined, rigged, 0).map((s) => s.id)).toEqual([ward.id]);
    expect(() => playScene(redlined, tinker, rigged, "storylet", street.id, 0, 0)).toThrow(/St. Pinion's/);
    expect(refreshStory(redlined, tinker, rigged, 72 * HOUR).story.qualities["needle.scald"]).toBe(8);
  });

  it("offers only the Infirmary, holds Scald, and lets it fall again from discharge", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const redlined = { ...newStory(0), qualities: { "needle.scald": 8 }, needleAt: { "needle.scald": 0 } };
    const admitted = playScene(redlined, tinker, rigged, "storylet", ward.id, 0, HOUR).story;
    expect(availableStorylets(tinker, admitted, rigged, HOUR).map((s) => s.id)).toEqual([out.id]);
    expect(() => playScene(admitted, tinker, rigged, "storylet", street.id, 0, HOUR)).toThrow(/St. Pinion's/);
    expect(refreshStory(admitted, tinker, rigged, 72 * HOUR).story.qualities["needle.scald"]).toBe(8);
    const discharged = playScene(admitted, tinker, rigged, "storylet", out.id, 0, 72 * HOUR).story;
    expect(discharged.qualities["needle.scald"]).toBe(4);
    expect(availableStorylets(tinker, discharged, rigged, 72 * HOUR).map((s) => s.id)).toContain(street.id);
    expect(refreshStory(discharged, tinker, rigged, 95 * HOUR).story.qualities["needle.scald"]).toBe(4);
    expect(refreshStory(discharged, tinker, rigged, 96 * HOUR).story.qualities["needle.scald"]).toBe(3);
  });

  it("says when a ward scene can next be played: now, after its cooldown, or once Nerve returns", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const rest = { ...scene("act1.infirmary.rest", "infirmary", { "flag.in_st_pinion": "==1" }, { "needle.scald": "-1" }), cooldown_hours: 6 };
    const ward2 = { ...content, storylets: new Map([ward, rest, street].map((s) => [s.id, s])) };
    const admitted = { ...newStory(0), qualities: { "needle.scald": 8, "flag.in_st_pinion": 1 }, needleAt: { "needle.scald": 0 } };
    expect(wardOpensAt(tinker, newStory(0), ward2, HOUR)).toBeNull();
    expect(wardOpensAt(tinker, admitted, ward2, HOUR)).toBe(HOUR);
    const rested = playScene(admitted, tinker, ward2, "storylet", rest.id, 0, HOUR).story;
    expect(wardOpensAt(tinker, rested, ward2, 2 * HOUR)).toBe(7 * HOUR);
    const spent = { ...rested, nerve: 0, nerveAt: 6 * HOUR };
    expect(wardOpensAt(tinker, spent, ward2, 2 * HOUR)).toBe(7 * HOUR);
    const later = { ...rested, nerve: 0, nerveAt: 7 * HOUR };
    expect(wardOpensAt(tinker, later, ward2, 2 * HOUR)).toBe(7 * HOUR + NERVE_MS);
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

    // The first day in three sittings (work order 037): two scenes, then the bill and the Row, then the city.
    expect(visible()).toEqual(["prologue.sprocket_row.who_you_are"]);
    play("storylet", "prologue.sprocket_row.who_you_are", 0);
    expect(story.qualities["flag.origin_apprentice"]).toBe(1);
    play("storylet", "prologue.sprocket_row.rats_in_the_workshop", 0);
    expect(story.hand).toEqual([]);
    play("letter", LETTER, 0);
    expect(backRentOwed(story)).toBe(1400);
    // Pip calls whether or not the rent is paid; clearing it is a goal across the next sittings (decision 12).
    expect(visible()).toEqual(["prologue.sprocket_row.the_receipt"]);
    for (const id of ["sprocket_row.the_receipt", "sprocket_row.the_neighbours", "polytechnic.the_register", "rustmoor.the_tip_book", "rustmoor.the_first_nest", "polytechnic.the_lift_lecture"])
      play("storylet", `prologue.${id}`, 0);
    expect(visible()).toEqual(["prologue.sprocket_row.brass_plate"]);
    play("storylet", "prologue.sprocket_row.brass_plate", 0);
    // Act I opens at the visit after the plate, not the one it was played on.
    expect(visible()).toEqual([]);
    play("storylet", "act1.sprocket_row.altitude_review", 0);
    play("storylet", "act1.lowvents.the_list", 0);
    play("storylet", "act1.polytechnic.sealed_lab", 1);
    expect(story.qualities["act1.progress"]).toBe(15);
    expect(visible()).toEqual([]);
    expect(upcomingStorylets(tinker, story, content).filter((scene) => spine(scene.id))).toEqual([
      { id: "act1.rustmoor.rat_nests", location: "rustmoor", needs: [["scavenging", ">=3", 1], ["record.visits_since_prologue", ">=4", 3]] },
    ]);
    tinker.skillXp.scavenging = 152;
    story = countCheckIn(story, (t += 10 * HOUR)).story;
    expect(visible()).toEqual(["act1.rustmoor.rat_nests"]);
  });

  it("counts visits since the Prologue, and starts the count for a Tinker who finished the old one-visit Prologue", () => {
    let story: StoryState = { ...newStory(0), qualities: { "prologue.progress": 100, "record.check_ins": 3, "flag.origin_relative": 1 } };
    story = countCheckIn(story, 0).story;
    expect(story.qualities["record.visits_since_prologue"]).toBe(1);
    const old: StoryState = { ...newStory(0), qualities: { "prologue.progress": 100, "record.check_ins": 6 } };
    // Six visits, the first of which played the whole old Prologue: this seventh is the sixth since.
    expect(countCheckIn(old, 0).story.qualities["record.visits_since_prologue"]).toBe(6);
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
      const story = { ...newStory(0), hand: [RISK.id] };
      return playScene(story, tinker, risky, "letter", RISK.id, 1, 0);
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

  it("charges 1,320 Crowns after the repair, a year's rent less 80", () => {
    const story = { ...newStory(0), qualities: { "flag.owes_back_rent": 1, "flag.back_rent_reduced": 1 } };
    expect(backRentOwed(story)).toBe(1320);
    expect(backRentOwed(newStory(0))).toBe(0);
  });
});
