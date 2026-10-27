// The Cog Shop (GDD section 8, Monetization and Fairness). Gilded Cogs buy
// time savers, never power or story. A Cog Crate is an ordinary item holding
// a crate's worth of Cogs, so it can be opened or sold on the Exchange, and a
// bought crate is locked before either. These are the shop's terms and its
// pure checks; the server keeps each Tinker's Cogs and upgrades.

const HOUR_MS = 3_600_000;

export interface CogShop {
  /** The crate item, the Cogs inside, its price in US cents, how long a bought one stays locked, and its Exchange tax. */
  crate: { item: string; cogs: number; priceCents: number; lockHours: number; exchangeTax: number };
  /** One more queue slot, up to `slots`. */
  queueSlot: { cogs: number; slots: number };
  /** `hours` more of the Boiler, up to `maxHours`. */
  boilerUpgrade: { cogs: number; hours: number; maxHours: number };
  /** The Night Lamp raises the Nerve cap; it buys no Nerve. */
  nightLamp: { cogs: number; nerveCap: number };
  /** The Boiler Boost: `percent` faster work for `hours`, stacking onto any Boost already burning. */
  boost: { cogs: number; percent: number; hours: number };
}

export const PURCHASES = ["queue_slot", "boiler_upgrade", "night_lamp", "boiler_boost"] as const;
export type Purchase = (typeof PURCHASES)[number];

export interface Upgrades {
  queueSlots: number;
  boilerHours: number;
  nerveCap: number;
  /** Epoch ms the Boiler Boost burns out; 0 when none was ever bought. */
  boostUntil: number;
}

export class ShopRefusal extends Error {}

/** Each purchase's price as of these upgrades, or null when it is already at its most. */
export function priceOf(shop: CogShop, upgrades: Upgrades, what: Purchase): number | null {
  switch (what) {
    case "queue_slot":
      return upgrades.queueSlots >= shop.queueSlot.slots ? null : shop.queueSlot.cogs;
    case "boiler_upgrade":
      return upgrades.boilerHours >= shop.boilerUpgrade.maxHours ? null : shop.boilerUpgrade.cogs;
    case "night_lamp":
      return upgrades.nerveCap >= shop.nightLamp.nerveCap ? null : shop.nightLamp.cogs;
    case "boiler_boost":
      return shop.boost.cogs;
  }
}

/** What a purchase costs and the upgrades it leaves; refuses one already at its most, or one the Cogs do not cover. */
export function buy(shop: CogShop, upgrades: Upgrades, what: Purchase, cogs: number, now: number): { cogs: number; upgrades: Upgrades } {
  const price = priceOf(shop, upgrades, what);
  if (price === null) throw new ShopRefusal("you already have the most of that");
  if (cogs < price) throw new ShopRefusal(`that costs ${price} Cogs; you have ${cogs}`);
  const next = { ...upgrades };
  switch (what) {
    case "queue_slot":
      next.queueSlots += 1;
      break;
    case "boiler_upgrade":
      next.boilerHours = Math.min(shop.boilerUpgrade.maxHours, next.boilerHours + shop.boilerUpgrade.hours);
      break;
    case "night_lamp":
      next.nerveCap = shop.nightLamp.nerveCap;
      break;
    case "boiler_boost":
      next.boostUntil = Math.max(now, next.boostUntil) + shop.boost.hours * HOUR_MS;
      break;
  }
  return { cogs: price, upgrades: next };
}

/** How long a go takes under the Boost: `percent` faster, so the time is divided by 1 + percent/100. */
export function boostedMs(ms: number, percent: number): number {
  return Math.round((ms * 100) / (100 + percent));
}

/** The shop's terms from content/tuning/cog-shop.json (schema tuning.cog_shop/1). */
export function readCogShop(file: any): CogShop {
  return {
    crate: {
      item: file.crate.item,
      cogs: file.crate.cogs,
      priceCents: file.crate.price_usd_cents,
      lockHours: file.crate.lock_hours,
      exchangeTax: file.crate.exchange_tax,
    },
    queueSlot: { cogs: file.queue_slot.cogs, slots: file.queue_slot.slots },
    boilerUpgrade: { cogs: file.boiler_upgrade.cogs, hours: file.boiler_upgrade.hours, maxHours: file.boiler_upgrade.max_hours },
    nightLamp: { cogs: file.night_lamp.cogs, nerveCap: file.night_lamp.nerve_cap },
    boost: { cogs: file.boiler_boost.cogs, percent: file.boiler_boost.speed_percent, hours: file.boiler_boost.hours },
  };
}
