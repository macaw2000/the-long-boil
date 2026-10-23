import { describe, expect, it } from "vitest";
import {
  collectorWeek,
  ladderFloor,
  match,
  onLadder,
  priceStep,
  salesTax,
  stepDown,
  stepUp,
  totalLevel,
  tradingRefusal,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const DAY = 86_400_000;

describe("the price ladder", () => {
  it("steps by 1 up to 50 Crowns, then by 2 to 5% of the price", () => {
    expect([1, 50, 51, 100, 101, 250, 251, 500, 501, 1000, 1001, 2500, 2501].map(priceStep)).toEqual([
      1, 1, 2, 2, 5, 5, 10, 10, 20, 20, 50, 50, 100,
    ]);
    for (let price = 52; price < 100_000; price = stepUp(price)) {
      const step = stepUp(price) - price;
      expect(step / price).toBeLessThanOrEqual(0.05);
      expect(step / stepUp(price)).toBeGreaterThanOrEqual(0.0196);
    }
  });

  it("walks up and down without leaving the ladder", () => {
    let price = 1;
    for (let i = 0; i < 200; i++) {
      expect(onLadder(price)).toBe(true);
      const up = stepUp(price);
      expect(stepDown(up)).toBe(price);
      price = up;
    }
  });

  it("refuses prices off the ladder and suggests the one below", () => {
    expect(onLadder(53)).toBe(false);
    expect(onLadder(0)).toBe(false);
    expect(onLadder(2.5)).toBe(false);
    expect(ladderFloor(53)).toBe(52);
    expect(ladderFloor(1013)).toBe(1000);
  });
});

describe("matching", () => {
  const asks = [
    { id: 1, price: 10, qtyOpen: 5 },
    { id: 2, price: 10, qtyOpen: 5 },
    { id: 3, price: 12, qtyOpen: 5 },
  ];

  it("fills a buy at the resting prices, best and oldest first", () => {
    expect(match("buy", 12, 12, asks)).toEqual({
      fills: [
        { orderId: 1, price: 10, qty: 5 },
        { orderId: 2, price: 10, qty: 5 },
        { orderId: 3, price: 12, qty: 2 },
      ],
      remaining: 0,
    });
  });

  it("stops at the limit price and rests the rest", () => {
    expect(match("buy", 11, 20, asks)).toEqual({
      fills: [
        { orderId: 1, price: 10, qty: 5 },
        { orderId: 2, price: 10, qty: 5 },
      ],
      remaining: 10,
    });
  });

  it("fills a sell against bids at or above its price", () => {
    const bids = [
      { id: 7, price: 14, qtyOpen: 3 },
      { id: 8, price: 12, qtyOpen: 3 },
    ];
    expect(match("sell", 13, 5, bids)).toEqual({ fills: [{ orderId: 7, price: 14, qty: 3 }], remaining: 2 });
  });
});

describe("the Counting-House", () => {
  it("taxes 2% of a fill, rounded half up", () => {
    expect(salesTax(1000)).toBe(20);
    expect(salesTax(25)).toBe(1);
    expect(salesTax(24)).toBe(0);
  });

  it("starts the collectors' week on Monday at midnight UTC", () => {
    const monday = Date.UTC(2026, 9, 19);
    expect(collectorWeek(Date.UTC(2026, 9, 22, 8))).toBe(monday);
    expect(collectorWeek(monday)).toBe(monday);
    expect(collectorWeek(monday - 1)).toBe(monday - 7 * DAY);
    expect(collectorWeek(Date.UTC(2026, 9, 25, 23, 59))).toBe(monday);
  });
});

describe("the trading gate", () => {
  it("counts all sixteen GDD skills, an untrained one as level 1", () => {
    expect(totalLevel({}, content)).toBe(16);
    expect(totalLevel({ tinkering: 450, lumbering: 16 }, content)).toBe(16 + 2 + 1);
  });

  it("needs total level 50 and an account two days old", () => {
    expect(tradingRefusal({ totalLevel: 49, accountAgeMs: 10 * DAY })).toMatch(/total level 50/);
    expect(tradingRefusal({ totalLevel: 50, accountAgeMs: DAY })).toMatch(/2 days old/);
    expect(tradingRefusal({ totalLevel: 50, accountAgeMs: 2 * DAY })).toBeNull();
  });
});
