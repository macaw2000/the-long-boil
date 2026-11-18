// How a Tinker looks on screen (work order 042): which drawn frames stand for
// a body in an outfit, and the painting behind a portrait. A look whose
// frames have not been drawn falls back to one that has, so nobody is ever
// shown as a blank: an undyed outfit shows the body's own leathers, and a
// body not yet drawn shows the first Tinker.

import type { Looks, Wearing } from "./api";
import { art } from "./art";
import { characters, type Frames } from "./sprites";

const FIRST = "tinker";

/** The frames' prefix in sprites.ts for a body in an outfit. */
export function spriteOf(looks: Looks | null, look: Pick<Wearing, "body" | "outfit">): string {
  const body = looks?.bodies.find((known) => known.id === look.body)?.sprite ?? FIRST;
  const dyed = look.outfit ? `${body}-${look.outfit.split(".").pop()}` : null;
  if (dyed && characters[dyed]) return dyed;
  return characters[body] ? body : FIRST;
}

/** The Tinker at work, in this look. */
export function workFrames(looks: Looks | null, look: Pick<Wearing, "body" | "outfit">): Record<string, Frames> {
  return characters[spriteOf(looks, look)]!;
}

/** The Tinker holding a weapon, or undefined where this look has not been drawn with it and fights bare-handed. */
export function armedFrames(looks: Looks | null, look: Pick<Wearing, "body" | "outfit">, weapon: string | null): Record<string, Frames> | undefined {
  return weapon ? characters[`${spriteOf(looks, look)}:${weapon}`] : undefined;
}

/** The Loadout's portrait: holding the weapon where that is drawn, bare-handed where it is not. */
export function portraitFrames(looks: Looks | null, look: Pick<Wearing, "body" | "outfit">, weapon: string | null): Frames {
  const sprite = spriteOf(looks, look);
  return armedFrames(looks, look, weapon)?.portrait ?? characters[`${sprite}:bare`]?.portrait ?? characters[`${FIRST}:bare`]!.portrait!;
}

/** The bodies a player can pick between: those whose frames have been drawn. */
export function drawnBodies(looks: Looks | null): Looks["bodies"] {
  return (looks?.bodies ?? []).filter((body) => characters[body.sprite] !== undefined);
}

/** The address of a backdrop's painting, or null for the plain wall. */
export function backdropUrl(looks: Looks | null, backdrop: string | null): string | null {
  const image = looks?.backdrops.find((known) => known.id === backdrop)?.image;
  return image ? art(image) : null;
}
