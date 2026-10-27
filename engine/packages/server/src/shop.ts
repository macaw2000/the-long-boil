// The Cog Shop on the server (GDD section 8). Crates wait out their lock in
// crate_deliveries and land in the inventory, unbound, the first time the
// Tinker is touched after it ends. An opened crate becomes Cogs; Cogs buy the
// rules' upgrades, which are kept on the Tinker's row. Every change is logged
// with its `items` and `cogs` deltas, as the Exchange logs its own.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { adjustCogs, adjustUnbound, appendEvents, setLastSeq, Shortfall } from "./events.js";
import { advance, BadRequest, NotFound, outcome, view, type Outcome } from "./tinkers.js";

const HOUR_MS = 3_600_000;

export interface ShopView {
  cogs: number;
  crate: { item: string; cogs: number; priceCents: number; lockHours: number; exchangeTax: number };
  /** Unbound crates held, which can be opened. */
  crates: number;
  /** Crates still locked, soonest first. */
  arriving: { qty: number; unlocksAt: string }[];
  offers: { id: rules.Purchase; cogs: number | null }[];
  upgrades: { queueSlots: number; boilerHours: number; nerveCap: number; boostUntil: string | null };
  terms: rules.CogShop;
}

function shopOf(content: GameContent): rules.CogShop {
  if (!content.rules.shop) throw new BadRequest("there is no Cog Shop");
  return content.rules.shop;
}

/** Puts every crate whose lock has ended into the inventory. Runs inside advance(), after the Exchange settles. */
export async function deliverCrates(tx: Tx, content: GameContent, tinkerId: number, now: number): Promise<void> {
  const shop = content.rules.shop;
  if (!shop) return;
  const due = (
    await tx.query(
      `UPDATE crate_deliveries SET delivered_at = $2 WHERE tinker_id = $1 AND delivered_at IS NULL AND unlocks_at <= $2
       RETURNING id, qty, source, unlocks_at`,
      [tinkerId, new Date(now)],
    )
  ).rows;
  if (!due.length) return;
  for (const delivery of due) await adjustUnbound(tx, tinkerId, shop.crate.item, delivery.qty);
  const seq = Number((await tx.query("SELECT last_seq FROM tinkers WHERE id = $1", [tinkerId])).rows[0].last_seq);
  const last = await appendEvents(
    tx,
    tinkerId,
    seq,
    due.map((delivery) => ({
      type: "crates_delivered",
      at: delivery.unlocks_at.getTime(),
      payload: { delivery: Number(delivery.id), source: delivery.source, items: { [shop.crate.item]: delivery.qty }, cogs: 0 },
    })),
    content.rules.version,
  );
  await setLastSeq(tx, tinkerId, last);
}

async function upgradesOf(tx: Tx, tinkerId: number): Promise<rules.Upgrades & { cogs: number }> {
  const row = (await tx.query("SELECT cogs, queue_slots, boiler_hours, nerve_cap, boost_until FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  return {
    cogs: Number(row.cogs),
    queueSlots: row.queue_slots,
    boilerHours: row.boiler_hours,
    nerveCap: row.nerve_cap,
    boostUntil: row.boost_until.getTime(),
  };
}

async function shopView(tx: Tx, content: GameContent, tinkerId: number, now: number): Promise<ShopView> {
  const shop = shopOf(content);
  const { cogs, ...upgrades } = await upgradesOf(tx, tinkerId);
  const crates = Number(
    (await tx.query("SELECT qty FROM inventory WHERE tinker_id = $1 AND item = $2 AND NOT bound", [tinkerId, shop.crate.item])).rows[0]?.qty ?? 0,
  );
  const arriving = (
    await tx.query("SELECT qty, unlocks_at FROM crate_deliveries WHERE tinker_id = $1 AND delivered_at IS NULL ORDER BY unlocks_at, id", [tinkerId])
  ).rows.map((row) => ({ qty: row.qty, unlocksAt: row.unlocks_at.toISOString() }));
  return {
    cogs,
    crate: shop.crate,
    crates,
    arriving,
    offers: rules.PURCHASES.map((id) => ({ id, cogs: rules.priceOf(shop, upgrades, id) })),
    upgrades: { ...upgrades, boostUntil: upgrades.boostUntil > now ? new Date(upgrades.boostUntil).toISOString() : null },
    terms: shop,
  };
}

export type ShopOutcome = Outcome & { shop: ShopView };

/** Runs a shop operation as a check-in, turning a shortfall of crates or Cogs into a 400. */
async function shopOp(
  db: Db,
  content: GameContent,
  tinkerId: number,
  now: number,
  work: (tx: Tx, seq: number) => Promise<void>,
): Promise<ShopOutcome> {
  shopOf(content);
  try {
    return await withTransaction(db, async (tx) => {
      const advanced = await advance(tx, content, tinkerId, now, true);
      await work(tx, advanced.seq);
      return {
        ...outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents),
        shop: await shopView(tx, content, tinkerId, now),
      };
    });
  } catch (error) {
    if (error instanceof Shortfall || error instanceof rules.ShopRefusal) throw new BadRequest(error.message);
    throw error;
  }
}

/** The shop as this Tinker sees it, brought up to now so any crate whose lock has ended is delivered. */
export async function readShop(db: Db, content: GameContent, tinkerId: number, now: number): Promise<ShopOutcome> {
  return shopOp(db, content, tinkerId, now, async () => undefined);
}

/** Opens unbound crates for their Cogs. */
export async function openCrates(db: Db, content: GameContent, tinkerId: number, qty: number, now: number): Promise<ShopOutcome> {
  if (!Number.isInteger(qty) || qty < 1) throw new BadRequest("a count must be a whole number of at least 1");
  return shopOp(db, content, tinkerId, now, async (tx, seq) => {
    const { crate } = shopOf(content);
    await adjustUnbound(tx, tinkerId, crate.item, -qty);
    await adjustCogs(tx, tinkerId, qty * crate.cogs);
    const last = await appendEvents(
      tx,
      tinkerId,
      seq,
      [{ type: "crates_opened", at: now, payload: { qty, items: { [crate.item]: -qty }, cogs: qty * crate.cogs } }],
      content.rules.version,
    );
    await setLastSeq(tx, tinkerId, last);
  });
}

/**
 * Buys one upgrade with Cogs. A Boiler upgrade refills the Boiler to its new
 * hours, as the check-in before it refilled it to the old ones; the Boost
 * speeds each go that starts while it burns.
 */
export async function buyUpgrade(db: Db, content: GameContent, tinkerId: number, what: rules.Purchase, now: number): Promise<ShopOutcome> {
  return shopOp(db, content, tinkerId, now, async (tx, seq) => {
    const { cogs, ...upgrades } = await upgradesOf(tx, tinkerId);
    const bought = rules.buy(shopOf(content), upgrades, what, cogs, now);
    await adjustCogs(tx, tinkerId, -bought.cogs);
    const next = bought.upgrades;
    await tx.query(
      `UPDATE tinkers SET queue_slots = $2, boiler_hours = $3, nerve_cap = $4, boost_until = $5,
         steam_until = CASE WHEN $3 > boiler_hours THEN $6 ELSE steam_until END
       WHERE id = $1`,
      [tinkerId, next.queueSlots, next.boilerHours, next.nerveCap, new Date(next.boostUntil), new Date(now + next.boilerHours * HOUR_MS)],
    );
    const last = await appendEvents(
      tx,
      tinkerId,
      seq,
      [{ type: "shop_bought", at: now, payload: { purchase: what, upgrades: next, items: {}, cogs: -bought.cogs } }],
      content.rules.version,
    );
    await setLastSeq(tx, tinkerId, last);
  });
}

/**
 * Queues crates for a Tinker: an admin's grant now, a Stripe payment in the
 * next step. A grant is unlocked unless `locked`; a payment always waits out
 * the lock. A `reference` already used delivers nothing more.
 */
export async function grantCrates(
  db: Db,
  content: GameContent,
  tinkerId: number,
  qty: number,
  now: number,
  options: { locked?: boolean; source?: "grant" | "stripe"; reference?: string } = {},
): Promise<ShopOutcome> {
  if (!Number.isInteger(qty) || qty < 1) throw new BadRequest("a count must be a whole number of at least 1");
  const { crate } = shopOf(content);
  const source = options.source ?? "grant";
  const lockMs = source === "stripe" || options.locked ? crate.lockHours * HOUR_MS : 0;
  const known = await db.query("SELECT 1 FROM tinkers WHERE id = $1", [tinkerId]);
  if (!known.rowCount) throw new NotFound(`no Tinker ${tinkerId}`);
  await db.query(
    `INSERT INTO crate_deliveries (tinker_id, qty, source, reference, created_at, unlocks_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (reference) DO NOTHING`,
    [tinkerId, qty, source, options.reference ?? null, new Date(now), new Date(now + lockMs)],
  );
  // Reading the shop delivers the crates at once when they are not locked.
  return readShop(db, content, tinkerId, now);
}
