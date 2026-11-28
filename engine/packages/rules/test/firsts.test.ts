import { describe, expect, it } from "vitest";
import { CHECK_INS, STAY_JOBS, STAY_JOBS_FOR_SITTING, claimFirst, countCheckIn, countStay, firstsFor, newStory, newTinker, stayJobsLeft, type FirstsContext, type StoryState } from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();

function context(change: Partial<FirstsContext> = {}): FirstsContext {
  return { state: newTinker({}, 0, 0, 1), content, jobsDone: 0, qualities: {}, inGuild: false, ...change };
}

describe("firsts (work order 049)", () => {
  it("starts with every one open, and pays under 400 Crowns in all", () => {
    const all = firstsFor(context(), []);
    expect(all.every((first) => first.status === "open")).toBe(true);
    expect(new Set(all.map((first) => first.id)).size).toBe(all.length);
    expect(all.reduce((sum, first) => sum + first.crowns, 0)).toBeLessThan(400);
  });

  it("marks one ready when the state shows it done, and claimed once paid", () => {
    const state = { ...newTinker({}, 0, 0, 1), skillXp: { tinkering: 16 } };
    const earned = context({ state, jobsDone: 30 });
    const ready = firstsFor(earned, []).filter((first) => first.status === "ready").map((first) => first.id);
    expect(ready).toEqual(["first_job", "first_level", "jobs_25"]);
    expect(claimFirst(earned, [], "jobs_25")).toBe(10);
    expect(firstsFor(earned, ["jobs_25"]).find((first) => first.id === "jobs_25")!.status).toBe("claimed");
  });

  it("will not pay twice, or for one not done", () => {
    const earned = context({ jobsDone: 30 });
    expect(() => claimFirst(earned, ["jobs_25"], "jobs_25")).toThrow();
    expect(() => claimFirst(earned, [], "jobs_100")).toThrow();
    expect(() => claimFirst(earned, [], "nothing")).toThrow();
  });
});

describe("staying counts as the next sitting (work order 048)", () => {
  const sitting = (checkIns: number, progress: number, stayed = 0): StoryState => ({
    ...countCheckIn(newStory(0), 0).story,
    qualities: { [CHECK_INS]: checkIns, "prologue.progress": progress, [STAY_JOBS]: stayed },
  });

  it("does not count while the sitting's scenes are unplayed, or once the Prologue is over", () => {
    expect(stayJobsLeft(sitting(1, 8))).toBeNull();
    expect(stayJobsLeft(sitting(2, 20))).toBeNull();
    expect(stayJobsLeft(sitting(3, 70))).toBeNull();
    expect(stayJobsLeft(sitting(5, 100))).toBeNull();
    expect(countStay(sitting(1, 8), 8, 1000).event).toBeNull();
  });

  it("adds up jobs after the sitting's last scene, and counts a visit at thirty", () => {
    const some = countStay(sitting(1, 9), 8, 1000);
    expect(some.event).toBeNull();
    expect(stayJobsLeft(some.story)).toBe(STAY_JOBS_FOR_SITTING - 8);
    const enough = countStay(sitting(1, 9, STAY_JOBS_FOR_SITTING - 1), 1, 2000);
    expect(enough.event).toMatchObject({ type: "check_in_counted", qualities: { [CHECK_INS]: 2 } });
    expect(enough.story.checkInAt).toBe(2000);
    expect(enough.story.qualities[STAY_JOBS]).toBe(0);
    expect(stayJobsLeft(enough.story)).toBeNull();
  });
});
