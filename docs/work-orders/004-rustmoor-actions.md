# Work order 004: the Rustmoor action table

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** the first playable skill chain, and the assayer's first pacing report from real actions.

## Why this one

GDD section 10's 48-hour test asks for "one skill chain". Section 7's first session names it: Prospecting copper, smelting brass, tinkering a Brass Spanner. This work order drafts that chain for Rustmoor's band, levels 1 to 20.

## Inputs

Attach only these:

- `docs/gdd.md`, sections 6 and 7.
- `content/tuning/xp-curve.json`.
- `docs/work-orders/001-xp-curve.md`, the "Carried forward" section.
- The schemas `item/1` and `action/1` under `scripts/validate/schemas/content/`.

## Scope

- **Exactly 12 actions** in `content/actions/rustmoor.json`: 4 Prospecting, 4 Smithing and 4 Tinkering, with level requirements spread across 1 to 20.
- **The items those actions consume or produce,** at most 16, in `content/items/rustmoor.json`. Names the GDD gives (copper, brass, Brass Ingot, Brass Spanner) are used as given. Any other name is yours to propose, and you list it in your report.
- `content/actions/` and `content/items/` are yours for this work order. `content/actions/` is new.

Nothing else. No monsters, no combat actions, no prices, no gear stats, no calibration.

## Settled before you start

- **Each skill must cross levels 1 to 20 within 2 days of 14,** as the band pacing check measures it. That puts the band's average at about 1x the reference rate.
- **The rate climbs within the band.** The first actions pay slightly under the reference XP per hour, and later ones slightly over. The band average holds.
- **The reference is a unit, not a fixed action.** The curve file's Brass Ingot reference (10 XP, 54 s) sets the meaning of 1x. Your real Brass Ingot smelt may pay a little under that, because it is one of the first actions.
- **Section 7's ledger** shows 400 Brass Ingots smelted in one gap of at most 12 hours, alongside Rust Rat kills. Your smelt time must let that happen.

## Settled after the first draft

Jeremy set these on 21 October 2026:

- **Recipe quantities stay at 1 for now.** Real counts come with the economy work order, once prices exist.
- **The 0.05 step between tiers is accepted** (0.90, 0.95, 1.00 and 1.05 times the reference).
- **Later tiers take longer and pay whole-number XP.** Keep each tier's rate multiple exactly as drafted. The Brass Ingot smelt stays at 54 s.
- **Brass from copper alone is accepted** as a simplification.
- **Cross-skill inputs are accepted.** They reward balanced play, and the Exchange opens on day 2.

## Carried forward to the economy work order

Set by Jeremy on 21 October 2026, after the inspector's review:

- **Every end product needs a use or a capped buyer.** Steel Blade, Brass Key, Iron Lock and Garnet Sight have neither, yet each is its tier's best XP action, so players will make them in bulk. An uncapped NPC buyer would be a Crown faucet the section 6 budget does not list.
- **Recipe quantities** are still placeholders at 1.
- **The first session seeds 50 Brass Ingots** (GDD section 7, step 3), because a three-step chain cannot fit a two-action queue from an empty workshop.

## Constraints

- Every number is derived or raised as a question, as always. Show each action's XP per hour as a multiple of the reference.
- Run the validators, and hand back only when they pass.

## Hand back

- The two files, every new id grouped by type for the registrar, each band's days and effective rate per skill, derivations, open questions, and the validator output verbatim.
