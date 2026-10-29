# Work order 027: the Cinderworks action table

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** every later Cinderworks work order (Tailoring and armour, Soot Wraiths, drops, gear, Cooking, economy), and the pacing check for band 20 to 45, which today reports "no actions unlocked inside the band; not checked" for every skill.

## Why this one

A Tinker who beats Scrapjaw, around day 14 to 16, has nothing left to level: every action in the game unlocks at level 19 or below. GDD section 6 puts the Cinderworks Foundry at levels 20 to 45 and Act II there. This work order opens the band for the four skills that already have a Rustmoor ladder and are not Cooking, the same first step Rustmoor took in work order 004, and work order 017 for Scavenging.

## Inputs

Attach only these:

- `docs/gdd.md`, sections 1, 4 (Act II), and 6.
- `docs/canon/world.md` and `docs/canon/slices/act2.md`, for place and material names only. This is a data work order; nothing here is story text.
- `content/tuning/xp-curve.json`, and `docs/work-orders/001-xp-curve.md`'s "Carried forward" section.
- `content/actions/rustmoor.json` and `content/items/rustmoor.json`, to continue their chains.
- `docs/work-orders/004-rustmoor-actions.md` and `017-rustmoor-scavenging.md`, for how Rustmoor's table was derived and settled.
- The schemas `item/1` and `action/1` under `scripts/validate/schemas/content/`.

## Scope

- **Exactly 20 actions** in a new `content/actions/cinderworks.json`: 5 each for Prospecting, Scavenging, Smithing and Tinkering, at levels 20, 25, 30, 35 and 40.
- **The items those actions consume or produce,** at most 24, in a new `content/items/cinderworks.json`, with ids under `item.cinderworks.*`.
- **Names:** use Foundry and furnace materials that fit the canon slices (slag, clinker, firebrick, and so on); every name is yours to propose, and you list it in your report. Keep Rustmoor's split: Prospecting digs seams, Scavenging picks over what was thrown away, here the Foundry's slag heaps and ash pits.
- **Chains:** Smithing and Tinkering continue from Rustmoor's top tier and use this band's gathered materials. A Cinderworks recipe may take one Rustmoor material where it reads naturally (coal is the obvious one), as work order 004 accepted cross-skill inputs.

Not in this work order: Cooking (it needs the combat model's Ration figures for this band), Tailoring and armour, Tea Blending, weapons and gear stats, monsters, drops, collector and grocer prices, recipe quantities above 1, and any Calibrating. Each comes in its own work order.

## Settled before you start

- **The band's average is 3.38x the reference rate** (`band_xp_rate_targets.band_20_to_45`), and each skill must cross 20 to 45 within 2 days of 14 as the pacing check measures it.
- **The rate climbs within the band** as in Rustmoor: the first tier pays a little under 3.38x, the last a little over, and the band's average holds. Show each action's XP per hour as a multiple of the reference.
- **Action time keeps Rustmoor's step:** each tier is 54 s longer than the one before, continuing from Rustmoor's 216 s at level 15, so level 20 is 270 s, and XP is a whole number.
- **The level-20 tier opens on the day the Tinker arrives,** so it must not need anything only a Cinderworks monster drops; a Tinker can reach the Foundry with gathering alone.
- **Recipe quantities stay at 1,** as work order 004 settled for Rustmoor; real counts come with the economy work order.

## Constraints

- Every number is derived or raised as a question.
- Every end product needs a use or a capped buyer (work order 004, carried forward). Where an end product has neither yet, list it as an open question for the economy work order; do not add a buyer here.
- Run the validators, and hand back only when they pass.

## Hand back

The two files; every new id grouped by type for the registrar; each skill's band days and effective rate from the pacing check; derivations; open questions; and the validator output verbatim.

## The rest of the Cinderworks, in order

For planning only; each opens as its own work order once the one before is settled.

1. This action table.
2. Tailoring and the first armour (GDD section 6: "armour arrives with Tailoring in the Cinderworks"). Open question for Jeremy before it opens: a new skill starts at level 1 while the Tinker is near 20 elsewhere, so how Tailoring's first armour reaches a level-20 fighter in good time.
3. Soot Wraiths: monsters, combat stats and the band's weapons for all three styles.
4. Drops, the Ledger Page pity entries, collector prices and the Crown budget for the band.
5. Cooking for the band, from the combat model's Ration figures.
6. Old Bellows, the boss, with its Bellows Plate and Whistle notation.
7. Tea Blending, with Act II's story (a fine enough tea for Hale, a calming tea against Haze).
8. Act II's storylets, scrivener work orders cleared to Layer 2.
