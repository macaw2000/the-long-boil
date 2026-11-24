import { describe, expect, it } from "vitest";
import { guildNameRefusal, guildPlaces, mayAct, removalRefusal, workshopAt } from "../src/index.js";

describe("guild rules", () => {
  it("names a guild with 3 to 24 letters, spaces and apostrophes", () => {
    expect(guildNameRefusal("Iron Owls")).toBeNull();
    expect(guildNameRefusal("Stokers' Own")).toBeNull();
    expect(guildNameRefusal("Ox")).toMatch(/3 to 24/);
    expect(guildNameRefusal("x".repeat(25))).toMatch(/3 to 24/);
    expect(guildNameRefusal("Owls #1")).toMatch(/letters/);
  });

  it("lets officers bring people in and the leader do the rest", () => {
    expect(mayAct("officer", "invite")).toBe(true);
    expect(mayAct("officer", "accept")).toBe(true);
    expect(mayAct("officer", "notice")).toBe(true);
    expect(mayAct("officer", "remove")).toBe(true);
    expect(mayAct("officer", "recruit")).toBe(false);
    expect(mayAct("member", "notice")).toBe(false);
    expect(mayAct("member", "invite")).toBe(false);
    expect(mayAct("leader", "disband")).toBe(true);
  });

  it("raises the Workshop by its points, two places a level, to 50", () => {
    expect(workshopAt(0)).toEqual({ level: 0, into: 0, cost: 10 });
    expect(workshopAt(9)).toEqual({ level: 0, into: 9, cost: 10 });
    expect(workshopAt(10)).toEqual({ level: 1, into: 0, cost: 20 });
    expect(workshopAt(35)).toEqual({ level: 2, into: 5, cost: 30 });
    expect(workshopAt(549).level).toBe(9);
    expect(workshopAt(550)).toEqual({ level: 10, into: 0, cost: null });
    expect([0, 10, 550, 9999].map(guildPlaces)).toEqual([30, 32, 50, 50]);
  });

  it("keeps a leader from walking out on a guild", () => {
    expect(removalRefusal("leader", "leader", true, 3)).toMatch(/hand leadership on/);
    expect(removalRefusal("leader", "leader", true, 1)).toBeNull();
    expect(removalRefusal("member", "member", true, 3)).toBeNull();
    expect(removalRefusal("member", "member", false, 3)).toMatch(/only the leader and officers/);
    expect(removalRefusal("officer", "member", false, 3)).toBeNull();
    expect(removalRefusal("officer", "officer", false, 3)).toMatch(/only the leader removes officers/);
    expect(removalRefusal("officer", "leader", false, 3)).toMatch(/cannot be removed/);
    expect(removalRefusal("leader", "officer", false, 3)).toBeNull();
  });
});
