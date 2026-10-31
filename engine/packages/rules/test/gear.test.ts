// Gear and tools (work order 029): the six combat-level slots, a tool per
// skill, and the kill-time cap. No gear/2 content exists yet, so the pieces
// and tools here are made up, at the rules' +0 values: armour 3 + 3L/16,
// Charm accuracy 1 + L/20, tool speed L percent.

import { describe, expect, it } from "vitest";
import {
  combatLevel,
  equip,
  fighterFor,
  newTinker,
  planCappedKill,
  planKill,
  resolve,
  setQueue,
  wear,
  type Content,
  type Piece,
  type Tool,
  type TinkerState,
} from "../src/index.js";
import { loadRealContent } from "./load.js";

const real = loadRealContent();
const SPANNER = "item.rustmoor.brass_spanner";
const RATION = "item.rustmoor.rustmoor_ration";
const COPPER = "action.rustmoor.prospect_copper";
const GAFFER = "monster.rustmoor.rust_rat_gaffer";

const piece = (slot: Piece["slot"], level: number): Piece => ({
  item: `item.test.${slot}_${level}`,
  slot,
  level_required: level,
  armour: slot === "charm" ? 0 : 3 + (3 * level) / 16,
  accuracy: slot === "charm" ? 1 + level / 20 : 0,
});
const PIECES = (["off_hand", "head", "body", "hands", "feet", "charm"] as const).flatMap((slot) => [piece(slot, 1), piece(slot, 10)]);
const PICK: Tool = { item: "item.test.pick", skill: "prospecting", level_required: 1, speed: 10 };
const content: Content = {
  ...real,
  pieces: new Map(PIECES.map((p) => [p.item, p])),
  tools: new Map([[PICK.item, PICK]]),
  killTimeCap: 0.75,
};

function tinker(levels: Record<string, number>, items: string[] = []): TinkerState {
  const state = newTinker({ [SPANNER]: 1, [RATION]: 1000, ...Object.fromEntries(items.map((item) => [item, 1])) }, 0, 0, 7);
  for (const [skill, level] of Object.entries(levels)) state.skillXp[skill] = content.totalXp[level]!;
  return equip(state, content, SPANNER);
}

describe("the six combat-level slots", () => {
  it("are worn by combat level, the highest attack style", () => {
    const state = tinker({ melee: 9, fortitude: 1 }, [piece("head", 10).item]);
    expect(combatLevel(state.skillXp, content)).toBe(9);
    expect(() => wear(state, content, piece("head", 10).item)).toThrow(/combat level 10/);
    state.skillXp.marksmanship = content.totalXp[10]!;
    expect(wear(state, content, piece("head", 10).item).worn.head).toBe(piece("head", 10).item);
  });

  it("add their armour to Fortitude, and the Charm's accuracy to the weapon's", () => {
    const state = tinker({ melee: 10 });
    const weapon = content.weapons.get(SPANNER)!;
    const bare = fighterFor(state.skillXp, weapon, content);
    const dressed = fighterFor(state.skillXp, weapon, content, undefined, PIECES.filter((p) => p.level_required === 10));
    expect(dressed.armour - bare.armour).toBeCloseTo(5 * (3 + 30 / 16), 9);
    expect(dressed.accuracy - bare.accuracy).toBeCloseTo(1.5, 9);
  });
});

describe("the kill-time cap", () => {
  it("never moves a Tinker in reference gear off the target time", () => {
    const state = tinker({ melee: 15, vitality: 5, pressure: 5, precision: 5, fortitude: 5, marksmanship: 5, aetherics: 5 });
    const weapon = content.weapons.get("item.rustmoor.steel_blade")!;
    const reference = PIECES.filter((p) => p.level_required === 10);
    const fighter = fighterFor(state.skillXp, weapon, content, undefined, reference);
    const gaffer = content.monsters.get(GAFFER)!;
    expect(planCappedKill(content, state.skillXp, fighter, gaffer, true)!.seconds).toBe(planKill(content.combat, fighter, gaffer, content.ration.heal, true)!.seconds);
  });

  it("lets gear ahead of the Tinker's level cut a kill, to three quarters at most", () => {
    const state = tinker({ melee: 15, vitality: 5, pressure: 5, precision: 5, fortitude: 5, marksmanship: 5, aetherics: 5 });
    const gaffer = content.monsters.get(GAFFER)!;
    const blade = content.weapons.get("item.rustmoor.steel_blade")!;
    const strong = { ...blade, item: "item.test.calibrated_blade", power: blade.power * 3 };
    const fighter = fighterFor(state.skillXp, strong, content, undefined, PIECES.filter((p) => p.level_required === 10));
    const plan = planCappedKill(content, state.skillXp, fighter, gaffer, true)!;
    expect(plan.seconds).toBeLessThan(gaffer.seconds_per_kill);
    expect(plan.seconds).toBeGreaterThanOrEqual(gaffer.seconds_per_kill * 0.75);
  });
});

describe("tools", () => {
  it("speed their skill's work by their percent, and a go keeps the speed it started with", () => {
    const state = tinker({ prospecting: 1 }, [PICK.item]);
    const held = wear(state, content, PICK.item);
    const queued = setQueue(held, [{ actionId: COPPER, remaining: 100 }]);
    // 54 s at +10%: 54000 * 100 / 110 = 49090.9, rounded once to 49091 ms.
    const after = resolve(queued, content, 49_091);
    expect(after.events.filter((event) => event.type === "action_completed")).toHaveLength(1);
    expect(after.state.headTool).toBe(10);
    // Taking the pick off mid-go leaves the go at the speed it started with.
    const mid = resolve(queued, content, 20_000).state;
    const bare = { ...mid, tools: {} };
    const finished = resolve(bare, content, 49_091);
    expect(finished.events.filter((event) => event.type === "action_completed")).toHaveLength(1);
  });

  it("need their skill's level, and are ignored when not held", () => {
    const state = tinker({ prospecting: 1 }, [PICK.item]);
    const steep = { ...content, tools: new Map([[PICK.item, { ...PICK, level_required: 5 }]]) };
    expect(() => wear(state, steep, PICK.item)).toThrow(/prospecting 5/);
    const dropped = { ...wear(state, content, PICK.item), inventory: { ...state.inventory, [PICK.item]: 0 } };
    const after = resolve(setQueue(dropped, [{ actionId: COPPER, remaining: 10 }]), content, 54_000);
    expect(after.events.filter((event) => event.type === "action_completed")).toHaveLength(1);
    expect(after.state.headTool).toBe(0);
  });
});

describe("a queued piece runs its whole chain (Jeremy, 30 October 2026)", () => {
  const BREASTPLATE = "action.rustmoor.forge_brass_breastplate";

  it("prospects and smelts what it lacks inside the one entry, and counts only the piece", () => {
    const state = newTinker({}, 0, 0, 7);
    const queued = setQueue(state, [{ actionId: BREASTPLATE, remaining: 1 }]);
    // 23 Brass Ingots, each a 54 s prospect and a 54 s smelt, then a 54 s forge: 47 goes.
    const early = resolve(queued, real, 46 * 54_000);
    expect(early.state.inventory["item.rustmoor.brass_breastplate"] ?? 0).toBe(0);
    expect(early.state.queue[0]?.remaining).toBe(1);
    const done = resolve(queued, real, 47 * 54_000);
    expect(done.state.inventory["item.rustmoor.brass_breastplate"]).toBe(1);
    expect(done.state.inventory["item.rustmoor.brass_ingot"] ?? 0).toBe(0);
    expect(done.state.queue).toEqual([]);
    const made = done.events.filter((event) => event.type === "action_completed").map((event) => (event as { actionId: string }).actionId);
    expect(made.filter((id) => id === "action.rustmoor.prospect_copper")).toHaveLength(23);
    expect(made.filter((id) => id === "action.rustmoor.smelt_brass_ingot")).toHaveLength(23);
  });

  it("uses what is in stores first, and leaves non-gear work to stall on missing inputs", () => {
    const stocked = setQueue(newTinker({ "item.rustmoor.brass_ingot": 23 }, 0, 0, 7), [{ actionId: BREASTPLATE, remaining: 1 }]);
    expect(resolve(stocked, real, 54_000).state.inventory["item.rustmoor.brass_breastplate"]).toBe(1);
    const smelt = setQueue(newTinker({}, 0, 0, 7), [{ actionId: "action.rustmoor.smelt_brass_ingot", remaining: 1 }]);
    expect(resolve(smelt, real, 54_000).events[0]).toMatchObject({ type: "queue_stalled", reason: "inputs" });
  });
});
