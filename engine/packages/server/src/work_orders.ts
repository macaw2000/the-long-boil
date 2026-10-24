// Work Orders on the server (build plan milestone 9; work order 022). The
// rules decide what is offered and what an order pays; this module brings a
// Tinker's desk up to now, takes unbound goods only (the bound starter crate
// cannot be handed in, as on the Exchange), pays the Crowns and records the
// Favour as a story quality.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { adjustCrowns, adjustUnbound, appendEvents, setLastSeq, type LogEntry } from "./events.js";
import { GDD_TRADING, type TradingRules } from "./market.js";
import { advance, BadRequest, outcome, saveStory, view, type Outcome } from "./tinkers.js";

export interface WorkOrderChoice {
  id: string;
  seal: string;
  band: { min: number; max: number };
  asks: { item: string; qty: number }[];
  reward: { favour: number; crowns: number };
  request: string;
}

export interface WorkOrderDesk {
  /** Why orders are not issued yet, or null once they are. */
  locked: string | null;
  offers: { id: number; arrivedAt: string; chosen: string | null; choices: WorkOrderChoice[] }[];
  nextAt: string | null;
  held: number;
  favour: Record<string, number>;
  favourCap: number;
}

export type WorkOrderOutcome = Outcome & { desk: WorkOrderDesk };

function choice(content: GameContent, id: string): WorkOrderChoice {
  const order = content.rules.workOrders.get(id);
  if (!order) return { id, seal: "", band: { min: 0, max: 0 }, asks: [], reward: { favour: 0, crowns: 0 }, request: "This order is no longer issued." };
  return { id, seal: order.seal, band: order.band, asks: order.asks, reward: order.reward, request: order.request };
}

function desk(content: GameContent, state: rules.WorkOrderState, story: rules.StoryState, locked: string | null): WorkOrderDesk {
  const seals = new Set([...content.rules.workOrders.values()].map((order) => order.seal));
  return {
    locked,
    offers: state.offers.map((offer) => ({
      id: offer.id,
      arrivedAt: new Date(offer.arrivedAt).toISOString(),
      chosen: offer.chosen,
      choices: offer.choices.map((id) => choice(content, id)),
    })),
    nextAt: state.nextAt === null ? null : new Date(state.nextAt).toISOString(),
    held: rules.WORK_ORDERS_HELD,
    favour: Object.fromEntries([...seals].sort().map((seal) => [seal, story.qualities[seal] ?? 0])),
    favourCap: rules.WORK_ORDER_FAVOUR_CAP,
  };
}

async function gateRefusal(tx: Tx, content: GameContent, tinkerId: number, skillXp: Record<string, number>, now: number, gate: TradingRules) {
  const account = (await tx.query("SELECT a.created_at FROM tinkers t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1", [tinkerId])).rows[0];
  return rules.tradingRefusal({ totalLevel: rules.totalLevel(skillXp, content.rules), accountAgeMs: now - account.created_at.getTime() }, gate);
}

interface Step {
  orders: rules.WorkOrderState;
  events: rules.WorkOrderEvent[];
}

/**
 * Brings the Tinker and its desk up to now, applies one step, and saves
 * everything in one transaction. Orders arrive only while the trading gate
 * is open; the first arrives when it opens.
 */
async function deskOp(
  db: Db,
  content: GameContent,
  tinkerId: number,
  now: number,
  gate: TradingRules,
  step: (orders: rules.WorkOrderState, tx: Tx, story: rules.StoryState) => Promise<Step & { story?: rules.StoryState }>,
): Promise<WorkOrderOutcome> {
  try {
    return await withTransaction(db, async (tx) => {
      const advanced = await advance(tx, content, tinkerId, now, false);
      const locked = await gateRefusal(tx, content, tinkerId, advanced.state.skillXp, now, gate);
      const stored = (await tx.query("SELECT work_orders FROM tinkers WHERE id = $1", [tinkerId])).rows[0].work_orders as rules.WorkOrderState;
      const refreshed = rules.refreshWorkOrders(stored, advanced.state.skillXp, advanced.state.rng, content.rules, locked ? null : now, now);
      const result = await step(refreshed.orders, tx, advanced.story);
      const entries: LogEntry[] = [...refreshed.events, ...result.events].map((event) => ({ type: event.type, at: event.at, payload: event }));
      const seq = await appendEvents(tx, tinkerId, advanced.seq, entries, content.rules.version);
      await setLastSeq(tx, tinkerId, seq);
      await tx.query("UPDATE tinkers SET work_orders = $2, rng = $3 WHERE id = $1", [tinkerId, JSON.stringify(result.orders), refreshed.rng]);
      const story = result.story ?? advanced.story;
      if (result.story) await saveStory(tx, tinkerId, advanced.story, result.story);
      const done = outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents);
      return { ...done, desk: desk(content, result.orders, story, locked) };
    });
  } catch (error) {
    if (error instanceof rules.WorkOrderRefusal) throw new BadRequest(error.message);
    throw error;
  }
}

export function readDesk(db: Db, content: GameContent, tinkerId: number, now: number, gate = GDD_TRADING): Promise<WorkOrderOutcome> {
  return deskOp(db, content, tinkerId, now, gate, async (orders) => ({ orders, events: [] }));
}

export function chooseSeal(db: Db, content: GameContent, tinkerId: number, offerId: number, orderId: string, now: number, gate = GDD_TRADING) {
  return deskOp(db, content, tinkerId, now, gate, async (orders) => {
    const chosen = rules.chooseOrder(orders, offerId, orderId, now);
    return { orders: chosen.orders, events: [chosen.event] };
  });
}

export function discardOffer(db: Db, content: GameContent, tinkerId: number, offerId: number, now: number, gate = GDD_TRADING) {
  return deskOp(db, content, tinkerId, now, gate, async (orders) => {
    const discarded = rules.discardOrder(orders, offerId, now);
    return { orders: discarded.orders, events: [discarded.event] };
  });
}

/** Hands in a chosen order's goods (unbound only), pays its Crowns, and raises its faction's Favour up to the cap. */
export function turnIn(db: Db, content: GameContent, tinkerId: number, offerId: number, now: number, gate = GDD_TRADING) {
  return deskOp(db, content, tinkerId, now, gate, async (orders, tx, story) => {
    const rows = (await tx.query("SELECT item, qty FROM inventory WHERE tinker_id = $1 AND NOT bound", [tinkerId])).rows;
    const unbound = Object.fromEntries(rows.map((row) => [row.item, Number(row.qty)]));
    const done = rules.completeOrder(orders, offerId, unbound, story.qualities, content.rules, now);
    for (const [item, delta] of Object.entries(done.event.items)) await adjustUnbound(tx, tinkerId, item, delta);
    await adjustCrowns(tx, tinkerId, done.event.crowns);
    const next = { ...story, qualities: { ...story.qualities, ...done.event.favour } };
    return { orders: done.orders, events: [done.event], story: next };
  });
}
