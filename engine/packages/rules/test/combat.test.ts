// Fights against the real Rustmoor content. The reference figures come from
// the combat check's NOTE lines (scripts/validate/check_combat.py), which
// hold every monster to its target time and Scrapjaw to a 50% win chance.

import { describe, expect, it } from "vitest";
import {
  equip,
  fighterFor,
  headMs,
  newTinker,
  planBoss,
  planKill,
  resolve,
  setQueue,
  type GameEvent,
  type TinkerState,
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

function plan(state: TinkerState, monsterId: string, withRations: boolean) {
  const weapon = content.weapons.get(state.weapon!)!;
  return planKill(c, fighterFor(state.skillXp, weapon, content), content.monsters.get(monsterId)!, content.ration.heal, withRations)!;
}

describe("kill time matches the combat check", () => {
  it.each([
    ["melee", 1, 1, "item.rustmoor.brass_spanner", RUNT, 54, 73.0],
    ["marksmanship", 5, 2, "item.rustmoor.iron_rifle", "monster.rustmoor.rust_rat_scrounger", 108, 133.9],
    ["aetherics", 10, 4, "item.rustmoor.spark_rod", "monster.rustmoor.rust_rat_tinplate", 162, 194.3],
    ["melee", 15, 5, "item.rustmoor.steel_blade", "monster.rustmoor.rust_rat_gaffer", 216, 254.9],
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
  function win(level: number, weapon: string, style: string, rations: number) {
    const state = reference(style, level, 6, weapon, rations);
    return planBoss(c, fighterFor(state.skillXp, content.weapons.get(weapon)!, content), scrapjaw, content.ration.heal, rations).win;
  }

  it("is won half the time at level 20 with 3 Rations and the right style", () => {
    expect(win(20, "item.rustmoor.steel_blade", "melee", 3)).toBeCloseTo(0.5, 2);
    expect(win(19, "item.rustmoor.steel_blade", "melee", 3)).toBeCloseTo(0.405, 2);
    expect(win(21, "item.rustmoor.steel_blade", "melee", 3)).toBeCloseTo(0.589, 2);
  });

  it("punishes the wrong style and a fight without Rations", () => {
    expect(win(20, "item.rustmoor.garnet_rifle", "marksmanship", 3)).toBeCloseTo(0.152, 2);
    expect(win(20, "item.rustmoor.steel_blade", "melee", 0)).toBeLessThan(0.01);
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
});

describe("drops and Rations", () => {
  it("pays Crowns, Rat Scrap and XP for each Runt, eating Rations as it goes", () => {
    let state = reference("melee", 1, 1, "item.rustmoor.brass_spanner", 342);
    state = setQueue(state, [{ actionId: RUNT, remaining: 100 }]);
    // Each kill takes the model's computed time, a hair over the 54 s target.
    const { state: after, events } = resolve(state, content, 100 * 60_000);
    const kills = events.filter((event) => event.type === "monster_killed") as Extract<GameEvent, { type: "monster_killed" }>[];
    expect(kills).toHaveLength(100);
    expect(kills.every((kill) => kill.crowns >= 5 && kill.crowns <= 9)).toBe(true);
    expect(after.crowns).toBe(kills.reduce((sum, kill) => sum + kill.crowns, 0));
    expect(after.inventory["item.rustmoor.rat_scrap"]).toBe(100);
    expect(after.skillXp.melee! - state.skillXp.melee!).toBeCloseTo(100 * 9 * 0.7, 6);
    // At the reference a kill eats 0.416 Rations (combat.json rations.reference_use);
    // Ada levels up as she fights, so later kills are shorter and eat less.
    expect(plan(state, RUNT, true).rations).toBeCloseTo(0.416, 3);
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
