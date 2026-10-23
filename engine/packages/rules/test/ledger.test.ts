import { describe, expect, it } from "vitest";
import { equip, newTinker, resolve, setQueue, summarize } from "../src/index.js";
import { loadRealContent } from "./load.js";

const content = loadRealContent();
const HOUR = 3_600_000;
const SPANNER = "action.rustmoor.tinker_brass_spanner";
const RUNT = "monster.rustmoor.rust_rat_runt";
const RATION = "item.rustmoor.rustmoor_ration";

describe("the While You Were Away ledger", () => {
  it("folds a span of work into one line per queued action", () => {
    const start = setQueue(newTinker({ "item.rustmoor.brass_ingot": 50 }, 0, 0, 1), [{ actionId: SPANNER, remaining: 50 }]);
    const ledger = summarize(resolve(start, content, HOUR).events);
    expect(ledger.lines).toEqual([
      {
        id: SPANNER,
        count: 50,
        won: 0,
        xp: { tinkering: 450 },
        crowns: 0,
        consumed: { "item.rustmoor.brass_ingot": 50 },
        produced: { "item.rustmoor.brass_spanner": 50 },
      },
    ]);
    expect(ledger.levelUps).toEqual([
      { skill: "tinkering", level: 2 },
      { skill: "tinkering", level: 3 },
    ]);
    expect(ledger.stalls).toEqual([]);
    expect(ledger.from).toBe(54_000);
    expect(ledger.to).toBe(50 * 54_000);
  });

  it("totals kills and their Crowns, and reports the Boiler running dry", () => {
    const armed = equip(newTinker({ "item.rustmoor.brass_spanner": 1, [RATION]: 300 }, 0, 0, 3), content, "item.rustmoor.brass_spanner");
    const queued = setQueue(armed, [
      { actionId: RUNT, remaining: 1_000 },
      { actionId: "action.rustmoor.smelt_brass_ingot", remaining: 1 },
    ]);
    const { events } = resolve(queued, content, 13 * HOUR);
    const ledger = summarize(events);
    const kills = events.filter((event) => event.type === "monster_killed");
    expect(ledger.lines).toHaveLength(1);
    expect(ledger.lines[0]).toMatchObject({ id: RUNT, count: kills.length });
    expect(ledger.crowns).toBe(kills.reduce((sum, event) => sum + (event.type === "monster_killed" ? event.crowns : 0), 0));
    expect(ledger.lines[0]!.crowns).toBe(ledger.crowns);
    expect(ledger.boilerDryAt).toBe(12 * HOUR);
  });

  it("is empty for no events", () => {
    expect(summarize([])).toEqual({ from: null, to: null, lines: [], crowns: 0, levelUps: [], stalls: [], boilerDryAt: null });
  });
});
