# Work order 009: propose the combat model

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** every hit point, damage and gear stat. Work order 010 (the toolwright encodes this model as a check) and work order 011 (Rustmoor's monster and gear stats) wait on it.

## Why this one first

Work order 006 gave every monster a target `seconds_per_kill` and said the combat-stats work order would set hit points and damage to hit it. That needs a model first: which of the seven combat skills does what, how gear and weakness enter, and how a kill time comes out. This is the same order as the XP curve: the shape and its constants first, then the checks, then the content.

## Inputs

Attach only these:

- `docs/gdd.md`, section 1 (At a glance, loss states), section 6 (Skills, Combat, Treasure and Calibrating) and section 7 (the first session, the first month).
- `content/monsters/rustmoor.json` and `content/tuning/xp-curve.json`.
- `docs/work-orders/001-xp-curve.md` and `docs/work-orders/008-rustmoor-drops.md`, their "Carried forward" sections.

## Scope

Produce one file, `content/tuning/combat.json`, holding the model as named constants and formulas, the way `xp-curve.json` holds the curve:

1. **What each combat skill does.** Section 6 names seven: Vitality (hit points), Pressure (steam-driven force), Precision (accuracy and crits), Melee, Marksmanship and Aetherics (the three attack styles), Fortitude (defence). Give each a formula in terms of its level.
2. **How gear enters.** A weapon's stats, by style, at a given calibration level. Section 6 says gear has fixed stats per calibration level. Give the shape only; actual gear values come in work order 011.
3. **Weakness.** How much faster a matched style kills than an unmatched one. Section 6: "Monsters are weak to Melee, Marksmanship, or Aetherics, so loadouts matter."
4. **Kill time.** A closed-form expected time per kill, including the time between kills, for a player of a given level and gear against a monster of given stats. It must be something a validator can compute without simulation.
5. **Knockouts and Rations.** How often a player at a monster's level is knocked out, and how the 60-second respawn and Ration triggers enter the expected kill time. Section 6 and section 7 name Rations, but no Ration item exists yet; say what the model needs from one.
6. **The combat XP split.** The curve assumes 70% of combat XP goes to the main skill and 5% to each of the other six, and work order 006 called that provisional until combat stats exist. Propose how the split works in this model, or confirm 70/30, and say what it does to Vitality and Fortitude, which sit near level 18 when the main skill reaches 70.

## Constraints

- **A player at a monster's level, with the gear the zone offers and a matched loadout, kills it in that monster's `seconds_per_kill`.** That is the target the model must make reachable; the stats in work order 011 will hit it.
- **Scrapjaw is beaten on the second attempt** (section 7: "she beats Scrapjaw on her second attempt"), so a player at level 20 with Rustmoor gear wins about half the time. Propose how a boss's win chance comes out of the model.
- **Combat is automatic and idle** (section 6). The model must not need a player's attention during a fight.
- Every number is derived or raised as a question, as always. Mark every proposal.
- No content beyond `combat.json`: no monster stats, no gear stats, no new items.
- There is no validator for this file yet. Work order 010 builds one. Hand back with `validators: none for combat.json; other checks` and the output of `python3 scripts/validate/run.py`, which must still pass for everything else. The new file will need a register row like the curve's.

## Hand back

- The file, with the formulas and constants.
- A derivation per constant, citing its GDD line, and each proposal marked.
- A worked example: a level-10 player against the Rust Rat Tinplate, with matched and unmatched loadouts, showing the kill time.
- Open questions.
- The new id for the registrar.

## Settled after the first draft

Jeremy set these on 22 October 2026. The first, fourth, fifth and sixth are recorded in GDD section 6.

- **Kill time has a floor at the monster's `seconds_per_kill`.** A player who outlevels a monster kills it no faster than its target time, so XP, Crowns, drops and the Ledger Page counter all stay on pace, and every existing check stays valid. Outlevelling pays through safety and fewer Rations.
- **The band assumes a one-style player,** who fights some Rustmoor rats unmatched. Rustmoor's 14.7 to 15.2 days are accepted.
- **Boss fights are steep, and that is accepted:** about 15 points of win chance per level, and about 4% for a boss fought with the wrong style.
- **Rations in a boss fight are capped at 3.** How much a Ration heals is for the Cooking work order, within the model's rules.
- **Only the three attack styles can be a loadout's focus.** Vitality, Fortitude, Pressure and Precision always take the 5% share.
- **Gear slots for the capstone:** one weapon and one armour piece.
- **Hit points and damage are scaled ×10,** so the engine rolls whole numbers.
- **The calibration step** is left to the calibration work order.

Settled with revision 2, following the settled points above:

- **The kill-time floor applies at every level,** not only at or above the monster's level. Nothing kills faster than its target time.
- **Damage taken and Rations eaten come from the unfloored fight;** the extra floored seconds are idle.
- **Consumables are set by triggers, not loadout slots.** GDD section 7's calming tea is a trigger.
- **Checks use the closed forms as written** (continuous moments); the engine's whole-number rolls are its own concern.

## Then

Jeremy reads the model and settles its open questions. Work order 010 encodes it as a check. Work order 011 sets Rustmoor's monster and gear stats against it.
