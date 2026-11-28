import { describe, expect, it } from "vitest";
import { HOT_FACTOR, HOT_STOCK, HOT_WINDOW_MS, checkIn, fineChance, grantHot, headMs, levelFor, newTinker, resolve, setQueue, stoke, type GameEvent, type TinkerState } from "../src/index.js";
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
    // Fine work (work order 046) doubles some goes once Prospecting is past level 1, so the goes are counted, not the Copper.
    expect(count(first.events, "action_completed")).toBe(Math.floor((12 * 3600) / 54));
    expect(first.state.inventory["item.rustmoor.copper"]).toBeGreaterThan(Math.floor((12 * 3600) / 54));
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

describe("hot steam (work order 045)", () => {
  const ingots = { "item.rustmoor.brass_ingot": 50 };

  it("is never spent by a queue nobody is watching", () => {
    const start = setQueue(freshTinker(ingots), [{ actionId: SPANNER, remaining: 50 }]);
    const { state, events } = resolve(start, content, 10 * 54_000);
    expect(count(events, "action_completed")).toBe(10);
    expect(state.hotGoes).toBe(HOT_STOCK);
  });

  it("runs a go at a sixth of its time while the player is at the workshop, and spends one of the stock", () => {
    const start = stoke(setQueue(freshTinker(ingots), [{ actionId: SPANNER, remaining: 50 }]), 0);
    expect(headMs(start, content)).toBe(54_000 / HOT_FACTOR);
    const { state, events } = resolve(start, content, 9_000);
    expect(count(events, "action_completed")).toBe(1);
    expect(state.hotGoes).toBe(HOT_STOCK - 1);
  });

  it("goes back to the usual pace when the window closes, and a go that started hot finishes hot", () => {
    const start = stoke(setQueue(freshTinker({ "item.rustmoor.brass_ingot": 200 }), [{ actionId: SPANNER, remaining: 200 }]), 0);
    const { state, events } = resolve(start, content, HOUR);
    const hot = HOT_WINDOW_MS / 9_000;
    expect(HOT_STOCK - state.hotGoes).toBe(hot);
    expect(count(events, "action_completed")).toBe(hot + Math.floor((HOUR - HOT_WINDOW_MS) / 54_000));
  });

  it("gives the same state resolved in one call or in many, with the same stokes", () => {
    const start = stoke(setQueue(freshTinker(ingots), [{ actionId: SPANNER, remaining: 50 }]), 0);
    const once = resolve(start, content, 20 * 60_000).state;
    let stepped = start;
    for (let at = 7_000; at <= 20 * 60_000; at += 7_000) stepped = resolve(stepped, content, at).state;
    stepped = resolve(stepped, content, 20 * 60_000).state;
    expect(stepped).toEqual(once);
  });

  it("lets a cold go under way join in at the same share done", () => {
    const start = setQueue(freshTinker(ingots), [{ actionId: SPANNER, remaining: 50 }]);
    const half = resolve(start, content, 27_000).state;
    const stoked = stoke(half, 27_000);
    expect(stoked.headHot).toBe(true);
    expect(stoked.progressMs).toBe(4_500);
    expect(resolve(stoked, content, 27_000 + 4_500).events.filter((event) => event.type === "action_completed")).toHaveLength(1);
  });

  it("runs cold once the stock is gone, and a top-up never passes the full stock", () => {
    const empty = { ...freshTinker(ingots), hotGoes: 0 };
    const start = stoke(setQueue(empty, [{ actionId: SPANNER, remaining: 50 }]), 0);
    expect(headMs(start, content)).toBe(54_000);
    expect(grantHot(empty, 30).hotGoes).toBe(30);
    expect(grantHot(freshTinker(), 30).hotGoes).toBe(HOT_STOCK);
  });
});

describe("fine work (work order 046)", () => {
  it("has no chance at the level a job needs, 2% a level above it, and never more than 20%", () => {
    expect(fineChance(1, 1)).toBe(0);
    expect(fineChance(4, 1)).toBeCloseTo(0.06, 9);
    expect(fineChance(40, 1)).toBe(0.2);
    expect(fineChance(3, 5)).toBe(0);
  });

  it("doubles what a go makes, never what it uses or the XP it pays, and never gear", () => {
    const skilled = { ...freshTinker({ "item.rustmoor.copper": 200, "item.rustmoor.brass_ingot": 20 }), skillXp: { smithing: 30_000, tinkering: 30_000 } };
    const { state, events } = resolve(setQueue(skilled, [{ actionId: SMELT, remaining: 200 }, { actionId: SPANNER, remaining: 20 }]), content, 220 * 54_000);
    const goes = events.filter((event) => event.type === "action_completed") as Extract<GameEvent, { type: "action_completed" }>[];
    const smelts = goes.filter((go) => go.actionId === SMELT);
    const fine = smelts.filter((go) => go.fine);
    expect(smelts).toHaveLength(200);
    expect(fine.length).toBeGreaterThan(15);
    expect(fine.length).toBeLessThan(70);
    expect(fine.every((go) => go.produced["item.rustmoor.brass_ingot"] === 2 && go.consumed["item.rustmoor.copper"] === 1 && go.xp === 8)).toBe(true);
    // A Brass Spanner is a weapon, so no go of it is ever doubled.
    expect(goes.filter((go) => go.actionId === SPANNER && go.fine)).toHaveLength(0);
    expect(state.inventory["item.rustmoor.brass_spanner"]).toBe(20);
  });
});
