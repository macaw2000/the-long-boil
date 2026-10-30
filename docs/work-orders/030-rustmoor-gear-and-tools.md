# Work order 030: Rustmoor's gear and tool ladder

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** work order 031 (retuning the rats and Scrapjaw for the floors, and re-solving the band rates for tools), the Loadout's new slots in the client, and the art for every new piece (art request 14).

## Why this one

Jeremy, 30 October 2026, after playtests: "people should feel more progress and more attachment to their character as they gear it out." Work order 029 settled the model (`content/tuning/combat.json` revision 10, `content/tuning/tools.json`); the engine and validators now carry it. Rustmoor has weapons only. This work order drafts the pieces and tools a Tinker makes and puts on from the first session to Scrapjaw.

## Inputs

Attach only these:

- `docs/gdd.md`, sections 6 (Skills, Combat, Gear and tools) and 7 (the first session), and `docs/build-plan.md` milestone 13.
- `content/tuning/combat.json` (`gear`, `kill_time.floor`, `reference_player`), `content/tuning/tools.json`, `content/tuning/xp-curve.json`.
- `content/actions/rustmoor.json`, `content/items/rustmoor.json`, `content/gear/rustmoor.json`, `content/tuning/economy-rustmoor.json`, `content/start.json`.
- `docs/work-orders/004`, `011`, `012`, `017`, `025` and `029`, each with its settled sections.
- `docs/canon/world.md`, `docs/canon/style.md`, `docs/canon/slices/act1.md`, for names and flavour.
- The schemas `action/1`, `item/1` and `gear/2` under `scripts/validate/schemas/content/`.

## Scope

1. **Pieces for the six combat-level slots** (Off-hand, Head, Body, Hands, Feet, Charm) across combat levels 1 to 20, in a new `content/gear/rustmoor-pieces.json` (`gear/2`), each made by a Rustmoor action. Every +0 row follows its slot's rule in `gear.slot_rules`; rows +1 to +20 stay null.
2. **A tool for each Rustmoor skill:** Prospecting (pick), Scavenging (apron), Smithing (tongs), Tinkering (fine instruments) and Cooking (ladle), across levels 1 to 20, in the same gear file, each made by its maker skill in `tools.json` `makers`.
3. **The actions and items** that make them, appended to `content/actions/rustmoor.json` and `content/items/rustmoor.json`, from Rustmoor materials only, at times and XP that follow each skill's existing tier rule.
4. **Density** (GDD section 6, Gear and tools): across all slots and tools together, a new piece or tool every two or three levels, so the first session (the first 20 minutes, about level 3) lands at least two upgrades, and the first week has something new to make every few hours. Report the cadence: for a balanced player on the reference pace, the hour each upgrade becomes makeable and wearable, from hour 0 to Scrapjaw.
5. **The first session:** at least one piece or tool must be makeable from `content/start.json`'s stock or the first session's first actions, so Brassbuckle's guide can hand the player a first upgrade later (a guide change is not in this work order).

## Settled before you start

- Everything settled in work order 029: slots, wear rules, floors, the cap, tool speed, the makers.
- Gear first, then measure: no change here to the XP curve, to any existing action's time or XP, or to any monster.
- Recipe quantities may now exceed 1 where a piece should cost more than an action's output (work order 004's "quantities stay at 1" was a placeholder for the economy work order); show each quantity's derivation.

## Not in this work order

Retuning the rats and Scrapjaw, and re-solving the band rates for tools (work order 031); the Cinderworks; weapons between today's tiers; collector prices; art; the guide.

## Constraints

- Every number is derived or raised as a question.
- Every end product needs a use or a capped buyer; gear and tools are worn, so their use is wearing, but list any intermediate with no other use.
- Measure and report, for work order 031: what work order 025's Act I walk (`scripts/sim/walk-act1.mjs`) would hold in each of the six slots before Scrapjaw, and each rat's and Scrapjaw's distance from target with the drafted reference gear.
- Run the validators, and hand back only when they pass apart from provenance rows for new ids, which the registrar adds. Pacing will show the tool factor's faster bands; that is expected until work order 031 re-solves them.

## Hand back

The new and changed files; every new id grouped by type for the registrar; the ladder as a table (slot or tool, item, level, maker action, inputs, +0 stats); the upgrade cadence by hour; the walk's six slots before Scrapjaw; each monster's distance from target; pacing's with-tool and without-tool days verbatim; derivations; open questions; and the validator output verbatim.
