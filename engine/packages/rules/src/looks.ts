// How a Tinker looks (work order 042; GDD section 8, "Looks only"). A body is
// a free pick. An outfit is a dye of the leathers the body is drawn in, and a
// backdrop is a painting behind the portrait; each is free, bought with Cogs,
// or opened by a faction's Favour, or bought with Guild Tokens. None of it touches a number: these are the
// terms and the pure checks, and the server keeps what each Tinker wears.

import { ShopRefusal } from "./shop.js";

export interface Look {
  id: string;
  name: string;
  description: string;
  /** Its price in the Cog Shop, or null when Cogs do not buy it. */
  cogs: number | null;
  /** The Favour that opens it, or null when Favour does not. */
  favour: { quality: string; level: number } | null;
  /** Its price in Guild Tokens (work order 043), or null when they do not buy it. */
  tokens: number | null;
}

export interface Outfit extends Look {
  /** The leathers' new hue in degrees, and what their drawn saturation and brightness are multiplied by. */
  dye: { hue: number; saturation: number; value: number };
}

export interface Backdrop extends Look {
  /** The painting's path under art/. */
  image: string;
}

export interface Looks {
  /** The free picks, the first being what a Tinker who has not picked is shown as; `sprite` prefixes the body's frames. */
  bodies: { id: string; sprite: string }[];
  outfits: Outfit[];
  backdrops: Backdrop[];
}

/** What a Tinker is wearing: a body, and an outfit and backdrop or null for the plain ones. */
export interface Wearing {
  body: string;
  outfit: string | null;
  backdrop: string | null;
}

/** The outfit or backdrop with this id, or undefined. */
export function findLook(looks: Looks, id: string): Look | undefined {
  return looks.outfits.find((look) => look.id === id) ?? looks.backdrops.find((look) => look.id === id);
}

/** Whether a Tinker may wear a look: it is free, it was bought, or the Favour that opens it stands high enough. */
export function holdsLook(look: Look, bought: readonly string[], qualities: Readonly<Record<string, number>>): boolean {
  if (look.cogs === null && look.favour === null && look.tokens === null) return true;
  if (bought.includes(look.id)) return true;
  return look.favour !== null && (qualities[look.favour.quality] ?? 0) >= look.favour.level;
}

/** A look's price for a Tinker with these Cogs and Guild Tokens; refuses one neither buys, one already held, or one they do not cover. */
export function buyLook(look: Look, bought: readonly string[], qualities: Readonly<Record<string, number>>, cogs: number, tokens = 0): { cogs: number; tokens: number } {
  if (holdsLook(look, bought, qualities)) throw new ShopRefusal("you already have that");
  if (look.tokens !== null) {
    if (tokens < look.tokens) throw new ShopRefusal(`that costs ${look.tokens} Guild Tokens; you have ${tokens}`);
    return { cogs: 0, tokens: look.tokens };
  }
  if (look.cogs === null) throw new ShopRefusal("Cogs do not buy that; a faction's Favour opens it");
  if (cogs < look.cogs) throw new ShopRefusal(`that costs ${look.cogs} Cogs; you have ${cogs}`);
  return { cogs: look.cogs, tokens: 0 };
}

/** The looks from content/looks/looks.json (schema looks/1). */
export function readLooks(file: any): Looks {
  const look = (entry: any): Look => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    cogs: entry.cogs ?? null,
    favour: entry.favour ? { quality: entry.favour.quality, level: entry.favour.level } : null,
    tokens: entry.tokens ?? null,
  });
  return {
    bodies: file.bodies.map((body: any) => ({ id: body.id, sprite: body.sprite })),
    outfits: file.outfits.map((entry: any) => ({ ...look(entry), dye: { hue: entry.dye.hue, saturation: entry.dye.saturation, value: entry.dye.value } })),
    backdrops: file.backdrops.map((entry: any) => ({ ...look(entry), image: entry.image })),
  };
}
