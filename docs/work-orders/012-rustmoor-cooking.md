# Work order 012: Rustmoor Cooking and the Ration

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** a winnable Scrapjaw, and so the end of Act I.

## Why this one now

Scrapjaw is won 0.1% of the time without Rations, and no Ration exists. The combat model holds a provisional heal of 600 (`RATION_HEAL_HP`, marked a proposal for this work order to replace). Section 7 has Brassbuckle leave Ada a crate of Rations, and section 6 says Cooking makes "healing rations".

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat, The Crown budget) and section 7 (the first session).
- `content/tuning/combat.json` (its Ration rules: heal above monster DPS × 3 s, at most 60% of max HP, consumption per kill, the boss cap of 3).
- `content/items/rustmoor.json`, `content/actions/rustmoor.json`, `content/tuning/economy-rustmoor.json`, `content/tuning/xp-curve.json`.
- `docs/work-orders/011-rustmoor-combat-stats.md`, both "Settled" sections.
- `docs/canon/slices/act1.md` and `docs/canon/style.md`.

## Scope

1. **One Ration item,** the Rustmoor Ration. Its heal settles `RATION_HEAL_HP` in `combat.json` (revision 5). Keep 600 unless you find a reason not to; if you change it, the five monsters must be re-solved and you must say so before doing it.
2. **Exactly 4 Cooking actions** at levels 1, 5, 10 and 15, at the tier times and XP the other skills use (54/108/162/216 s; 9/19/30/42 XP), so the pacing check holds Cooking at about 14 days. Every one of them makes Rations, since players eat them in bulk (about 10 to 30 an hour at the reference). Say how the higher tiers stay worth doing: more Rations per action, cheaper inputs, or something else.
3. **Ingredients.** The GDD names no food source, and no Rustmoor gathering skill makes food. Propose one, at most 3 new ingredient items, and mark it a proposal. One option to weigh: ingredients bought from an NPC at the Counting-House for Crowns, which would be Rustmoor's first Crown sink. Say what that sink would remove per week at the reference Ration use.
4. **The starter crate.** Propose how many Rations Brassbuckle leaves, so the first session's trigger works and a new player is not stuck before Cooking 1 pays off.
5. **Economy entries** for every new item.
6. **Three text fixes carried from work order 011:**
   - Riveting Hammer: "boilermaker's", not "shipwright's", and drop the skull joke that repeats the Brass Spanner's.
   - "Throws" appears in three weapon lines (Iron Rifle, Brass Sparker, Steel Carbine). Change two.
   - `combat.json`: say whether the 14.68 / 14.83 / 15.19-day band figures ever counted Scrapjaw.

No armour, no Tea Blending, no other zones.

## Settled after review

Jeremy set these on 22 October 2026. The grocer's counter is recorded in GDD section 6.

- **The Ration heal is settled at 600.**
- **Ingredients cost about a quarter of the derived price:** Barley Meal 2 Crowns, Salt Pork 4. Levelling Cooking through Rustmoor then removes about 15,000 Crowns, and eating about 4,000, so Calibrating can stay the main sink.
- **Ingredients come from a grocer's counter at the Counting-House window,** never locked.
- **The starter crate holds 342 Rations, bound to the player,** enough for the first 12-hour queue.
- **Surplus Rations go to the Exchange,** and higher Cooking tiers pay only in XP per hour. Both accepted.
- **Flavour:** the Ration line drops "barley" and the explaining clause; Barley Meal gets a new line that does not repeat Coal's weighing joke; Salt Pork's line stays.
- **Work order 013** gives NPC prices and starting inventory a home in the data, and counts the grocer in the Crown report.

## Constraints

- Every number is derived or raised as a question. Mark every proposal.
- Clearance: Act I only for every name and flavour line.
- Report the combat check's NOTE lines for every monster and Scrapjaw after your changes.
- Hand new ids to the registrar through your report. The provenance check fails until it adds the rows; every other check must pass.

## Hand back

- The files, every new id, the Cooking pacing line, the Ration heal and its derivation, the ingredient source, the sink figure if any, the starter crate, the text fixes, open questions, and the validator output verbatim.
