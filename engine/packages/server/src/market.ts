// The Brass Exchange's order book and the Counting-House window (GDD
// section 6). Every operation settles and resolves the Tinker first, as a
// check-in does, then moves items and Crowns directly: the rules never see
// the market, only the inventory and purse it leaves behind.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { adjustCrowns, adjustUnbound, appendEvents, setLastSeq, Shortfall, type LogEntry } from "./events.js";
import { NotFound, settle, type TradeNote } from "./settle.js";
import { advance, BadRequest, outcome, view, type Outcome } from "./tinkers.js";

export class Refused extends Error {}

export interface TradingRules {
  level: number;
  days: number;
}

export const GDD_TRADING: TradingRules = { level: rules.TRADING_TOTAL_LEVEL, days: rules.TRADING_ACCOUNT_DAYS };

export interface OrderRequest {
  item: string;
  side: rules.Side;
  price: number;
  qty: number;
}

/** Opens a market operation as a check-in, saved before the market moves anything. */
async function begin(tx: Tx, content: GameContent, tinkerId: number, now: number) {
  return advance(tx, content, tinkerId, now, true);
}

/** Worn or wielded gear cannot be sold out from under the Tinker (combat.json gear.reference_gear): take it off first. */
function keepWorn(state: rules.TinkerState, item: string, qty: number) {
  const worn = [state.weapon, state.armour, ...Object.values(state.worn), ...Object.values(state.tools)];
  if (worn.includes(item) && (state.inventory[item] ?? 0) - qty < 1) throw new BadRequest(`${item} is worn; put something else on before selling the last one`);
}

async function finish(tx: Tx, content: GameContent, tinkerId: number, now: number, seq: number, entries: LogEntry[], begun: Awaited<ReturnType<typeof begin>>, notes: TradeNote[] = []): Promise<Outcome> {
  const last = await appendEvents(tx, tinkerId, seq, entries, content.rules.version);
  await setLastSeq(tx, tinkerId, last);
  return outcome(await view(tx, tinkerId, content, now), begun.events, [...begun.trades, ...notes], begun.storyEvents);
}

/** Runs a market operation, turning a shortfall of items or Crowns into a 400. */
async function marketOp<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(db, work);
  } catch (error) {
    if (error instanceof Shortfall) throw new BadRequest(error.message);
    throw error;
  }
}

function terms(content: GameContent, item: string) {
  const entry = content.economy.get(item);
  if (!entry) throw new BadRequest(`${item} is not traded`);
  return entry;
}

function wholeCount(qty: number) {
  if (!Number.isInteger(qty) || qty < 1) throw new BadRequest("a count must be a whole number of at least 1");
}

/** Sells to the Counting-House collectors, up to each item's weekly cap per account. Never locked. */
export async function sellToCollector(db: Db, content: GameContent, tinkerId: number, item: string, qty: number, now: number): Promise<Outcome> {
  wholeCount(qty);
  const { collectorPrice, collectorWeeklyCap } = terms(content, item);
  if (collectorPrice === null || collectorWeeklyCap === null) throw new BadRequest(`no collector buys ${item}`);
  return marketOp(db, async (tx) => {
    const begun = await begin(tx, content, tinkerId, now);
    const account = Number((await tx.query("SELECT account_id FROM tinkers WHERE id = $1", [tinkerId])).rows[0].account_id);
    const week = new Date(rules.collectorWeek(now));
    // Lock the account's row for this item and week, so two Tinkers cannot both use the last of the cap.
    await tx.query(
      `INSERT INTO collector_sales (account_id, item, week_start, qty) VALUES ($1, $2, $3, 0)
       ON CONFLICT (account_id, item, week_start) DO NOTHING`,
      [account, item, week],
    );
    const sold = Number(
      (await tx.query("SELECT qty FROM collector_sales WHERE account_id = $1 AND item = $2 AND week_start = $3 FOR UPDATE", [account, item, week]))
        .rows[0].qty,
    );
    if (sold + qty > collectorWeeklyCap) {
      throw new BadRequest(`the collectors take ${collectorWeeklyCap} ${item} a week; ${collectorWeeklyCap - sold} more this week`);
    }
    const crowns = collectorPrice * qty;
    keepWorn(begun.state, item, qty);
    await adjustUnbound(tx, tinkerId, item, -qty);
    await adjustCrowns(tx, tinkerId, crowns);
    await tx.query("UPDATE collector_sales SET qty = qty + $4 WHERE account_id = $1 AND item = $2 AND week_start = $3", [account, item, week, qty]);
    return finish(tx, content, tinkerId, now, begun.seq, [
      { type: "collector_sold", at: now, payload: { item, qty, price: collectorPrice, items: { [item]: -qty }, crowns } },
    ], begun);
  });
}

/** Buys ingredients at the grocer's counter, at fixed prices. Never locked. */
export async function buyFromGrocer(db: Db, content: GameContent, tinkerId: number, item: string, qty: number, now: number): Promise<Outcome> {
  wholeCount(qty);
  const { grocerPrice } = terms(content, item);
  if (grocerPrice === null) throw new BadRequest(`the grocer does not sell ${item}`);
  return marketOp(db, async (tx) => {
    const begun = await begin(tx, content, tinkerId, now);
    const crowns = grocerPrice * qty;
    await adjustCrowns(tx, tinkerId, -crowns);
    await adjustUnbound(tx, tinkerId, item, qty);
    return finish(tx, content, tinkerId, now, begun.seq, [
      { type: "grocer_bought", at: now, payload: { item, qty, price: grocerPrice, items: { [item]: qty }, crowns: -crowns } },
    ], begun);
  });
}

/** Why this Tinker may not trade, or null. Locks the account row, which fixes the trading Tinker. */
async function tradingCheck(tx: Tx, content: GameContent, tinkerId: number, skillXp: Record<string, number>, now: number, gate: TradingRules): Promise<string | null> {
  const account = (
    await tx.query(
      `SELECT a.id, a.created_at, a.trading_tinker_id, other.name AS trader
       FROM tinkers t JOIN accounts a ON a.id = t.account_id
       LEFT JOIN tinkers other ON other.id = a.trading_tinker_id
       WHERE t.id = $1 FOR UPDATE OF a`,
      [tinkerId],
    )
  ).rows[0];
  const refusal = rules.tradingRefusal(
    { totalLevel: rules.totalLevel(skillXp, content.rules), accountAgeMs: now - account.created_at.getTime() },
    gate,
  );
  if (refusal) return refusal;
  if (account.trading_tinker_id !== null && Number(account.trading_tinker_id) !== tinkerId) {
    return `only ${account.trader} trades for this account`;
  }
  if (account.trading_tinker_id === null) {
    await tx.query("UPDATE accounts SET trading_tinker_id = $2 WHERE id = $1", [account.id, tinkerId]);
  }
  return null;
}

/**
 * Places an order: escrows it, fills what crosses at the resting prices, and
 * rests the rest for 30 days. Also names the Tinkers whose resting orders it
 * filled, so their open sessions can be told.
 */
export async function placeOrder(
  db: Db,
  content: GameContent,
  tinkerId: number,
  order: OrderRequest,
  now: number,
  gate = GDD_TRADING,
): Promise<Outcome & { counterparties: number[] }> {
  const { item, side, price, qty } = order;
  wholeCount(qty);
  if (terms(content, item).bound) throw new BadRequest(`${item} is bound and cannot be traded`);
  if (!rules.onLadder(price)) {
    throw new BadRequest(`${price} is not a ladder price; prices move in steps of ${rules.priceStep(Math.max(1, price))} here, e.g. ${rules.ladderFloor(price)}`);
  }
  return marketOp(db, async (tx) => {
    const begun = await begin(tx, content, tinkerId, now);
    const skillXp = begun.state.skillXp;
    const refusal = await tradingCheck(tx, content, tinkerId, skillXp, now, gate);
    if (refusal) throw new Refused(refusal);

    const entries: LogEntry[] = [];
    const notes: TradeNote[] = [];
    if (side === "sell") {
      keepWorn(begun.state, item, qty);
      await adjustUnbound(tx, tinkerId, item, -qty);
    }
    else await adjustCrowns(tx, tinkerId, -price * qty);
    const orderId = Number(
      (
        await tx.query(
          `INSERT INTO exchange_orders (tinker_id, item, side, price, qty_total, qty_open, placed_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING id`,
          [tinkerId, item, side, price, qty, new Date(now), new Date(now + rules.ORDER_MS)],
        )
      ).rows[0].id,
    );
    entries.push({
      type: "exchange_order_placed",
      at: now,
      payload: { order: orderId, item, side, price, qty, items: side === "sell" ? { [item]: -qty } : {}, crowns: side === "buy" ? -price * qty : 0 },
    });

    // The other side of the book, best price first, oldest first within a price.
    // A Tinker's own orders are skipped, never matched against each other.
    const book = (
      await tx.query(
        `SELECT id, tinker_id, price, qty_open FROM exchange_orders
         WHERE item = $1 AND side = $2 AND closed_at IS NULL AND expires_at > $3 AND tinker_id <> $4
           AND ${side === "buy" ? "price <= $5" : "price >= $5"}
         ORDER BY price ${side === "buy" ? "ASC" : "DESC"}, id
         FOR UPDATE`,
        [item, side === "buy" ? "sell" : "buy", new Date(now), tinkerId, price],
      )
    ).rows;
    const makers = new Map(book.map((row) => [Number(row.id), Number(row.tinker_id)]));
    const { fills, remaining } = rules.match(
      side,
      price,
      qty,
      book.map((row) => ({ id: Number(row.id), price: Number(row.price), qtyOpen: Number(row.qty_open) })),
    );

    const shop = content.rules.shop;
    const taxRate = shop && item === shop.crate.item ? shop.crate.exchangeTax : rules.SALES_TAX;
    for (const fill of fills) {
      const tax = rules.salesTax(fill.price * fill.qty, taxRate);
      const maker = makers.get(fill.orderId)!;
      await tx.query(
        `INSERT INTO exchange_fills (item, price, qty, tax, buy_order_id, sell_order_id, buyer_id, seller_id, at, buyer_collected, seller_collected)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        side === "buy"
          ? [item, fill.price, fill.qty, tax, orderId, fill.orderId, tinkerId, maker, new Date(now), true, false]
          : [item, fill.price, fill.qty, tax, fill.orderId, orderId, maker, tinkerId, new Date(now), false, true],
      );
      await tx.query(
        `UPDATE exchange_orders SET qty_open = qty_open - $2::bigint,
           closed_at = CASE WHEN qty_open = $2::bigint THEN $3::timestamptz END, closed_reason = CASE WHEN qty_open = $2::bigint THEN 'filled' END
         WHERE id = $1`,
        [fill.orderId, fill.qty, new Date(now)],
      );
      // The taker is paid at once. A buyer escrowed its limit price, so it gets the difference back.
      const items = side === "buy" ? { [item]: fill.qty } : {};
      const crowns = side === "buy" ? (price - fill.price) * fill.qty : fill.price * fill.qty - tax;
      if (side === "buy") await adjustUnbound(tx, tinkerId, item, fill.qty);
      await adjustCrowns(tx, tinkerId, crowns);
      notes.push({ kind: side === "buy" ? "bought" : "sold", item, qty: fill.qty, price: fill.price, tax: side === "sell" ? tax : 0, at: now });
      entries.push({ type: "exchange_filled", at: now, payload: { order: orderId, against: fill.orderId, price: fill.price, qty: fill.qty, tax, items, crowns } });
    }

    await tx.query(
      `UPDATE exchange_orders SET qty_open = $2::bigint,
         closed_at = CASE WHEN $2::bigint = 0 THEN $3::timestamptz END, closed_reason = CASE WHEN $2::bigint = 0 THEN 'filled' END
       WHERE id = $1`,
      [orderId, remaining, new Date(now)],
    );
    const counterparties = [...new Set(fills.map((fill) => makers.get(fill.orderId)!))];
    return { ...(await finish(tx, content, tinkerId, now, begun.seq, entries, begun, notes)), counterparties };
  });
}

/** Cancels an open order of this Tinker's, returning what is left of its escrow. */
export async function cancelOrder(db: Db, content: GameContent, tinkerId: number, orderId: number, now: number): Promise<Outcome> {
  return marketOp(db, async (tx) => {
    const begun = await begin(tx, content, tinkerId, now);
    const order = (
      await tx.query(
        `UPDATE exchange_orders SET closed_at = $3, closed_reason = 'cancelled'
         WHERE id = $1 AND tinker_id = $2 AND closed_at IS NULL
         RETURNING item, side, price, qty_open`,
        [orderId, tinkerId, new Date(now)],
      )
    ).rows[0];
    if (!order) throw new BadRequest(`no open order ${orderId}`);
    const qty = Number(order.qty_open);
    const items = order.side === "sell" ? { [order.item]: qty } : {};
    const crowns = order.side === "buy" ? Number(order.price) * qty : 0;
    if (order.side === "sell") await adjustUnbound(tx, tinkerId, order.item, qty);
    else await adjustCrowns(tx, tinkerId, crowns);
    return finish(tx, content, tinkerId, now, begun.seq, [
      { type: "exchange_order_closed", at: now, payload: { order: orderId, reason: "cancelled", items, crowns } },
    ], begun);
  });
}

export interface BookLevel {
  price: number;
  qty: number;
  orders: number;
}

/** One item's book: open orders summed by price, best first, ten levels a side. */
export async function orderBook(db: Db, item: string, now: number): Promise<{ item: string; bids: BookLevel[]; asks: BookLevel[] }> {
  const levels = async (side: "buy" | "sell") =>
    (
      await db.query(
        `SELECT price, sum(qty_open) AS qty, count(*) AS orders FROM exchange_orders
         WHERE item = $1 AND side = $2 AND closed_at IS NULL AND expires_at > $3
         GROUP BY price ORDER BY price ${side === "buy" ? "DESC" : "ASC"} LIMIT 10`,
        [item, side, new Date(now)],
      )
    ).rows.map((row) => ({ price: Number(row.price), qty: Number(row.qty), orders: Number(row.orders) }));
  return { item, bids: await levels("buy"), asks: await levels("sell") };
}

export interface MarketView {
  canTrade: boolean;
  refusal: string | null;
  totalLevel: number;
  orders: { id: number; item: string; side: rules.Side; price: number; qtyTotal: number; qtyOpen: number; expiresAt: string }[];
  /** Per collector item: how many more the collectors take from this account this week. */
  collectorLeft: Record<string, number>;
  weekEnds: string;
}

/** What a Tinker sees at the Exchange. Read-only: it fixes no trading Tinker. */
export async function marketView(db: Db, content: GameContent, tinkerId: number, now: number, gate = GDD_TRADING): Promise<MarketView> {
  const tinker = (
    await db.query(
      `SELECT t.account_id, a.created_at, a.trading_tinker_id, other.name AS trader
       FROM tinkers t JOIN accounts a ON a.id = t.account_id LEFT JOIN tinkers other ON other.id = a.trading_tinker_id
       WHERE t.id = $1`,
      [tinkerId],
    )
  ).rows[0];
  if (!tinker) throw new NotFound(`no Tinker ${tinkerId}`);
  const skillXp: Record<string, number> = {};
  for (const row of (await db.query("SELECT skill, xp FROM skills WHERE tinker_id = $1", [tinkerId])).rows) skillXp[row.skill] = Number(row.xp);
  const totalLevel = rules.totalLevel(skillXp, content.rules);
  let refusal = rules.tradingRefusal({ totalLevel, accountAgeMs: now - tinker.created_at.getTime() }, gate);
  if (!refusal && tinker.trading_tinker_id !== null && Number(tinker.trading_tinker_id) !== tinkerId) {
    refusal = `only ${tinker.trader} trades for this account`;
  }

  const orders = (
    await db.query(
      `SELECT id, item, side, price, qty_total, qty_open, expires_at FROM exchange_orders
       WHERE tinker_id = $1 AND closed_at IS NULL ORDER BY id`,
      [tinkerId],
    )
  ).rows.map((row) => ({
    id: Number(row.id),
    item: row.item,
    side: row.side,
    price: Number(row.price),
    qtyTotal: Number(row.qty_total),
    qtyOpen: Number(row.qty_open),
    expiresAt: row.expires_at.toISOString(),
  }));

  const week = rules.collectorWeek(now);
  const sold = new Map<string, number>(
    (
      await db.query("SELECT item, qty FROM collector_sales WHERE account_id = $1 AND week_start = $2", [tinker.account_id, new Date(week)])
    ).rows.map((row) => [row.item, Number(row.qty)]),
  );
  const collectorLeft: Record<string, number> = {};
  for (const [item, entry] of content.economy) {
    if (entry.collectorWeeklyCap !== null) collectorLeft[item] = entry.collectorWeeklyCap - (sold.get(item) ?? 0);
  }
  return { canTrade: refusal === null, refusal, totalLevel, orders, collectorLeft, weekEnds: new Date(week + 7 * 86_400_000).toISOString() };
}
