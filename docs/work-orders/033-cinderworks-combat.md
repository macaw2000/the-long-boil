# Work order 033: The Cinderworks' combat

**Agents:** the orchestrator for the Foundry Pass gate; `draftsman` for the monsters, drops, boss and weapons; `assayer` for the measurements; `registrar` for the rows
**Status:** drafted and measured (2 November 2026). Parts 1 to 3 are done; the zone's Ledger Pages are listed as pending in `content/tuning/economy-global.json` (`ledger_pages_pending`) until the scrivener's work order. Open for Jeremy: Old Bellows solved against empty slots until 034 (real Tinkers win 0.80 to 0.95), the Bronze Fire Rake as its reference weapon, its melee weakness, the Cinderworks' Crown faucet (2.7x Rustmoor, sinks 0.8%), how `lore.whistle_notations` +1 is granted on the first kill, and whether the Bellows Plate trades.
**Blocks:** work order 034 (the Cinderworks' armour and tool ladder), Act II's storylets, and the art for every new monster and weapon.

## Why this one

Jeremy, 2 November 2026: combat first, then the Cinderworks' gear ladder. Testers reach the Foundry Pass around day 16 (work order 032), and the Cinderworks today has 29 gathering and crafting actions and five Tailoring pieces, but no monsters, no weapons and no boss. A gear ladder (work order 034) needs something to fight, so the zone's combat comes first, as Rustmoor's did (work orders 011 and 025 before 030).

Nothing in the engine stops a Tinker entering the Cinderworks without the Foundry Pass either: its actions open by skill level alone. GDD section 6: "Entering a new zone needs the level and a pass from the previous act, and every road through the act provides one."

## Inputs

Attach only these:

- `docs/gdd.md`: section 6 (Skills, Combat, Gear and tools, the zone table), section 7 (the first month), and from section 4 only Act II's heading and beat 1 ("Shift work").
- `content/tuning/combat.json` (`gear`, `kill_time`, `reference_player`, `boss`, `reference_gear`), `content/tuning/xp-curve.json`, `content/tuning/tools.json` (`pacing`).
- `content/monsters/rustmoor.json`, `content/drops/rustmoor.json`, `content/gear/rustmoor.json`, `content/actions/cinderworks.json`, `content/items/cinderworks.json`, `content/gear/cinderworks.json`.
- `docs/work-orders/008`, `009`, `011`, `012`, `025`, `029` and `031`, each with its settled sections: how Rustmoor's rats, drops, weapons and Scrapjaw were solved.
- `docs/canon/world.md`, `docs/canon/style.md`, `docs/canon/slices/act1.md`, for names and flavour.
- The schemas `monster/2`, `drops/1`, `gear/2`, `item/1` and `action/1` under `scripts/validate/schemas/content/`.

## Part 1: the Foundry Pass gate (orchestrator)

1. Gate the Cinderworks on the Foundry Pass: no Cinderworks action or fight can be queued until `act1.progress` is at least 80, the value every road's `act1.brass_exchange.foundry_pass` sets. Put the gate beside `SKILL_GATES` in `engine/packages/rules/src/story.ts`, enforce it wherever the queue is checked, and show the client a locked zone with what opens it, not a hidden one.
2. Tests: a Tinker below 80 cannot queue a Cinderworks action or monster, one at 80 can, and work already queued is left alone.

## Part 2: the monsters, drops, boss and weapons (`draftsman`)

1. **Four Soot Wraiths,** ordinary monsters across combat levels 20 to 45, in a new `content/monsters/cinderworks.json` (`monster/2`). Place them in the band as work order 011 placed the rats in theirs, and give their weaknesses the same spread (each style at least once). Solve each to `kill_time` and the 0.25 damage share against the reference player and `reference_gear` at its level, as work order 031 did.
2. **Old Bellows,** the zone's boss, at the top of the band (45). Solve it to `boss.target` (0.5 at its level with 3 Rations and the right style) against a reference weapon and set chosen as work order 025 chose the Riveting Hammer: the best weapon of its weakness style a player actually holds at that level from the drafted ladder. Its first kill gives the Bellows Plate (GDD zone table) and `lore.whistle_notations` +1 (the quality exists in `docs/canon/qualities.json`). Its ordinary drop follows Scrapjaw's pattern. The Bellows Plate's stats belong to work order 034's ladder; draft it here as an item with a placeholder piece row only if the schema needs one, and say so.
3. **Drops** (`content/drops/cinderworks.json`, `drops/1`): Crowns on the curve work order 008 set for Rustmoor, carried to these levels, and materials that feed the existing Cinderworks actions. At least one Cinderworks crafting input must come from the Wraiths, as Umbrella Silk does from the rats. No Ledger Page drops (the GDD's "4 drops" for the zone are the scrivener's, later).
4. **Weapons** for the three styles across the band, in a new section of `content/gear/cinderworks.json`, spaced as Rustmoor's are (one per style at four levels), each made by Smithing or Tinkering, as Rustmoor's are, at the matching Cinderworks tier from Cinderworks materials. Follow `gear.slot_rules` for weapons; rows +1 to +20 stay null.
5. **Rations:** if the Rustmoor Ration (600 HP) cannot carry Old Bellows' solve at level 45 within 3 Rations, propose a Cinderworks Cooking action and ration with its derivation, and do not apply it; Jeremy decides.
6. **Report** the combat pacing: hours of fighting for the reference player from combat level 20 to 45 against the GDD's two weeks a zone, with and without the drafted weapons.

## Part 3: measure (`assayer`)

1. The combat check's figures for every Wraith and Old Bellows against target, verbatim.
2. Old Bellows' win chance at levels 44, 45 and 46, with the wrong style, and without Rations.
3. Whether the gold balance moves: the Wraiths' Crowns a week against the assayer's 2 November figures (sinks remove 2 to 5% of income; Calibrating, the main sink, is not built).

## Settled before you start

- Everything settled in work orders 029, 031 and 032. Combat first, then gear (Jeremy, 2 November 2026).
- No change to the XP curve, to Rustmoor, or to any existing Cinderworks action's time or XP.
- Names and flavour are cleared to Layer 1 only, though the zone belongs to Act II: a monster's flavour is read before any Act II beat is played. The Soot Wraiths may be "shapes in the smoke" (GDD, Act II beat 1); nothing may hint at what Old Bellows' last breath reveals.

## Not in this work order

The Cinderworks' armour and tool ladder (work order 034); Act II's storylets, letters and Ledger Pages; Calibrating; collector prices beyond a capped buyer for any new material; art; the guide.

## Constraints

- Every number is derived or raised as a question.
- Every new material needs a use or a capped buyer.
- Names and descriptions follow `docs/canon/style.md`.
- Run the validators, and hand back only when they pass apart from provenance rows for new ids, which the registrar adds. The engine tests must pass.

## Hand back

Each part's changed files; every new or changed id, grouped by type, for the registrar; the monsters as a table (name, level, weakness, hp, max hit, evasion, seconds per kill, XP) and the weapons as a table beside Rustmoor's; Old Bellows' solve with its reference weapon and set; the drop tables; the combat pacing 20 to 45; derivations; the Rations proposal if one is needed; open questions; and the validator output verbatim.
