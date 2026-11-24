import { describe, expect, it } from "vitest";
import { buyLook, findLook, holdsLook, readLooks, ShopRefusal } from "../src/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const looks = readLooks(JSON.parse(readFileSync(join(import.meta.dirname, "../../../../content/looks/looks.json"), "utf8")));
const SOOT = findLook(looks, "look.outfit.soot_black")!;
const GREEN = findLook(looks, "look.outfit.gaugers_green")!;
const WORKSHOP = findLook(looks, "look.backdrop.workshop")!;

describe("the Tinker's looks", () => {
  it("has two free bodies, and prices every Cog look inside GDD section 8's 5 to 30", () => {
    expect(looks.bodies.map((body) => body.id)).toEqual(["look.body.m", "look.body.f"]);
    for (const look of [...looks.outfits, ...looks.backdrops]) {
      if (look.cogs !== null) expect(look.cogs).toBeGreaterThanOrEqual(5), expect(look.cogs).toBeLessThanOrEqual(30);
      expect([look.cogs, look.favour, look.tokens].filter((way) => way !== null).length).toBeLessThanOrEqual(1);
    }
  });

  it("holds a free look from the start, a Cog look once bought, and a Favour look while the Favour stands", () => {
    expect(holdsLook(WORKSHOP, [], {})).toBe(true);
    expect(holdsLook(SOOT, [], {})).toBe(false);
    expect(holdsLook(SOOT, [SOOT.id], {})).toBe(true);
    expect(holdsLook(GREEN, [], { "favour.gaugers": 1 })).toBe(false);
    expect(holdsLook(GREEN, [], { "favour.gaugers": 2 })).toBe(true);
  });

  it("sells a Cog look once, for its price, and never sells what Favour opens", () => {
    expect(buyLook(SOOT, [], {}, 15)).toEqual({ cogs: 15, tokens: 0 });
    const plum = findLook(looks, "look.outfit.guild_plum")!;
    expect(holdsLook(plum, [], { "favour.gaugers": 7 })).toBe(false);
    expect(buyLook(plum, [], {}, 0, 20)).toEqual({ cogs: 0, tokens: 20 });
    expect(() => buyLook(plum, [], {}, 500, 19)).toThrow("20 Guild Tokens");
    expect(() => buyLook(plum, [plum.id], {}, 0, 99)).toThrow("already");
    expect(() => buyLook(SOOT, [], {}, 14)).toThrow(ShopRefusal);
    expect(() => buyLook(SOOT, [SOOT.id], {}, 100)).toThrow("already");
    expect(() => buyLook(GREEN, [], {}, 100)).toThrow("Favour");
    expect(() => buyLook(WORKSHOP, [], {}, 100)).toThrow("already");
  });
});
