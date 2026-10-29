# Work order 028: Tailoring and the first armour

**Agent:** `draftsman` for the content; the orchestrator for the engine change in part 3
**Status:** done (29 October 2026). Nine Tailoring actions (1 to 20 in 13.96 days at 1.00x, 20 to 45 in 13.80 days at 3.43x) and five armour pieces, worn at Fortitude 6 to 10 with 18 to 30 armour; the engine, server and Loadout now wear armour (part 3). The inspector passed all 20 ids, 12 with notes, and found no reveal risk. All rows reviewed; approval waits on Jeremy. Carried forward: for the economy work order, Tailoring 5 to 19 eats about 2,650 Cinders per Tailor (about 12 Scavengers' worth at Scavenging 20 to 24), and a levelling Tailor makes about 1,700 armour pieces against one slot per player, so armour needs a capped buyer or salvage; for the Soot Wraiths work order, a Tinker who starts Tailoring on arrival makes only the first two pieces inside the band, so tune against armour players can actually hold, and `ARMOUR_HALF_POINT` is still a proposal. Taste calls for Jeremy: Slag Wool's ash-pit undertone, worn against the skin; "Founder's Goggles" leaning toward the city's founding (the inspector suggests "Caster's Goggles"); goggles outranking coats at the top; and each step up the ladder being worth only about 2%.

## Settled after the first draft

Jeremy, 29 October 2026:

- **Armour points at +0 are 3 x the Fortitude level required to wear the piece** (`combat.json` revision 9, `gear.armour.armour_at_plus_0`). The draft's 1x cut damage only 5 to 8% beyond Fortitude alone; 3x cuts about 15% at Fortitude 6 and 21% at 10.
- **Tailoring 1 to 15 use only materials a Tinker has on arrival:** a Rustmoor Brass Ingot and Cinders (Scavenging 20). Slag Glass feeds only the later tiers.
- **Slag wool, blown from Cinders, is the cloth.** No new vendor, skill or drop.
**Blocks:** the Soot Wraiths work order, whose monsters are solved against a reference player who wears armour; and the Tailoring skill's band pacing, which today has no actions at all.

## Why this one

GDD section 6: "Rustmoor has no armour; armour arrives with Tailoring in the Cinderworks." The Skills table gives Tailoring "Coats and goggles". The combat model already has an armour slot (`combat.json` `gear.loadout`, settled) and armour fields (`gear.armour.fields`: Fortitude level to wear, armour points by calibration), and the client shows the slot from Act II. No armour exists yet, and Tailoring has no actions.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat, Treasure and Calibrating).
- `content/tuning/combat.json`, especially `gear`, `constants.ARMOUR_HALF_POINT`, `reference_player` and `settled_points`; and `docs/work-orders/009-combat-model.md` and `011-rustmoor-combat-stats.md`.
- `content/tuning/xp-curve.json`, and `docs/work-orders/001-xp-curve.md`'s "Carried forward" section.
- `content/actions/*.json`, `content/items/*.json` and `content/tuning/economy-rustmoor.json`, for inputs.
- `docs/work-orders/027-cinderworks-actions.md`, its table and status line.
- `docs/canon/world.md`, `docs/canon/style.md` and `docs/canon/slices/act2.md`, for names and flavour only.
- The schemas `action/1`, `item/1` and `gear/1` under `scripts/validate/schemas/content/`.

## Scope

1. **Tailoring's ladder: exactly 9 actions,** at levels 1, 5, 10, 15, 20, 25, 30, 35 and 40, in `content/actions/cinderworks.json` (appended; ids `action.cinderworks.tailor_*`). Times and XP follow each band's rule exactly as the other skills do: 54 s to 216 s at Rustmoor's rates for levels 1 to 15 (work order 004), and work order 027's 270 s to 486 s at 3.2x to 3.6x for levels 20 to 40. Tailoring must cross 1 to 20 and 20 to 45 within 2 days of 14 each, as the pacing check measures.
2. **Armour: at most 5 pieces,** each made by one of those actions, in `content/items/cinderworks.json` and a new `content/gear/cinderworks.json` (`gear.cinderworks.armour`, slot `armour`). Coats and goggles both fill the one armour slot.
   - **Settled by Jeremy (28 October 2026): the first armour needs only Tailoring 1 to make,** so a level-20 fighter can wear armour on arrival.
   - Each piece's `level_required` is the Fortitude level to wear it. Spread them so the reference player (`reference_player.table`: Fortitude about 6 at main level 20 and 10 at 45) can wear a new piece every tier or two across the band.
   - Armour points at +0: propose one rule, as work order 011 settled `power(0) = 10 x level_required` for weapons, and derive it from `ARMOUR_HALF_POINT` (armour 100 halves damage taken). State how much damage each piece takes off for the reference player, against Fortitude alone. Rows +1 to +20 stay null until the calibration work order.
3. **The engine counts the armour piece** (orchestrator, not the draftsman). `engine/packages/rules/src/combat.ts` reads armour as Fortitude alone ("Rustmoor has no armour"). `combat.json`'s `ARMOUR_HALF_POINT` note already says "Armour is Fortitude level plus the armour piece's armour points"; the engine and `scripts/validate/check_combat.py` must both do that, with a test that a worn piece cuts damage taken by the expected share, and that a Tinker below the Fortitude level cannot wear it.

## Settled before you start

- **The first armour piece needs Tailoring 1** (above).
- **Inputs:** no existing skill makes cloth, thread or leather. Use existing gathered or smelted items where they read naturally (slag glass and brass for goggles; Rustmoor's Scavenging salvage for a first coat is one candidate). If a coat cannot be made from anything that exists, propose the smallest source and list it as an open question for Jeremy; do not add a new vendor, skill or monster drop here.
- **The first piece must be makeable on arrival** in the Cinderworks without a Cinderworks monster drop, as work order 027 settled for its level-20 tier.
- **Recipe quantities stay at 1.**

## Not in this work order

Soot Wraiths and their stats, the band's weapons, Smithing's plate (GDD section 6 gives Smithing "Plate and blades", but plate armour waits for the weapons work order), drops, prices and collectors, Calibrating, and Tea Blending.

## Constraints

- Every number is derived or raised as a question.
- Every end product needs a use or a capped buyer (work order 004, carried forward). Armour has a use; list any Tailoring product that is neither armour nor an input as an open question for the economy work order.
- Run the validators, and hand back only when they pass apart from provenance's rows for the new ids, which the registrar adds.

## Hand back

The changed and new files; every new id grouped by type for the registrar; Tailoring's band days and effective rate from the pacing check, verbatim; the armour rule and each piece's damage reduction for the reference player; derivations; open questions; and the validator output verbatim.
