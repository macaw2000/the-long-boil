import { describe, expect, it } from "vitest";
import {
  boostedMs,
  buy,
  headMs,
  newStory,
  newTinker,
  priceOf,
  refreshStory,
  resolve,
  setQueue,
  ShopRefusal,
  type TinkerState,
  type Upgrades,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const shop = content.shop!;
const HOUR = 3_600_000;
const SPANNER = "action.rustmoor.tinker_brass_spanner";
const PROSPECT = "action.rustmoor.prospect_copper";
const BASE: Upgrades = { queueSlots: 2, boilerHours: 12, nerveCap: 10, boostUntil: 0 };

function boosted(until: number, inventory: Record<string, number> = { "item.rustmoor.brass_ingot": 50 }): TinkerState {
  return { ...setQueue(newTinker(inventory, 0, 0, 1), [{ actionId: SPANNER, remaining: 50 }]), boostUntil: until };
}

describe("the Cog Shop's purchases", () => {
  it("reads GDD section 8's starting prices", () => {
    expect(shop.crate).toMatchObject({ item: "item.global.cog_crate", cogs: 10, priceCents: 499, lockHours: 72, exchangeTax: 0.15 });
    expect(priceOf(shop, BASE, "queue_slot")).toBe(30);
    expect(priceOf(shop, BASE, "boiler_upgrade")).toBe(20);
    expect(priceOf(shop, BASE, "night_lamp")).toBe(40);
    expect(priceOf(shop, BASE, "boiler_boost")).toBe(5);
  });

  it("sells one extra queue slot and one Night Lamp, and no more", () => {
    const slot = buy(shop, BASE, "queue_slot", 30, 0);
    expect(slot).toEqual({ cogs: 30, upgrades: { ...BASE, queueSlots: 3 } });
    expect(priceOf(shop, slot.upgrades, "queue_slot")).toBeNull();
    expect(() => buy(shop, slot.upgrades, "queue_slot", 100, 0)).toThrow(ShopRefusal);
    const lamp = buy(shop, BASE, "night_lamp", 40, 0);
    expect(lamp.upgrades.nerveCap).toBe(14);
    expect(() => buy(shop, lamp.upgrades, "night_lamp", 100, 0)).toThrow(/already/);
  });

  it("adds Boiler hours 2 at a time, up to 24", () => {
    let upgrades = BASE;
    for (let i = 0; i < 6; i++) upgrades = buy(shop, upgrades, "boiler_upgrade", 20, 0).upgrades;
    expect(upgrades.boilerHours).toBe(24);
    expect(priceOf(shop, upgrades, "boiler_upgrade")).toBeNull();
  });

  it("stacks a Boost onto one already burning", () => {
    const first = buy(shop, BASE, "boiler_boost", 5, 1_000).upgrades;
    expect(first.boostUntil).toBe(1_000 + 24 * HOUR);
    const second = buy(shop, first, "boiler_boost", 5, 2_000).upgrades;
    expect(second.boostUntil).toBe(1_000 + 48 * HOUR);
    // A lapsed Boost starts again from now.
    expect(buy(shop, first, "boiler_boost", 5, 30 * HOUR).upgrades.boostUntil).toBe(54 * HOUR);
  });

  it("refuses what the Cogs do not cover", () => {
    expect(() => buy(shop, BASE, "night_lamp", 39, 0)).toThrow("that costs 40 Cogs; you have 39");
  });
});

describe("the Boiler Boost", () => {
  it("works 20% faster while it burns", () => {
    expect(boostedMs(54_000, 20)).toBe(45_000);
    const { state } = resolve(boosted(HOUR), content, 10 * 45_000);
    expect(state.inventory["item.rustmoor.brass_spanner"]).toBe(10);
    expect(headMs(state, content)).toBe(45_000);
  });

  it("finishes a go started under the Boost at the Boost's pace, then slows", () => {
    // The Boost burns out 10 seconds into the second spanner.
    const { state } = resolve(boosted(55_000), content, 45_000 + 45_000 + 54_000);
    expect(state.inventory["item.rustmoor.brass_spanner"]).toBe(3);
    expect(state.progressMs).toBe(0);
    expect(headMs(state, content)).toBe(54_000);
  });

  it("gives the same result in one resolve as in many across the Boost's end", () => {
    const start = boosted(20 * 45_000 + 7_000);
    const end = 40 * 54_000;
    const once = resolve(start, content, end);
    let stepped = start;
    const events = [];
    for (let t = 13_337; t < end; t += 13_337) {
      const part = resolve(stepped, content, t);
      stepped = part.state;
      events.push(...part.events);
    }
    const last = resolve(stepped, content, end);
    events.push(...last.events);
    expect(last.state).toEqual(once.state);
    expect(events).toEqual(once.events);
  });

  it("does nothing once it has burned out", () => {
    const { state } = resolve(boosted(0), content, 54_000);
    expect(state.inventory["item.rustmoor.brass_spanner"]).toBe(1);
  });
});

describe("the extra queue slot", () => {
  it("holds a third action only when bought", () => {
    const three = [
      { actionId: PROSPECT, remaining: 1 },
      { actionId: SPANNER, remaining: 1 },
      { actionId: PROSPECT, remaining: 1 },
    ];
    expect(() => setQueue(newTinker({}, 0, 0, 1), three)).toThrow("the queue holds 2 actions");
    expect(setQueue(newTinker({}, 0, 0, 1), three, 3).queue).toHaveLength(3);
  });
});

describe("the Night Lamp", () => {
  it("lets Nerve refill past 10, to the raised cap", () => {
    const tinker = newTinker({}, 0, 0, 1);
    const lit = { ...newStory(0), nerveCap: 14 };
    expect(refreshStory(lit, tinker, content, 10 * HOUR).story.nerve).toBe(14);
    // A plain Tinker stops at 10.
    expect(refreshStory(newStory(0), tinker, content, 10 * HOUR).story.nerve).toBe(10);
  });
});
