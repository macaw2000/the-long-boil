// Appending to a Tinker's ordered event log, and the direct projection
// changes the Exchange makes outside the rules. An Exchange event's payload
// always carries `items` and `crowns` deltas, so the log alone rebuilds
// the inventory and the purse.

import type { Tx } from "./db.js";

export type LogEntry = { type: string; at: number; payload: unknown };

export async function appendEvents(tx: Tx, tinkerId: number, lastSeq: number, entries: LogEntry[], version: string): Promise<number> {
  let seq = lastSeq;
  for (const entry of entries) {
    seq += 1;
    await tx.query(
      "INSERT INTO events (tinker_id, seq, type, at, payload, content_version) VALUES ($1, $2, $3, $4, $5, $6)",
      [tinkerId, seq, entry.type, new Date(entry.at), JSON.stringify(entry.payload), version],
    );
  }
  return seq;
}

export class Shortfall extends Error {}

/** Changes a Tinker's unbound stack of an item. Bound stock is never sold or escrowed. */
export async function adjustUnbound(tx: Tx, tinkerId: number, item: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const held = Number(
    (await tx.query("SELECT qty FROM inventory WHERE tinker_id = $1 AND item = $2 AND NOT bound", [tinkerId, item])).rows[0]?.qty ?? 0,
  );
  const qty = held + delta;
  if (qty < 0) throw new Shortfall(`you hold ${held} unbound ${item}, not ${-delta}`);
  if (qty === 0) {
    await tx.query("DELETE FROM inventory WHERE tinker_id = $1 AND item = $2 AND NOT bound", [tinkerId, item]);
  } else {
    await tx.query(
      `INSERT INTO inventory (tinker_id, item, bound, qty) VALUES ($1, $2, false, $3)
       ON CONFLICT (tinker_id, item, bound) DO UPDATE SET qty = EXCLUDED.qty`,
      [tinkerId, item, qty],
    );
  }
}

export async function adjustCrowns(tx: Tx, tinkerId: number, delta: number): Promise<void> {
  if (delta === 0) return;
  const row = (
    await tx.query("UPDATE tinkers SET crowns = crowns + $2 WHERE id = $1 AND crowns + $2 >= 0 RETURNING crowns", [tinkerId, delta])
  ).rows[0];
  if (!row) throw new Shortfall(`not enough Crowns for ${-delta}`);
}

export async function setLastSeq(tx: Tx, tinkerId: number, seq: number): Promise<void> {
  await tx.query("UPDATE tinkers SET last_seq = $2 WHERE id = $1", [tinkerId, seq]);
}
