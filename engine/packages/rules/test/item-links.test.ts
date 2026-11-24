// The client has no tests of its own; its item links are pure text, so they are checked here.
import { describe, expect, it } from "vitest";
import { finishLink, openLink, pieces, suggest } from "../../client/src/itemLinks.js";

const items = [
  { id: "a", name: "Brass Ingot" },
  { id: "b", name: "Brass Key" },
  { id: "c", name: "Odd Brass" },
];

describe("item links", () => {
  it("link a whole name in brackets, whatever its case, and leave the rest as typed", () => {
    expect(pieces("sell [brass ingot] x5 [nope] [Brass Key]", items)).toEqual([
      { text: "sell " },
      { item: "a", name: "Brass Ingot" },
      { text: " x5 [nope] " },
      { item: "b", name: "Brass Key" },
    ]);
    expect(pieces("[[Brass Key]]", items)).toEqual([{ text: "[" }, { item: "b", name: "Brass Key" }, { text: "]" }]);
    expect(pieces("plain", items)).toEqual([{ text: "plain" }]);
  });

  it("offer names for an open bracket and finish it", () => {
    expect(openLink("hi")).toBeNull();
    expect(openLink("hi [")).toBe("");
    expect(openLink("[Brass Key] and [br")).toBe("br");
    expect(openLink("[Brass Key]")).toBeNull();
    expect(suggest("br", items, 6).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(finishLink("[Brass Key] and [br", "Brass Ingot")).toBe("[Brass Key] and [Brass Ingot] ");
    expect(finishLink("x [", "$& Co")).toBe("x [$& Co] ");
  });
});
