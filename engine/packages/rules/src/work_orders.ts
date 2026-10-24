// Work Orders (GDD section 6; work order 022). A new order arrives every 8
// hours once trading opens, up to 3 waiting. Each arrival offers two seals
// and the Tinker picks one; discarding is free. Only orders whose goods the
// Tinker can make now are offered, from the highest band that has two seals
// to offer. Turning one in pays its Crowns and one Favour with its faction,
// up to the act's cap.
//
// These rules decide what is offered and what an order pays. Taking the goods
// (unbound only) and paying the Crowns is the server's, as on the Exchange.

import { COMBAT_STYLES, nextRandom } from "./combat.js";
import type { Content, ItemStack } from "./content.js";
import { levelFor } from "./xp.js";

const HOUR_MS = 3_600_000;

export const WORK_ORDER_MS = 8 * HOUR_MS;
export const WORK_ORDERS_HELD = 3;
/** Act I: Work Orders raise a faction's Favour to at most 3; story Favour stops at 2 (work orders 019 and 022). */
export const WORK_ORDER_FAVOUR_CAP = 3;

export interface WorkOrder {
  id: string;
  act: number;
  seal: string;
  band: { min: number; max: number };
  asks: ItemStack[];
  reward: { favour: number; crowns: number };
  request: string;
}

export interface Offer {
  /** Per Tinker, counting up from 1. */
  id: number;
  arrivedAt: number;
  /** One order per seal on offer; two unless the Tinker qualifies for only one seal. */
  choices: string[];
  /** The order picked, once the Tinker has chosen a seal. */
  chosen: string | null;
}

export interface WorkOrderState {
  offers: Offer[];
  /** When the next order arrives; null until trading opens for this Tinker. */
  nextAt: number | null;
  serial: number;
}

export type WorkOrderEvent =
  | { type: "work_order_arrived"; at: number; offer: number; choices: string[] }
  | { type: "work_order_chosen"; at: number; offer: number; order: string }
  | { type: "work_order_discarded"; at: number; offer: number }
  | { type: "work_order_completed"; at: number; offer: number; order: string; items: Record<string, number>; crowns: number; favour: Record<string, number> };

export class WorkOrderRefusal extends Error {}

export function newWorkOrders(): WorkOrderState {
  return { offers: [], nextAt: null, serial: 0 };
}

function skillLevel(skillXp: Record<string, number>, skill: string, content: Content): number {
  return levelFor(skillXp[skill] ?? 0, content);
}

/**
 * The level at which this Tinker can come by an item now, or null if it
 * cannot: made by an action it has the level for, from inputs it can come by
 * or buy at the grocer's counter, or dropped by a monster it can fight.
 * Bosses and first-kill drops do not count.
 */
export function canObtain(item: string, skillXp: Record<string, number>, content: Content, seen: Set<string> = new Set()): boolean {
  if (content.grocer.has(item)) return true;
  if (seen.has(item)) return false;
  const visiting = new Set(seen).add(item);
  for (const action of content.actions.values()) {
    if (!action.outputs.some((output) => output.item === item)) continue;
    if (skillLevel(skillXp, action.skill, content) < action.level_required) continue;
    if (action.inputs.every((input) => canObtain(input.item, skillXp, content, visiting))) return true;
  }
  const fighting = Math.max(...COMBAT_STYLES.map((style) => skillLevel(skillXp, style, content)));
  for (const table of content.drops.values()) {
    const monster = content.monsters.get(table.monster);
    if (!monster || monster.boss || monster.level > fighting) continue;
    if (table.entries.some((entry) => entry.item === item && entry.chance > 0)) return true;
  }
  return false;
}

/** Orders this Tinker can fill with goods it can come by now. */
export function qualifyingOrders(skillXp: Record<string, number>, content: Content): WorkOrder[] {
  return [...content.workOrders.values()].filter((order) => order.asks.every((ask) => canObtain(ask.item, skillXp, content)));
}

/**
 * What a new arrival offers: from the highest band in which the Tinker
 * qualifies for orders of at least two seals (or failing that, any band with
 * one), two different seals drawn evenly, one order each. Returns the
 * choices and the generator's next state.
 */
export function drawOffer(skillXp: Record<string, number>, content: Content, rng: number): { choices: string[]; rng: number } {
  const qualifying = qualifyingOrders(skillXp, content);
  if (qualifying.length === 0) return { choices: [], rng };
  const bands = [...new Set(qualifying.map((order) => order.band.min))].sort((a, b) => b - a);
  const sealsIn = (min: number) => [...new Set(qualifying.filter((order) => order.band.min === min).map((order) => order.seal))].sort();
  const band = bands.find((min) => sealsIn(min).length >= 2) ?? bands[0]!;
  const pool = sealsIn(band);
  const seals: string[] = [];
  let state = rng;
  while (seals.length < Math.min(2, pool.length)) {
    const [value, next] = nextRandom(state);
    state = next;
    const remaining = pool.filter((seal) => !seals.includes(seal));
    seals.push(remaining[Math.floor(value * remaining.length)]!);
  }
  const choices = seals.map((seal) => {
    const orders = qualifying.filter((order) => order.band.min === band && order.seal === seal).sort((a, b) => a.id.localeCompare(b.id));
    const [value, next] = nextRandom(state);
    state = next;
    return orders[Math.floor(value * orders.length)]!.id;
  });
  return { choices, rng: state };
}

function cloneOrders(state: WorkOrderState): WorkOrderState {
  return { offers: state.offers.map((offer) => ({ ...offer, choices: [...offer.choices] })), nextAt: state.nextAt, serial: state.serial };
}

/**
 * Brings Work Orders up to `now`. `openedAt` is when trading opened for this
 * Tinker (null while it is shut); the first order arrives then. As with the
 * Post, a full desk does not bank arrivals: the clock starts again when an
 * order goes.
 */
export function refreshWorkOrders(
  previous: WorkOrderState,
  skillXp: Record<string, number>,
  rng: number,
  content: Content,
  openedAt: number | null,
  now: number,
): { orders: WorkOrderState; rng: number; events: WorkOrderEvent[] } {
  const orders = cloneOrders(previous);
  const events: WorkOrderEvent[] = [];
  let state = rng;
  if (openedAt === null) return { orders, rng, events };
  if (orders.nextAt === null) orders.nextAt = openedAt;
  while (orders.nextAt <= now) {
    if (orders.offers.length >= WORK_ORDERS_HELD) {
      orders.nextAt = now + WORK_ORDER_MS;
      break;
    }
    const at = orders.nextAt;
    orders.nextAt += WORK_ORDER_MS;
    const drawn = drawOffer(skillXp, content, state);
    state = drawn.rng;
    if (drawn.choices.length === 0) continue;
    orders.serial += 1;
    orders.offers.push({ id: orders.serial, arrivedAt: at, choices: drawn.choices, chosen: null });
    events.push({ type: "work_order_arrived", at, offer: orders.serial, choices: drawn.choices });
  }
  return { orders, rng: state, events };
}

function findOffer(state: WorkOrderState, offerId: number): Offer {
  const offer = state.offers.find((candidate) => candidate.id === offerId);
  if (!offer) throw new WorkOrderRefusal(`no Work Order ${offerId} on your desk`);
  return offer;
}

/** Picks one seal of an offer. */
export function chooseOrder(previous: WorkOrderState, offerId: number, orderId: string, now: number): { orders: WorkOrderState; event: WorkOrderEvent } {
  const orders = cloneOrders(previous);
  const offer = findOffer(orders, offerId);
  if (offer.chosen !== null) throw new WorkOrderRefusal("this Work Order's seal is already chosen");
  if (!offer.choices.includes(orderId)) throw new WorkOrderRefusal(`${orderId} is not on offer here`);
  offer.chosen = orderId;
  return { orders, event: { type: "work_order_chosen", at: now, offer: offerId, order: orderId } };
}

/** Throws an offer away, for free. A full desk's clock starts again from now. */
export function discardOrder(previous: WorkOrderState, offerId: number, now: number): { orders: WorkOrderState; event: WorkOrderEvent } {
  const orders = cloneOrders(previous);
  findOffer(orders, offerId);
  const wasFull = orders.offers.length >= WORK_ORDERS_HELD;
  orders.offers = orders.offers.filter((offer) => offer.id !== offerId);
  if (wasFull && orders.nextAt !== null) orders.nextAt = Math.max(orders.nextAt, now + WORK_ORDER_MS);
  return { orders, event: { type: "work_order_discarded", at: now, offer: offerId } };
}

/**
 * Turns in a chosen order. `unbound` is what the Tinker holds that can be
 * handed in. Returns the goods to take, the Crowns to pay and the Favour
 * gained, which stops at the cap.
 */
export function completeOrder(
  previous: WorkOrderState,
  offerId: number,
  unbound: Record<string, number>,
  favour: Record<string, number>,
  content: Content,
  now: number,
): { orders: WorkOrderState; event: Extract<WorkOrderEvent, { type: "work_order_completed" }> } {
  const orders = cloneOrders(previous);
  const offer = findOffer(orders, offerId);
  if (offer.chosen === null) throw new WorkOrderRefusal("choose a seal for this Work Order first");
  const order = content.workOrders.get(offer.chosen);
  if (!order) throw new WorkOrderRefusal(`${offer.chosen} is no longer issued`);
  const short = order.asks.filter((ask) => (unbound[ask.item] ?? 0) < ask.qty);
  if (short.length) {
    throw new WorkOrderRefusal(`still needed: ${short.map((ask) => `${ask.qty - (unbound[ask.item] ?? 0)} ${ask.item}`).join(", ")}`);
  }
  const wasFull = orders.offers.length >= WORK_ORDERS_HELD;
  orders.offers = orders.offers.filter((candidate) => candidate.id !== offerId);
  if (wasFull && orders.nextAt !== null) orders.nextAt = Math.max(orders.nextAt, now + WORK_ORDER_MS);
  const current = favour[order.seal] ?? 0;
  const gained = Math.max(0, Math.min(order.reward.favour, WORK_ORDER_FAVOUR_CAP - current));
  return {
    orders,
    event: {
      type: "work_order_completed",
      at: now,
      offer: offerId,
      order: order.id,
      items: Object.fromEntries(order.asks.map((ask) => [ask.item, -ask.qty])),
      crowns: order.reward.crowns,
      favour: gained > 0 ? { [order.seal]: current + gained } : {},
    },
  };
}
