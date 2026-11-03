# Work order 034: The Cinderworks' gear and tool ladder

**Agents:** `draftsman` for the ladder and the re-solve; `assayer` for the measurements; `registrar` for the rows
**Status:** ready to run
**Blocks:** Calibrating (Jeremy, 2 November 2026: straight after this one), the art for every new piece and tool, and Act II's storylets.

## Why this one

Jeremy, 3 November 2026: go ahead with 034. Work order 033 gave the Cinderworks its Soot Wraiths, Old Bellows and twelve weapons, but the zone has no pieces in the six combat slots (Off-hand, Head, Body, Hands, Feet, Charm) and no tools above Rustmoor's level 15. Its five Tailoring pieces (Gauze Goggles, Slag Wool Coat, Studded Felt Coat, Furnace Goggles, Founder's Goggles) still sit in the old single `armour` slot of `gear/1`. Until this ladder exists:
- Old Bellows is solved against empty slots, so a real Tinker in Rustmoor's pieces wins 0.80 to 0.88 instead of 0.5 (work order 033, settled).
- From combat level 20 to 45 a Tinker has nothing new to put on but a weapon every five levels, against GDD section 6's "something new to make every few hours".

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat, Gear and tools, the zone table) and section 7; from section 4 only Act II's heading and beat 1.
- `content/tuning/combat.json` (`gear`, `kill_time`, `reference_player`, `reference_gear`, `boss`), `content/tuning/tools.json`, `content/tuning/xp-curve.json`.
- `content/actions/cinderworks.json`, `content/items/cinderworks.json`, `content/gear/cinderworks.json`, `content/monsters/cinderworks.json`, `content/drops/cinderworks.json`, and Rustmoor's ladder as the pattern: `content/gear/rustmoor-pieces.json`.
- `docs/work-orders/029` to `033`, each with its settled sections.
- `docs/canon/world.md`, `docs/canon/style.md`, `docs/canon/slices/act1.md`, for names and flavour.
- The schemas `action/1`, `item/1`, `gear/1`, `gear/2` and `drops/1` under `scripts/validate/schemas/content/`.

## Part 1: the ladder (`draftsman`)

1. **Pieces for the six combat-level slots,** combat levels 20 to 45, in a new `content/gear/cinderworks-pieces.json` (`gear/2`). Follow Rustmoor's shape: Smithing's metal tiers in every slot and Tailoring's cloth and leather between them, so the six slots together give a new wearable upgrade every two or three levels. Every +0 row follows its slot's rule in `gear.slot_rules`, and rows +1 to +20 stay null.
2. **The five legacy Tailoring pieces.** GDD section 6 says the Cinderworks adds Tailoring's coats and goggles. Fold them into the new ladder (goggles to Head, coats to Body, or wherever the slot rules place them) under their existing ids and actions, and retire the `armour` entries in `content/gear/cinderworks.json`. If keeping an id breaks a slot rule, propose what to do instead, and do not apply it.
3. **The Bellows Plate** (Old Bellows' first kill, already an item) gets its piece row: the best piece in its slot at level 45, as Scrapjaw's drop is for Rustmoor. It is tradable (Jeremy, 2 November 2026).
4. **A tool for each skill with Cinderworks actions** (Prospecting, Scavenging, Smithing, Tinkering, Tailoring) across levels 20 to 45, each made by its maker skill in `tools.json` `makers`, in the same four-tier shape as Rustmoor's. Cooking has no Cinderworks actions; say whether its ladle needs a tier here, and do not add one.
5. **The actions and items** that make them, appended to `content/actions/cinderworks.json` and `content/items/cinderworks.json`. Use Cinderworks materials only, including the Soot Wraiths' Cinders, at times and XP that follow each skill's existing tier rule. Show each recipe quantity's derivation.
6. **Report the upgrade cadence:** for a balanced player on the reference pace, the hour each piece or tool becomes makeable and wearable, from the Foundry Pass to Old Bellows.

## Part 2: the re-solve (`draftsman`)

As work order 031 did for Rustmoor:
1. Re-solve the band rates for the new tools, so every crafting and gathering band 20 to 45 reads 14 ± 2 days with tools.
2. Retune the four Soot Wraiths to their `seconds_per_kill` and the 0.25 damage share against the drafted reference pieces.
3. Re-solve Old Bellows to 0.5 at melee 45 with 3 Rations, against the best ladder a player holds at 45. No Act II walk exists yet, so derive the set as work order 033 derived the Bronze Fire Rake, and mark it a proposal. Report the win chance at 44, 45 and 46, with the wrong style, and without Rations.

## Part 3: measure (`assayer`)

1. The combat check's figures for every Wraith and Old Bellows, verbatim.
2. Old Bellows' win chance for a Tinker still wearing Rustmoor's best set, beside the drafted reference set, so we can see how much the new ladder matters.
3. Whether the Crown balance moves: any new collector price, and whether the new recipes sink Crowns (they should not mint any).
4. Whether the engine tests pass and the client's Loadout shows the new pieces in their slots.

## Settled before you start

- Everything settled in work orders 029 to 033.
- No change to the XP curve, to Rustmoor, or to any weapon's stats.
- Names and flavour are cleared to Layer 1 only. Nothing may hint at what Old Bellows' last breath reveals.

## Not in this work order

Calibrating; Act II's storylets, letters and Ledger Pages; a Cinderworks Cooking ladder; collector prices beyond a capped buyer for any new material; art; the guide.

## Constraints

- Every number is derived or raised as a question.
- Every new material needs a use or a capped buyer.
- Names and descriptions follow `docs/canon/style.md`.
- Run the validators, and hand back only when they pass apart from provenance rows for new ids, which the registrar adds. The engine tests must pass.

## Hand back

The new and changed files; every new, changed or retired id grouped by type, for the registrar; the ladder as a table (slot or tool, item, level, maker action, inputs, +0 stats) beside Rustmoor's top tier; the upgrade cadence by hour; the re-solved Wraiths and Old Bellows with its reference set; pacing's with-tool and without-tool days verbatim; derivations; open questions; and the validator output verbatim.
