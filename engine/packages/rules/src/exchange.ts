// The Brass Exchange and the Counting-House window (GDD section 6, The
// Brass Exchange; Guilds, Work Orders, and Favour). The pure parts: the
// price ladder, matching, the sales tax, the collectors' week and the
// trading gate. The server keeps the book and the escrow in Postgres.

import type { Content } from "./content.js";
import { COMBAT_SKILLS } from "./combat.js";
import { levelFor } from "./xp.js";

/** GDD section 6: "a 2% sales tax removes Crowns". */
export const SALES_TAX = 0.02;
/** GDD section 6: "orders expire after 30 days". */
export const ORDER_DAYS = 30;
/** GDD section 6: "trading unlock[s] at total level 50 on an account at least two days old". */
export const TRADING_TOTAL_LEVEL = 50;
export const TRADING_ACCOUNT_DAYS = 2;

const DAY_MS = 86_400_000;

export type Side = "buy" | "sell";

/**
 * The price step at a price (GDD section 6: "Prices move in 2 to 5% steps").
 * Steps run 1, 2, 5, 10, 20, 50, ... and a step t covers prices up to 50 t,
 * so above 50 Crowns every step is between 2% and 5% of the price. Every
 * band starts on a multiple of its own step, so the ladder never skips.
 */
export function priceStep(price: number): number {
  for (let scale = 1; ; scale *= 10) {
    for (const step of [1, 2, 5]) if (price <= 50 * step * scale) return step * scale;
  }
}

export function onLadder(price: number): boolean {
  return Number.isInteger(price) && price >= 1 && price % priceStep(price) === 0;
}

/** The next price up the ladder. */
export function stepUp(price: number): number {
  return price + priceStep(price + 1);
}

/** The next price down the ladder, never below 1. */
export function stepDown(price: number): number {
  return Math.max(1, price - priceStep(price));
}

/** The nearest ladder price at or below a price, for suggesting a fix. */
export function ladderFloor(price: number): number {
  const step = priceStep(Math.max(1, price));
  return Math.max(1, Math.floor(price / step) * step);
}

/** The seller's tax on one fill, rounded half up like the economy's prices. */
export function salesTax(proceeds: number): number {
  return Math.round(proceeds * SALES_TAX);
}

export interface RestingOrder {
  id: number;
  price: number;
  qtyOpen: number;
}

export interface Fill {
  orderId: number;
  price: number;
  qty: number;
}

/**
 * Matches an incoming order against the other side of the book, which must
 * come best price first and oldest first within a price. Fills are at the
 * resting order's price. Returns the fills and the quantity left to rest.
 */
export function match(side: Side, price: number, qty: number, book: readonly RestingOrder[]): { fills: Fill[]; remaining: number } {
  const fills: Fill[] = [];
  let remaining = qty;
  for (const resting of book) {
    if (remaining === 0) break;
    const crosses = side === "buy" ? resting.price <= price : resting.price >= price;
    if (!crosses) break;
    const filled = Math.min(remaining, resting.qtyOpen);
    if (filled <= 0) continue;
    fills.push({ orderId: resting.id, price: resting.price, qty: filled });
    remaining -= filled;
  }
  return { fills, remaining };
}

/** The Monday 00:00 UTC that starts the collectors' week containing `at`. */
export function collectorWeek(at: number): number {
  const day = Math.floor(at / DAY_MS);
  // 1 January 1970 was a Thursday, so day 4 is the first Monday.
  return (day - ((day - 4 + 7 * 1_000_000) % 7)) * DAY_MS;
}

/** Every skill the content trains, with the combat skills. */
export function skillNames(content: Content): string[] {
  const names = new Set<string>(COMBAT_SKILLS);
  for (const action of content.actions.values()) names.add(action.skill);
  return [...names].sort();
}

/** Total level: every trained skill's level, an untrained skill counting 1. */
export function totalLevel(skillXp: Record<string, number>, content: Content): number {
  return skillNames(content).reduce((sum, skill) => sum + levelFor(skillXp[skill] ?? 0, content), 0);
}

export interface TradingGate {
  totalLevel: number;
  accountAgeMs: number;
}

/** Why a Tinker may not yet trade on the Exchange, or null when it may. */
export function tradingRefusal(gate: TradingGate, rules = { level: TRADING_TOTAL_LEVEL, days: TRADING_ACCOUNT_DAYS }): string | null {
  if (gate.totalLevel < rules.level) return `trading opens at total level ${rules.level} (now ${gate.totalLevel})`;
  if (gate.accountAgeMs < rules.days * DAY_MS) return `trading opens once the account is ${rules.days} days old`;
  return null;
}

export const ORDER_MS = ORDER_DAYS * DAY_MS;
