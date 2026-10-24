import { describe, expect, it } from "vitest";
import {
  WORK_ORDER_FAVOUR_CAP,
  WORK_ORDER_MS,
  WORK_ORDERS_HELD,
  canObtain,
  chooseOrder,
  completeOrder,
  discardOrder,
  drawOffer,
  newWorkOrders,
  refreshWorkOrders,
  WorkOrderRefusal,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const HOUR = 3_600_000;
const OPEN = Date.UTC(2026, 9, 24, 8, 0, 0);

/** Every skill at one level. */
function allAt(level: number): Record<string, number> {
  const skills = ["smithing", "prospecting", "scavenging", "tinkering", "cooking", "melee", "marksmanship", "aetherics", "vitality", "pressure", "precision", "fortitude"];
  return Object.fromEntries(skills.map((skill) => [skill, content.totalXp[level]!]));
}

const sealOf = (id: string) => content.workOrders.get(id)!.seal;
const bandOf = (id: string) => content.workOrders.get(id)!.band.min;

describe("what a Tinker can come by", () => {
  it("follows chains, buys at the grocer, and fights only what it can", () => {
    expect(canObtain("item.rustmoor.copper", allAt(1), content)).toBe(true);
    expect(canObtain("item.rustmoor.rustmoor_ration", allAt(1), content)).toBe(true);
    expect(canObtain("item.rustmoor.steel_ingot", allAt(9), content)).toBe(false);
    expect(canObtain("item.rustmoor.steel_ingot", allAt(10), content)).toBe(true);
    expect(canObtain("item.rustmoor.rat_scrap", allAt(1), content)).toBe(true);
    expect(canObtain("item.rustmoor.board_memo", allAt(20), content)).toBe(false);
  });
});

describe("Work Order offers", () => {
  it("offers two different seals from the highest band the Tinker can fill", () => {
    for (const level of [1, 5, 10, 15, 20]) {
      const { choices } = drawOffer(allAt(level), content, 12345 + level);
      expect(choices).toHaveLength(2);
      expect(new Set(choices.map(sealOf)).size).toBe(2);
      expect(new Set(choices.map(bandOf))).toEqual(new Set([level >= 15 ? 15 : level >= 10 ? 10 : level >= 5 ? 5 : 1]));
    }
  });

  it("draws every seal, roughly evenly", () => {
    const counts = new Map<string, number>();
    let rng = 7;
    for (let i = 0; i < 2000; i++) {
      const drawn = drawOffer(allAt(1), content, rng);
      rng = drawn.rng;
      for (const id of drawn.choices) counts.set(sealOf(id), (counts.get(sealOf(id)) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
  });

  it("issues nothing until trading opens, then one every 8 hours, up to 3 waiting", () => {
    const shut = refreshWorkOrders(newWorkOrders(), allAt(5), 1, content, null, OPEN + 48 * HOUR);
    expect(shut.orders.offers).toHaveLength(0);

    const first = refreshWorkOrders(newWorkOrders(), allAt(5), 1, content, OPEN, OPEN);
    expect(first.orders.offers).toHaveLength(1);
    expect(first.orders.nextAt).toBe(OPEN + WORK_ORDER_MS);

    const later = refreshWorkOrders(first.orders, allAt(5), first.rng, content, OPEN, OPEN + 5 * 24 * HOUR);
    expect(later.orders.offers).toHaveLength(WORK_ORDERS_HELD);
    expect(later.events.map((event) => event.at)).toEqual([OPEN + WORK_ORDER_MS, OPEN + 2 * WORK_ORDER_MS]);
    // A full desk banks nothing: the next order comes 8 hours after one goes.
    const now = OPEN + 5 * 24 * HOUR;
    const freed = discardOrder(later.orders, later.orders.offers[0]!.id, now);
    expect(refreshWorkOrders(freed.orders, allAt(5), later.rng, content, OPEN, now + WORK_ORDER_MS - 1).orders.offers).toHaveLength(2);
    expect(refreshWorkOrders(freed.orders, allAt(5), later.rng, content, OPEN, now + WORK_ORDER_MS).orders.offers).toHaveLength(3);
  });
});

describe("turning in a Work Order", () => {
  const arrived = refreshWorkOrders(newWorkOrders(), allAt(1), 3, content, OPEN, OPEN).orders;
  const offer = arrived.offers[0]!;
  const picked = offer.choices[0]!;
  const order = content.workOrders.get(picked)!;
  const enough = Object.fromEntries(order.asks.map((ask) => [ask.item, ask.qty]));

  it("needs a seal chosen, and only one of those on offer", () => {
    expect(() => completeOrder(arrived, offer.id, enough, {}, content, OPEN)).toThrow(WorkOrderRefusal);
    expect(() => chooseOrder(arrived, offer.id, "wo.rustmoor.nope", OPEN)).toThrow(/not on offer/);
  });

  it("takes the goods, pays the Crowns and one Favour, and stops Favour at the cap", () => {
    const chosen = chooseOrder(arrived, offer.id, picked, OPEN).orders;
    const short = { ...enough, [order.asks[0]!.item]: order.asks[0]!.qty - 1 };
    expect(() => completeOrder(chosen, offer.id, short, {}, content, OPEN)).toThrow(/still needed: 1 /);

    const done = completeOrder(chosen, offer.id, enough, { [order.seal]: 1 }, content, OPEN);
    expect(done.orders.offers).toHaveLength(0);
    expect(done.event.crowns).toBe(order.reward.crowns);
    expect(done.event.items).toEqual(Object.fromEntries(order.asks.map((ask) => [ask.item, -ask.qty])));
    expect(done.event.favour).toEqual({ [order.seal]: 2 });

    const capped = completeOrder(chosen, offer.id, enough, { [order.seal]: WORK_ORDER_FAVOUR_CAP }, content, OPEN);
    expect(capped.event.favour).toEqual({});
    expect(capped.event.crowns).toBe(order.reward.crowns);
  });
});
