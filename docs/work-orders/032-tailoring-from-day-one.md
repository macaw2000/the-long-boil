# Work order 032: Tailoring from day one

**Agents:** `draftsman` for the ladder and the numbers, then `assayer` for the walk and the upgrade cadence; the orchestrator lifts the gate in the engine and amends the GDD
**Status:** ready to run
**Blocks:** art request 15 (icons for the new pieces) and the guide's first-upgrade hint.

## Why this one

Jeremy, 30 October 2026, after playing the build with work order 030's gear: "I still don't see tailoring available early enough. I want the player to feel progress and they right now can only equip a weapon but no gear. They need to feel progress earlier."

Tailoring opens only with the Foundry Pass (`SKILL_GATES` in `engine/packages/rules/src/story.ts`, act1.progress 80, about day 7.5), and every Tailoring action above level 1 eats Cinderworks materials. Rustmoor's armour comes only from Smithing, in four metal tiers spaced five levels apart per slot, so a new player's armour upgrades arrive slowly after the first brass pieces. This work order opens Tailoring on day one with its own Rustmoor ladder: cloth and leather pieces that land between Smithing's metal tiers, so an upgrade arrives every level or two in the first session and every few hours in the first week.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat, Gear and tools) and section 7 (the first session), and `docs/build-plan.md` milestone 13.
- `content/tuning/combat.json` (`gear`, `kill_time.floor`, `reference_player`, `boss`), `content/tuning/tools.json` (`makers`, `pacing`), `content/tuning/xp-curve.json`.
- `content/actions/rustmoor.json`, `content/actions/cinderworks.json` (the Tailoring actions), `content/items/rustmoor.json`, `content/gear/rustmoor-pieces.json`, `content/drops/rustmoor.json`, `content/tuning/economy-rustmoor.json`, `content/start.json`.
- `docs/work-orders/028`, `029`, `030` and `031`, each with its settled sections.
- `docs/canon/world.md`, `docs/canon/style.md`, `docs/canon/slices/act1.md`, for names and flavour.
- The schemas `action/1`, `item/1`, `gear/2` and `drops/1` under `scripts/validate/schemas/content/`.

## Part 1: the gate and the GDD (orchestrator)

1. Remove Tailoring from `SKILL_GATES`, so it is open from the first session; keep `skillOpen` for future gates. Update the tests that assert the gate.
2. Amend `docs/gdd.md` section 6: Tailoring opens on day one in Rustmoor; Rustmoor's cloth and leather pieces join Smithing's metal ones; the Cinderworks adds coats and goggles on top. Mark it "amended 30 October 2026".
3. Check the client shows Tailoring on the skills list for a new Tinker, with its Rustmoor actions.

## Part 2: the ladder (`draftsman`)

1. **Tailoring pieces for the six combat-level slots**, combat levels 1 to 20, in `content/gear/rustmoor-pieces.json`, each made by a new Rustmoor Tailoring action. Place them between Smithing's tiers (Smithing's brass pieces sit at 1 to 4, iron at 5 to 9, steel at 10 to 14, the fourth tier at 15 to 19), so the six slots together offer a new wearable upgrade every level or two up to level 10, and every two or three levels after. A Tailoring piece at a level must beat the metal piece below it and fall short of the one above, under its slot's rule in `gear.slot_rules`. Rows +1 to +20 stay null.
2. **Tailoring's own tool** (the needle case in `tools.json` `makers`), levels 1 to 20, made by Tailoring at level 1, the same four-tier shape as the other tools.
3. **Materials from Rustmoor only.** Use what Rustmoor already has where it fits: the Rust Rats' `rat_scrap` (today it only has a capped collector), and the tip's scavenged goods. If cloth or leather needs a new material, add at most two, each from an existing Scavenging action's output or a Rust Rat drop, and say why. Fighting should feed Tailoring, so at least one Tailoring input comes from the rats.
4. **Tailoring 1 to 20 is now Rustmoor's band.** Give Tailoring Rustmoor actions at levels 1, 5, 10 and 15, following the existing tier rule for seconds and XP (re-solved for tools as in work order 031), and solve the band to 14 days within 2 for the reference player with tools. The Cinderworks Tailoring actions below level 20 need inputs a player cannot reach before the Foundry Pass. Propose what happens to them (keep them as alternatives, move them to 20 and above, or retire them) and do not apply the change; Jeremy decides.
5. **The first session:** a new Tinker must be able to make and wear a Tailoring piece within the first 20 minutes, from `content/start.json`'s stock or the first actions. Propose a change to `start.json` only if no recipe can do it.
6. **Report the upgrade cadence:** for a balanced player on the reference pace, the hour each piece or tool, Smithing's and Tailoring's together, becomes makeable and wearable, from hour 0 to Scrapjaw. Compare it with work order 030's cadence without Tailoring.

## Part 3: the retune (`assayer`, then `draftsman`)

1. Give the walk (`scripts/sim/walk-act1.mjs`) Tailoring as a skill it trains and makes gear with, under the same gear share and best-piece-per-slot rule.
2. Report, at 2, 3 and 4 check-ins a day: the gear held at the first Scrapjaw attempt, the first-win day and the win chance per attempt, and the story pace to the Foundry Pass.
3. If the reference pieces or the walk's Scrapjaw set change, retune the four rats and re-solve Scrapjaw as work order 031 did: the rats to their `seconds_per_kill` and the 0.25 damage share, and Scrapjaw to 0.5 at melee 20 against the 3-a-day set. Keep the walk's 40% attack threshold (Jeremy accepted its effect on 30 October 2026).

## Settled before you start

- Everything settled in work orders 029, 030 and 031.
- Tailoring opens on day one (Jeremy, 30 October 2026).
- Gear first, then measure: no change to the XP curve, to any existing Rustmoor action's time or XP, or to the metal pieces' stats.

## Not in this work order

The Cinderworks' own gear and tool ladder; Calibrating; collector prices beyond a capped buyer for any new material; the art (art request 15 follows from this work order's item list); the guide's hint.

## Constraints

- Every number is derived or raised as a question.
- Every new material needs a use or a capped buyer.
- Names and descriptions follow `docs/canon/style.md`: plain, wry, of the tip and the workshop.
- Run the validators, and hand back only when they pass apart from provenance rows for new ids, which the registrar adds. The engine tests must pass.

## Hand back

Each part's changed files; every new or changed id, grouped by type, for the registrar; the Tailoring ladder as a table (slot or tool, item, level, action, inputs, +0 stats) beside Smithing's; the upgrade cadence by hour, with and without Tailoring; the walk's report verbatim; pacing's band lines verbatim; each rat's and Scrapjaw's figures against target; derivations; the proposal for the Cinderworks Tailoring actions below 20; open questions; and the validator output verbatim.
