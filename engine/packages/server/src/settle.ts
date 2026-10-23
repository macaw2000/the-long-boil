// Settling a Tinker's side of the Exchange when the Tinker is next touched:
// collecting fills that happened while its orders rested, and closing its
// orders that expired, returning their escrow. Runs first in every
// operation, and locks the Tinker's row for the rest of the transaction.

import type { GameContent } from "./content-loader.js";
import type { Tx } from "./db.js";
import { adjustCrowns, adjustUnbound, appendEvents, setLastSeq, type LogEntry } from "./events.js";

export type TradeNote =
  | { kind: "bought" | "sold"; item: string; qty: number; price: number; tax: number; at: number }
  | { kind: "expired"; side: "buy" | "sell"; item: string; qty: number; price: number; at: number };

export class NotFound extends Error {}

export async function settle(tx: Tx, content: GameContent, tinkerId: number, now: number): Promise<TradeNote[]> {
  const row = (await tx.query("SELECT last_seq FROM tinkers WHERE id = $1 FOR UPDATE", [tinkerId])).rows[0];
  if (!row) throw new NotFound(`no Tinker ${tinkerId}`);
  const notes: TradeNote[] = [];
  const entries: LogEntry[] = [];

  const bought = (
    await tx.query(
      `UPDATE exchange_fills SET buyer_collected = true WHERE buyer_id = $1 AND NOT buyer_collected
       RETURNING id, item, price, qty, at`,
      [tinkerId],
    )
  ).rows;
  const sold = (
    await tx.query(
      `UPDATE exchange_fills SET seller_collected = true WHERE seller_id = $1 AND NOT seller_collected
       RETURNING id, item, price, qty, tax, at`,
      [tinkerId],
    )
  ).rows;

  for (const fill of bought) {
    const qty = Number(fill.qty);
    // The Crowns were escrowed at this order's own price, which is the fill price.
    await adjustUnbound(tx, tinkerId, fill.item, qty);
    notes.push({ kind: "bought", item: fill.item, qty, price: Number(fill.price), tax: 0, at: fill.at.getTime() });
    entries.push({ type: "exchange_collected", at: now, payload: { fill: Number(fill.id), side: "buy", items: { [fill.item]: qty }, crowns: 0 } });
  }
  for (const fill of sold) {
    const qty = Number(fill.qty);
    const crowns = Number(fill.price) * qty - Number(fill.tax);
    await adjustCrowns(tx, tinkerId, crowns);
    notes.push({ kind: "sold", item: fill.item, qty, price: Number(fill.price), tax: Number(fill.tax), at: fill.at.getTime() });
    entries.push({ type: "exchange_collected", at: now, payload: { fill: Number(fill.id), side: "sell", items: {}, crowns } });
  }

  const expired = (
    await tx.query(
      `UPDATE exchange_orders SET closed_at = expires_at, closed_reason = 'expired'
       WHERE tinker_id = $1 AND closed_at IS NULL AND expires_at <= $2
       RETURNING id, item, side, price, qty_open, expires_at`,
      [tinkerId, new Date(now)],
    )
  ).rows;
  for (const order of expired) {
    const qty = Number(order.qty_open);
    const price = Number(order.price);
    const items = order.side === "sell" ? { [order.item]: qty } : {};
    const crowns = order.side === "buy" ? price * qty : 0;
    if (order.side === "sell") await adjustUnbound(tx, tinkerId, order.item, qty);
    else await adjustCrowns(tx, tinkerId, crowns);
    notes.push({ kind: "expired", side: order.side, item: order.item, qty, price, at: order.expires_at.getTime() });
    entries.push({ type: "exchange_order_closed", at: order.expires_at.getTime(), payload: { order: Number(order.id), reason: "expired", items, crowns } });
  }

  if (entries.length) {
    const seq = await appendEvents(tx, tinkerId, Number(row.last_seq), entries, content.rules.version);
    await setLastSeq(tx, tinkerId, seq);
  }
  return notes;
}
