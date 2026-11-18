// How a Tinker looks, on the server (work order 042). The body is a free
// pick; an outfit or backdrop is free, bought with Cogs, or opened by a
// faction's Favour. What is bought is kept on the Tinker's row and logged
// with its `cogs` delta, as the Cog Shop logs its own; what Favour opens is
// read from the Favour each time, so nothing is kept for it.

import * as rules from "@long-boil/rules";
import type { GameContent } from "./content-loader.js";
import { withTransaction, type Db, type Tx } from "./db.js";
import { adjustCogs, appendEvents, setLastSeq, Shortfall } from "./events.js";
import { advance, BadRequest, outcome, view, wearing, type Outcome } from "./tinkers.js";

export interface LookOffer {
  id: string;
  /** Whether the Tinker may wear it now. */
  held: boolean;
  cogs: number | null;
  /** The Favour that opens it, and where the Tinker's stands. */
  favour: { quality: string; level: number; have: number } | null;
}

export interface WardrobeView {
  cogs: number;
  wearing: rules.Wearing;
  outfits: LookOffer[];
  backdrops: LookOffer[];
}

export type WardrobeOutcome = Outcome & { wardrobe: WardrobeView };

function looksOf(content: GameContent): rules.Looks {
  if (!content.looks) throw new BadRequest("there are no looks to choose");
  return content.looks;
}

async function held(tx: Tx, tinkerId: number): Promise<{ cogs: number; bought: string[]; qualities: Record<string, number>; row: any }> {
  const row = (await tx.query("SELECT cogs, body, outfit, backdrop, looks FROM tinkers WHERE id = $1", [tinkerId])).rows[0];
  const qualities: Record<string, number> = {};
  for (const quality of (await tx.query("SELECT name, value FROM qualities WHERE tinker_id = $1 AND name LIKE 'favour.%'", [tinkerId])).rows) {
    qualities[quality.name] = Number(quality.value);
  }
  return { cogs: Number(row.cogs), bought: row.looks, qualities, row };
}

async function wardrobeView(tx: Tx, content: GameContent, tinkerId: number): Promise<WardrobeView> {
  const looks = looksOf(content);
  const { cogs, bought, qualities, row } = await held(tx, tinkerId);
  const offer = (look: rules.Look): LookOffer => ({
    id: look.id,
    held: rules.holdsLook(look, bought, qualities),
    cogs: look.cogs,
    favour: look.favour ? { ...look.favour, have: qualities[look.favour.quality] ?? 0 } : null,
  });
  return { cogs, wearing: wearing(content, row), outfits: looks.outfits.map(offer), backdrops: looks.backdrops.map(offer) };
}

/** Runs a change of look as a check-in, turning a refusal or a shortfall of Cogs into a 400. */
async function wardrobeOp(db: Db, content: GameContent, tinkerId: number, now: number, work: (tx: Tx, seq: number) => Promise<void>): Promise<WardrobeOutcome> {
  looksOf(content);
  try {
    return await withTransaction(db, async (tx) => {
      const advanced = await advance(tx, content, tinkerId, now, true);
      await work(tx, advanced.seq);
      return {
        ...outcome(await view(tx, tinkerId, content, now), advanced.events, advanced.trades, advanced.storyEvents),
        wardrobe: await wardrobeView(tx, content, tinkerId),
      };
    });
  } catch (error) {
    if (error instanceof Shortfall || error instanceof rules.ShopRefusal) throw new BadRequest(error.message);
    throw error;
  }
}

/** Every outfit and backdrop, and which of them this Tinker may wear. */
export async function readWardrobe(db: Db, content: GameContent, tinkerId: number, now: number): Promise<WardrobeOutcome> {
  return wardrobeOp(db, content, tinkerId, now, async () => undefined);
}

/** Buys an outfit or backdrop with Cogs, and puts it on. */
export async function buyLook(db: Db, content: GameContent, tinkerId: number, id: string, now: number): Promise<WardrobeOutcome> {
  return wardrobeOp(db, content, tinkerId, now, async (tx, seq) => {
    const looks = looksOf(content);
    const look = rules.findLook(looks, id);
    if (!look) throw new BadRequest(`no look ${id}`);
    const { cogs, bought, qualities } = await held(tx, tinkerId);
    const price = rules.buyLook(look, bought, qualities, cogs);
    await adjustCogs(tx, tinkerId, -price);
    const slot = looks.outfits.some((outfit) => outfit.id === id) ? "outfit" : "backdrop";
    await tx.query(`UPDATE tinkers SET looks = array_append(looks, $2), ${slot} = $2 WHERE id = $1`, [tinkerId, id]);
    const last = await appendEvents(tx, tinkerId, seq, [{ type: "look_bought", at: now, payload: { look: id, items: {}, cogs: -price } }], content.rules.version);
    await setLastSeq(tx, tinkerId, last);
  });
}

/**
 * Changes what the Tinker wears: any of its body, its outfit and its
 * backdrop, where null takes an outfit or backdrop off. A look not held is
 * refused. Nothing is logged: a look changes no number a replay would need.
 */
export async function wear(
  db: Db,
  content: GameContent,
  tinkerId: number,
  change: { body?: string; outfit?: string | null; backdrop?: string | null },
  now: number,
): Promise<WardrobeOutcome> {
  return wardrobeOp(db, content, tinkerId, now, async (tx) => {
    const looks = looksOf(content);
    const { bought, qualities } = await held(tx, tinkerId);
    if (change.body !== undefined) {
      if (!looks.bodies.some((body) => body.id === change.body)) throw new BadRequest(`no body ${change.body}`);
      await tx.query("UPDATE tinkers SET body = $2 WHERE id = $1", [tinkerId, change.body]);
    }
    for (const [slot, among] of [
      ["outfit", looks.outfits],
      ["backdrop", looks.backdrops],
    ] as const) {
      const id = change[slot];
      if (id === undefined) continue;
      if (id !== null) {
        const look = among.find((known) => known.id === id);
        if (!look) throw new BadRequest(`no ${slot} ${id}`);
        if (!rules.holdsLook(look, bought, qualities)) throw new BadRequest(`${look.name} is not yours to wear yet`);
      }
      await tx.query(`UPDATE tinkers SET ${slot} = $2 WHERE id = $1`, [tinkerId, id]);
    }
  });
}
