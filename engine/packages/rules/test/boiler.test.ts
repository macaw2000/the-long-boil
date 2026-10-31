import { describe, expect, it } from "vitest";
import { checkIn, levelFor, newTinker, resolve, setQueue, type GameEvent, type TinkerState } from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const HOUR = 3_600_000;
const SPANNER = "action.rustmoor.tinker_brass_spanner";
const SMELT = "action.rustmoor.smelt_brass_ingot";
const PROSPECT = "action.rustmoor.prospect_copper";

function freshTinker(inventory: Record<string, number> = {}): TinkerState {
  return newTinker(inventory, 0, 0, 1);
}

function count(events: GameEvent[], type: GameEvent["type"]) {
  return events.filter((event) => event.type === type).length;
}

describe("levels", () => {
  it("reads the approved XP curve", () => {
    expect(levelFor(0, content)).toBe(1);
    expect(levelFor(15, content)).toBe(1);
    expect(levelFor(16, content)).toBe(2);
    expect(levelFor(2_929_638, content)).toBe(100);
    expect(levelFor(10 ** 9, content)).toBe(100);
  });
});

describe("the action queue", () => {
  it("works through a queued count, consuming inputs and paying XP", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.brass_ingot": 50 }), [{ actionId: SPANNER, remaining: 50 }]);
    const { state, events } = resolve(start, content, 50 * 54_000);
    expect(state.inventory).toEqual({ "item.rustmoor.brass_spanner": 50 });
    expect(state.skillXp.tinkering).toBe(400);
    expect(state.queue).toEqual([]);
    expect(count(events, "action_completed")).toBe(50);
    expect(count(events, "queue_entry_finished")).toBe(1);
  });

  it("keeps partial progress between resolutions", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.brass_ingot": 1 }), [{ actionId: SPANNER, remaining: 1 }]);
    const half = resolve(start, content, 27_000);
    expect(half.state.progressMs).toBe(27_000);
    expect(half.state.inventory["item.rustmoor.brass_spanner"]).toBeUndefined();
    const done = resolve(half.state, content, 54_000);
    expect(done.state.inventory["item.rustmoor.brass_spanner"]).toBe(1);
  });

  it("moves to the second action when the first runs out of inputs", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.copper": 3 }), [
      { actionId: SMELT, remaining: 10 },
      { actionId: PROSPECT, remaining: 2 },
    ]);
    const { state, events } = resolve(start, content, HOUR);
    expect(state.inventory).toEqual({ "item.rustmoor.brass_ingot": 3, "item.rustmoor.copper": 2 });
    expect(events.find((event) => event.type === "queue_stalled")).toMatchObject({ actionId: SMELT, reason: "inputs", at: 3 * 54_000 });
    expect(state.queue).toEqual([]);
  });

  it("will not run an action above the Tinker's level", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.iron_ingot": 5 }), [{ actionId: "action.rustmoor.tinker_iron_rifle", remaining: 1 }]);
    const { state, events } = resolve(start, content, HOUR);
    expect(events).toEqual([{ type: "queue_stalled", at: 0, actionId: "action.rustmoor.tinker_iron_rifle", reason: "level" }]);
    expect(state.inventory).toEqual({ "item.rustmoor.iron_ingot": 5 });
  });

  it("reports each level gained", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.brass_ingot": 50 }), [{ actionId: SPANNER, remaining: 50 }]);
    const { events } = resolve(start, content, 50 * 54_000);
    const levels = events.filter((event) => event.type === "level_up").map((event) => (event as { level: number }).level);
    expect(levels).toEqual([2, 3]);
  });
});

describe("the Boiler", () => {
  it("stops work when the steam runs out and says so once", () => {
    const start = setQueue(freshTinker(), [{ actionId: PROSPECT, remaining: 10_000 }]);
    const first = resolve(start, content, 20 * HOUR);
    expect(first.state.inventory["item.rustmoor.copper"]).toBe(Math.floor((12 * 3600) / 54));
    expect(count(first.events, "boiler_dry")).toBe(1);
    const later = resolve(first.state, content, 30 * HOUR);
    expect(later.events).toEqual([]);
  });

  it("refills to twelve hours at a check-in", () => {
    const start = setQueue(freshTinker(), [{ actionId: PROSPECT, remaining: 10_000 }]);
    const { state } = checkIn(start, content, 6 * HOUR);
    expect(state.steamUntil).toBe(18 * HOUR);
  });
});

describe("offline resolution", () => {
  // A small seeded generator, so the split points are random but repeatable.
  function seeded(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it("gives the same state and events in one step or many", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.copper": 300 }), [
      { actionId: SMELT, remaining: 250 },
      { actionId: PROSPECT, remaining: 400 },
    ]);
    const end = 14 * HOUR;
    const once = resolve(start, content, end);

    for (const seed of [1, 2, 3, 42, 2026]) {
      const random = seeded(seed);
      const cuts = Array.from({ length: 40 }, () => Math.floor(random() * end)).sort((a, b) => a - b);
      let state = start;
      const events: GameEvent[] = [];
      for (const cut of [...cuts, end]) {
        const step = resolve(state, content, cut);
        state = step.state;
        events.push(...step.events);
      }
      expect(state).toEqual(once.state);
      expect(events).toEqual(once.events);
    }
  });

  it("does not change the state it was given", () => {
    const start = setQueue(freshTinker({ "item.rustmoor.brass_ingot": 5 }), [{ actionId: SPANNER, remaining: 5 }]);
    const snapshot = structuredClone(start);
    resolve(start, content, HOUR);
    expect(start).toEqual(snapshot);
  });
});
