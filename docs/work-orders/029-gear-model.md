# Work order 029: the gear model

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** the engine work for the new slots, work order 030 (Rustmoor's gear and tool ladder), and moving work order 028's Cinderworks armour into slots.

## Why this one

Playtests found the first days too bare: two gear slots, weapons only at levels 1, 5, 10 and 15, armour locked behind Fortitude until about day 14, and nothing worn that touches crafting or gathering. Jeremy settled a new shape on 30 October 2026 (GDD section 6, Gear and tools; `docs/build-plan.md` milestone 13). This work order turns it into model rules in `content/tuning/combat.json` and a new tools file, before any gear is drafted against them.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat, Gear and tools, Treasure and Calibrating) and section 8.
- `docs/build-plan.md`, milestone 13.
- `content/tuning/combat.json` (revision 9), `content/tuning/xp-curve.json` and `content/tuning/cog-shop.json` (the Boiler Boost, which also speeds work).
- `docs/work-orders/001-xp-curve.md`, `009-combat-model.md`, `011-rustmoor-combat-stats.md` and `028-tailoring-and-first-armour.md`, each with its settled sections.
- The schemas `gear/1` and `tuning.combat/1` under `scripts/validate/schemas/content/`.

## Settled before you start (Jeremy, 30 October 2026)

- **Seven combat slots:** Weapon, Off-hand, Head, Body, Hands, Feet, Charm. One piece in each.
- **One tool slot per gathering and production skill** (Prospecting, Scavenging, Lumbering, Smithing, Tinkering, Tailoring, Cooking, Tea Blending). A tool makes its skill's work faster.
- **Wear rules:** a weapon by its style's level (unchanged); armour, Off-hand and Charm by combat level, the highest of Melee, Marksmanship and Aetherics; a tool by its own skill's level.
- **Gear first, then measure:** no change to the XP curve, to action times or to the action tiers in this work order.

## Scope: propose, derive and record

1. **What each slot gives.** Head, Body, Hands and Feet give armour points, as today's single piece does (`gear.armour`); say how a slot's share of a zone's armour is set, so four pieces together are worth what the band needs and no one slot dominates. Propose what Off-hand and Charm give (for example armour, accuracy, hit points, Ration healing), using only stats the model already has.
2. **The +0 rules for each slot,** in the shape of the settled `power(0) = 10 x level_required` and `armour(0) = 3 x level_required`. Work order 028's rule keyed armour to Fortitude; it must be restated against combat level, with the reference player's combat level in place of Fortitude.
3. **Tool speed.** A rule for how much faster a tool makes its skill's work at each level required, how it composes with the Boiler Boost (multiplied or added), and that a go keeps the speed it started with, as the Boost does, so offline resolution still equals step-by-step replay.
4. **How pacing counts tools.** The band pacing check (14 days a zone) and `reference_player` assume no tools and one armour piece. Propose whether the reference player now holds the zone's best reachable tool and gear in every slot, and what that does to each band's days; if a band then crosses well under 14 days, say what would bring it back (for example a revised `band_xp_rate_targets`), but do not change the curve or any action here.
5. **Record it** in `content/tuning/combat.json` as a new revision (the slot list in `gear.loadout`, each slot's rule, the combat-level gate, `reference_player` and `reference_gear`), and the tool rule in a new `content/tuning/tools.json` with schema `tuning.tools/1`. If a schema needs a new field, write the schema change and say so; do not edit validator code.

## Not in this work order

Any actual gear or tool items, monsters, drops, the engine, art, the Cinderworks armour's move into slots, and Calibrating's step.

## Constraints

- Every number is derived or raised as a question.
- Show, for the reference player at main levels 1, 5, 10, 15 and 20, the damage taken and kill time with a full set of +0 gear against today's one-weapon loadout, and what a tool does to a band's days.
- Run the validators, and hand back only when they pass apart from provenance rows for new files, which the registrar adds.

## Hand back

The changed and new files, every new id for the registrar, the rules with their derivations, the tables above, open questions, and the validator output verbatim.
