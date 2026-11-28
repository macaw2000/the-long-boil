// Fights against the real Rustmoor content. The reference figures come from
// the combat check's NOTE lines (scripts/validate/check_combat.py), which
// hold every monster to its target time and Scrapjaw to a 50% win chance.

import { describe, expect, it } from "vitest";
import {
  combatLevel,
  equip,
  fighterFor,
  headMs,
  newTinker,
  planBoss,
  planKill,
  planCappedKill,
  levelEdge,
  resolve,
  setQueue,
  type GameEvent,
  type Piece,
  type TinkerState,
  damageTaken,
  wear,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const c = content.combat;
const RATION = "item.rustmoor.rustmoor_ration";
const RUNT = "monster.rustmoor.rust_rat_runt";
const HOUR = 3_600_000;

function xpFor(level: number) {
  return content.totalXp[level]!;
}

/** The model's reference player: main style at L, the other six combat skills at S. */
function reference(style: string, level: number, secondary: number, weapon: string, rations: number): TinkerState {
  const skillXp: Record<string, number> = {};
  for (const skill of ["vitality", "pressure", "precision", "melee", "fortitude", "marksmanship", "aetherics"]) {
    skillXp[skill] = xpFor(skill === style ? level : secondary);
  }
  const state = newTinker({ [weapon]: 1, [RATION]: rations }, 0, 0, 7);
  state.skillXp = skillXp;
  return equip(state, content, weapon);
}

/** The reference player's pieces (combat.json gear.reference_gear): the best +0 piece per slot at or below their combat level. */
function referencePieces(state: TinkerState) {
  const level = combatLevel(state.skillXp, content);
  const best = new Map<string, Piece>();
  for (const piece of content.pieces.values()) {
    if (piece.level_required > level) continue;
    const score = (p: Piece) => (p.slot === "charm" ? p.accuracy : p.armour);
    const held = best.get(piece.slot);
    if (!held || score(piece) > score(held) || (score(piece) === score(held) && piece.item < held.item)) best.set(piece.slot, piece);
  }
  return [...best.values()];
}

function plan(state: TinkerState, monsterId: string, withRations: boolean) {
  const weapon = content.weapons.get(state.weapon!)!;
  return planKill(c, fighterFor(state.skillXp, weapon, content, undefined, referencePieces(state)), content.monsters.get(monsterId)!, content.ration.heal, withRations)!;
}

describe("kill time matches the combat check", () => {
  it.each([
    ["melee", 1, 1, "item.rustmoor.brass_spanner", RUNT, 54, 72.9],
    ["marksmanship", 5, 2, "item.rustmoor.iron_rifle", "monster.rustmoor.rust_rat_scrounger", 108, 133.9],
    ["aetherics", 10, 4, "item.rustmoor.spark_rod", "monster.rustmoor.rust_rat_tinplate", 162, 194.5],
    ["melee", 15, 5, "item.rustmoor.steel_blade", "monster.rustmoor.rust_rat_gaffer", 216, 254.8],
  ])("%s %i against %s", (style, level, secondary, weapon, monster, stocked, unstocked) => {
    const state = reference(style as string, level as number, secondary as number, weapon as string, 10);
    expect(plan(state, monster as string, true).seconds).toBeCloseTo(stocked as number, 1);
    expect(plan(state, monster as string, false).seconds).toBeCloseTo(unstocked as number, 1);
  });

  it("is never faster than the monster's target, however outlevelled", () => {
    const state = reference("melee", 40, 20, "item.rustmoor.steel_blade", 10);
    expect(plan(state, RUNT, true).seconds).toBe(54);
  });
});

describe("Scrapjaw", () => {
  const scrapjaw = content.monsters.get("monster.rustmoor.scrapjaw")!;
  // What the Act I walk wears at its first attempt (combat.json boss.reference_weapon pieces, work order 032 and the 2.5% Tailoring share).
  const pieces = ["steel_shield", "iron_pot_helm", "steel_cuirass", "iron_gauntlets", "iron_sabatons", "silk_favour"]
    .map((name) => content.pieces.get(`item.rustmoor.${name}`)!);
  function win(level: number, weapon: string, style: string, rations: number) {
    const state = reference(style, level, 6, weapon, rations);
    return planBoss(c, fighterFor(state.skillXp, content.weapons.get(weapon)!, content, undefined, pieces), scrapjaw, content.ration.heal, rations).win;
  }

  // Tuned to the riveting hammer, the weapon a player holds near day 14 (work order 025), and the walk's pieces.
  it("is won half the time at level 20 with 3 Rations, the riveting hammer and the right style", () => {
    expect(win(20, "item.rustmoor.riveting_hammer", "melee", 3)).toBeCloseTo(0.501, 2);
    expect(win(19, "item.rustmoor.riveting_hammer", "melee", 3)).toBeCloseTo(0.399, 2);
    expect(win(21, "item.rustmoor.riveting_hammer", "melee", 3)).toBeCloseTo(0.596, 2);
    expect(win(20, "item.rustmoor.steel_blade", "melee", 3)).toBeCloseTo(0.73, 2);
  });

  it("punishes the wrong style and a fight without Rations", () => {
    expect(win(20, "item.rustmoor.steel_carbine", "marksmanship", 3)).toBeCloseTo(0.151, 2);
    expect(win(20, "item.rustmoor.garnet_rifle", "marksmanship", 3)).toBeCloseTo(0.383, 2);
    expect(win(20, "item.rustmoor.riveting_hammer", "melee", 0)).toBeLessThan(0.01);
  });

  it("gives Ledger Page 1 and the Cleaver on the first win, and spends 3 Rations an attempt", () => {
    let state = reference("melee", 30, 20, "item.rustmoor.steel_blade", 30);
    state = setQueue(state, [{ actionId: scrapjaw.id, remaining: 5 }]);
    const { state: after, events } = resolve(state, content, 2 * HOUR);
    const attempts = events.filter((event) => event.type === "boss_attempted") as Extract<GameEvent, { type: "boss_attempted" }>[];
    expect(attempts).toHaveLength(5);
    const firstWin = attempts.find((event) => event.won)!;
    expect(firstWin.produced).toMatchObject({ "item.rustmoor.ledger_page_1": 1, "item.rustmoor.scrapjaws_cleaver": 1 });
    expect(attempts.filter((event) => event.won && event !== firstWin).every((event) => !event.produced["item.rustmoor.ledger_page_1"])).toBe(true);
    expect(after.inventory[RATION]).toBe(15);
    expect(after.bossesBeaten).toEqual([scrapjaw.id]);
  });

  it("is not attempted out of reach, so the Rations stay in the crate", () => {
    let state = reference("melee", 12, 6, "item.rustmoor.riveting_hammer", 30);
    state = setQueue(state, [{ actionId: scrapjaw.id, remaining: 3 }]);
    const { state: after, events } = resolve(state, content, HOUR);
    expect(events.some((event) => event.type === "boss_attempted")).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: "queue_stalled", reason: "cannot_win", actionId: scrapjaw.id }));
    expect(after.inventory[RATION]).toBe(30);
  });
});

describe("drops and Rations", () => {
  it("pays Crowns, Rat Scrap and XP for each Runt, eating Rations as it goes", () => {
    let state = reference("melee", 1, 1, "item.rustmoor.brass_spanner", 342);
    state = setQueue(state, [{ actionId: RUNT, remaining: 100 }]);
    // Each kill takes the model's computed time, a hair over the 54 s target.
    const { state: after, events } = resolve(state, content, 100 * 60_000);
    const kills = events.filter((event) => event.type === "monster_killed") as Extract<GameEvent, { type: "monster_killed" }>[];
    expect(kills).toHaveLength(100);
    // A purse is 1 or 2 Crowns; once a kill is quicker than its target, it is paid at that share on average,
    // as a chance of the whole purse (work order 046), so some kills pay none.
    expect(kills.every((kill) => kill.crowns >= 0 && kill.crowns <= 2)).toBe(true);
    expect(kills[0]!.crowns).toBeGreaterThanOrEqual(1);
    expect(after.crowns).toBe(kills.reduce((sum, kill) => sum + kill.crowns, 0));
    expect(after.inventory["item.rustmoor.rat_scrap"]).toBe(100);
    // Each kill pays the Runt's XP by its share: once Ada is above the Runt her kills are faster and pay less each,
    // so XP an hour stays what it was (work order 046).
    const paid = kills.reduce((sum, kill) => sum + kill.xp.melee!, 0);
    expect(after.skillXp.melee! - state.skillXp.melee!).toBeCloseTo(paid, 6);
    expect(kills[0]!.xp.melee).toBeCloseTo(content.monsters.get(RUNT)!.xp * 0.7, 6);
    expect(paid).toBeLessThan(100 * content.monsters.get(RUNT)!.xp * 0.7);
    // At the reference, in its Rustmoor pieces (work order 032), a kill eats 0.413 Rations;
    // Ada levels up as she fights, so later kills are shorter and eat less.
    expect(plan(state, RUNT, true).rations).toBeCloseTo(0.413, 3);
    const eaten = 342 - (after.inventory[RATION] ?? 0);
    expect(eaten).toBeGreaterThan(0);
    expect(eaten).toBeLessThan(42);
  });

  it("guarantees the next Ledger Page within 1,000 Rustmoor kills, in order", () => {
    let state = reference("melee", 40, 20, "item.rustmoor.steel_blade", 5000);
    state = setQueue(state, [{ actionId: RUNT, remaining: 2000 }]);
    state.steamUntil = Infinity; // a long session, ignoring the Boiler
    const { state: after } = resolve(state, content, 2000 * 54_000);
    expect(after.inventory["item.rustmoor.ledger_page_drop_1"]).toBe(1);
    expect(after.inventory["item.rustmoor.ledger_page_drop_2"]).toBe(1);
    expect(after.inventory["item.rustmoor.ledger_page_drop_3"]).toBeUndefined();
    expect(after.pity.rustmoor!.next).toBe(2);
  });

  it("holds Ledger Pages through the Prologue, and pays the kills out after it", () => {
    let state = reference("melee", 40, 20, "item.rustmoor.steel_blade", 5000);
    state = setQueue(state, [{ actionId: RUNT, remaining: 5000 }]);
    state.steamUntil = Infinity;
    const { state: held } = resolve({ ...state, holdPages: true }, content, 1100 * 54_000);
    expect(held.inventory["item.rustmoor.ledger_page_drop_1"]).toBeUndefined();
    expect(held.pity.rustmoor!.kills).toBeGreaterThan(1000);
    const { state: after } = resolve({ ...held, holdPages: false }, content, 1102 * 54_000);
    expect(after.inventory["item.rustmoor.ledger_page_drop_1"]).toBe(1);
  });

  it("tells the screen how long the next kill takes, which is longer than the monster's floor", () => {
    const state = setQueue(reference("melee", 1, 1, "item.rustmoor.brass_spanner", 10), [{ actionId: RUNT, remaining: 2 }]);
    const ms = headMs(state, content)!;
    expect(ms).toBeGreaterThan(content.monsters.get(RUNT)!.seconds_per_kill * 1000);
    expect(resolve(state, content, ms - 1).events.some((event) => event.type === "monster_killed")).toBe(false);
    expect(resolve(state, content, ms).events.some((event) => event.type === "monster_killed")).toBe(true);
  });

  it("will not fight without a weapon", () => {
    const state = setQueue(newTinker({}, 0, 0, 1), [{ actionId: RUNT, remaining: 1 }]);
    expect(resolve(state, content, HOUR).events[0]).toMatchObject({ type: "queue_stalled", reason: "no_weapon" });
  });

  it("refuses a weapon above the Tinker's level", () => {
    const state = newTinker({ "item.rustmoor.steel_blade": 1 }, 0, 0, 1);
    expect(() => equip(state, content, "item.rustmoor.steel_blade")).toThrow(/melee 15/);
  });
});

describe("fights resolve the same in one step or many", () => {
  it("including drops, Rations and a boss", () => {
    let start = reference("melee", 12, 6, "item.rustmoor.riveting_hammer", 80);
    start = setQueue(start, [
      { actionId: "monster.rustmoor.rust_rat_tinplate", remaining: 150 },
      { actionId: "monster.rustmoor.scrapjaw", remaining: 3 },
    ]);
    const end = 10 * HOUR;
    const once = resolve(start, content, end);
    let s = 99;
    const random = () => ((s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32);
    const cuts = Array.from({ length: 60 }, () => Math.floor(random() * end)).sort((a, b) => a - b);
    let state = start;
    const events: GameEvent[] = [];
    for (const cut of [...cuts, end]) {
      const step = resolve(state, content, cut);
      state = step.state;
      events.push(...step.events);
    }
    expect(state).toEqual(once.state);
    expect(events).toEqual(once.events);
    expect(events.some((event) => event.type === "monster_killed")).toBe(true);
  });
});

describe("armour", () => {
  const COAT = "item.test.coat";
  const coat = { item: COAT, level_required: 5, armour: 20 };
  const dressed = { ...content, armours: new Map([[COAT, coat]]) };
  const GAFFER = "monster.rustmoor.rust_rat_gaffer";

  function fighter(fortitudeLevel: number, worn: typeof coat | undefined) {
    const state = reference("melee", 15, 5, "item.rustmoor.steel_blade", 0);
    state.skillXp.fortitude = xpFor(fortitudeLevel);
    return fighterFor(state.skillXp, content.weapons.get(state.weapon!)!, content, worn);
  }

  it("adds its points to Fortitude, cutting damage taken by the expected share", () => {
    const half = c.ARMOUR_HALF_POINT!;
    expect(fighter(5, coat).armour).toBe(20);
    expect(damageTaken(c, fighter(5, undefined))).toBeCloseTo(1 - 5 / (5 + half), 9);
    expect(damageTaken(c, fighter(5, coat))).toBeCloseTo(1 - 25 / (25 + half), 9);
    // Less damage means fewer Rations eaten a kill, and less time spent eating them.
    const gaffer = content.monsters.get(GAFFER)!;
    const bare = planKill(c, fighter(5, undefined), gaffer, content.ration.heal, true)!;
    const clad = planKill(c, fighter(5, coat), gaffer, content.ration.heal, true)!;
    expect(clad.rations).toBeLessThan(bare.rations);
    expect(clad.seconds).toBeLessThanOrEqual(bare.seconds);
  });

  it("counts for nothing below its Fortitude level, and cannot be put on", () => {
    expect(fighter(4, coat).armour).toBe(0);
    const state = reference("melee", 15, 4, "item.rustmoor.steel_blade", 0);
    state.inventory[COAT] = 1;
    expect(() => wear(state, dressed, COAT)).toThrow(/fortitude 5/);
    state.skillXp.fortitude = xpFor(5);
    expect(wear(state, dressed, COAT).armour).toBe(COAT);
  });

  it("wears the Cinderworks' goggles and coats in the six slots, no longer the old armour slot (work order 034)", () => {
    const slots = Object.fromEntries(
      ["gauze_goggles", "furnace_goggles", "founders_goggles", "slag_wool_coat", "studded_felt_coat"].map((id) => {
        const piece = content.pieces.get(`item.cinderworks.${id}`)!;
        expect(piece.armour).toBe(3 + (3 * piece.level_required) / 16);
        return [id, `${piece.slot} ${piece.level_required}`];
      }),
    );
    expect(slots).toEqual({
      gauze_goggles: "head 20",
      furnace_goggles: "head 30",
      founders_goggles: "head 40",
      slag_wool_coat: "body 20",
      studded_felt_coat: "body 25",
    });
    expect(content.armours.size).toBe(0);
  });

  it("cannot be put on without holding it", () => {
    const state = reference("melee", 15, 5, "item.rustmoor.steel_blade", 0);
    expect(() => wear(state, dressed, COAT)).toThrow(/do not have/);
  });
});

describe("strength you can see (work order 046)", () => {
  const runt = content.monsters.get(RUNT)!;
  const capped = (state: TinkerState) => planCappedKill(content, state.skillXp, fighterFor(state.skillXp, content.weapons.get(state.weapon!)!, content), runt, true)!;

  it("gives no edge at the monster's own level, 4% a level above it, and never more than half", () => {
    expect(levelEdge(1, 1)).toBe(1);
    expect(levelEdge(4, 1)).toBeCloseTo(0.88, 9);
    expect(levelEdge(60, 1)).toBe(0.5);
    expect(levelEdge(3, 10)).toBe(1);
  });

  it("makes each Melee level a faster Runt, and pays XP by the same share so XP an hour does not move", () => {
    const at1 = capped(reference("melee", 1, 1, "item.rustmoor.brass_spanner", 100));
    const at4 = capped(reference("melee", 4, 1, "item.rustmoor.brass_spanner", 100));
    const at30 = capped(reference("melee", 30, 10, "item.rustmoor.brass_spanner", 100));
    expect(at1.xpShare).toBe(1);
    expect(at4.seconds).toBeLessThan(at1.seconds - 5);
    expect(at30.seconds).toBeCloseTo(27, 6);
    for (const plan of [at4, at30]) expect(plan.xpShare / plan.seconds).toBeCloseTo(1 / runt.seconds_per_kill, 9);
  });

  it("pays Crowns an hour as it did at the monster's level, while items come faster", () => {
    const night = (level: number) => {
      const start = setQueue(reference("melee", level, Math.min(level, 10), "item.rustmoor.brass_spanner", 5000), [{ actionId: RUNT, remaining: 5000 }]);
      const { state, events } = resolve(start, content, 12 * HOUR);
      const kills = events.filter((event) => event.type === "monster_killed").length;
      return { crowns: state.crowns, kills };
    };
    const slow = night(1);
    const quick = night(20);
    // About half again as many kills (the edge is at its floor of a half), but the Crowns stay within a tenth.
    expect(quick.kills).toBeGreaterThan(slow.kills * 1.6);
    expect(Math.abs(quick.crowns - slow.crowns) / slow.crowns).toBeLessThan(0.1);
  });
});
