import { describe, expect, it } from "vitest";
import { guildNameRefusal, mayAct, removalRefusal } from "../src/index.js";

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
    expect(mayAct("officer", "remove")).toBe(false);
    expect(mayAct("member", "invite")).toBe(false);
    expect(mayAct("leader", "disband")).toBe(true);
  });

  it("keeps a leader from walking out on a guild", () => {
    expect(removalRefusal("leader", "leader", true, 3)).toMatch(/hand leadership on/);
    expect(removalRefusal("leader", "leader", true, 1)).toBeNull();
    expect(removalRefusal("member", "member", true, 3)).toBeNull();
    expect(removalRefusal("officer", "member", false, 3)).toMatch(/only the leader/);
    expect(removalRefusal("leader", "officer", false, 3)).toBeNull();
  });
});
