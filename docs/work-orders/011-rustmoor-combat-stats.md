# Work order 011: Rustmoor's monster and weapon stats

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** a fightable Rustmoor, and the calibration work order.

## Why this one

The combat model (work order 009) and its check (work order 010) exist. Every Rustmoor monster has a target kill time and Scrapjaw a 50% win target, but none has hit points or damage, and there are no weapons with stats. The check fails any monster whose weakness has no weapon of that style in its zone at its level.

## Inputs

Attach only these:

- `content/tuning/combat.json` and `docs/work-orders/009-combat-model.md`, including both "Settled" sections.
- `content/monsters/rustmoor.json`, `content/items/rustmoor.json`, `content/actions/rustmoor.json`, `content/drops/rustmoor.json` and `content/tuning/economy-rustmoor.json`.
- `docs/work-orders/008-rustmoor-drops.md`, its "Carried forward to the combat-stats work order" bullet.
- `docs/gdd.md`, section 6 (Skills, Combat, Treasure and Calibrating) and section 7 (the first session).
- `docs/canon/slices/act1.md` and `docs/canon/style.md`, for any new item's name and flavour.
- The schemas `monster/2` and `gear/1` under `scripts/validate/schemas/content/`.

## Scope

1. **Move the 5 Rustmoor monsters to `monster/2`,** adding the combat stats the schema asks for. Solve them from the model so each rat hits its `seconds_per_kill` and Scrapjaw its 50% win chance, for the model's reference player with matched gear and Rations stocked. Change no existing field.

2. **`content/gear/rustmoor.json`: weapons only.** Every rat and Scrapjaw needs a weapon of its weakness style in Rustmoor at or below its level, so Rustmoor needs at least:
   - **Melee:** the Brass Spanner at level 1 (section 7: Ada "equips the spanner"). Scrapjaw's Cleaver at level 20, below whatever Cinderworks offers (work order 008's carry-forward). Use the Steel Blade at level 15 if it fits; it is already a Rustmoor item.
   - **Marksmanship:** a weapon by level 5, for the Scrounger. Section 6 says Tinkering makes rifles.
   - **Aetherics:** a weapon by level 10, for the Tinplate.
   - Scrapjaw is weak to Marksmanship, so a marksmanship weapon must be usable at level 20 without the Cleaver.
   Rows +1 to +20 stay null; the calibration step is still open.

3. **New items, at most 3,** for the marksmanship and aetherics weapons the zone lacks, appended to `content/items/rustmoor.json`. Each needs a source. A new Tinkering action is the natural one for a rifle; propose a source for the aetherics weapon and mark it a proposal. If you add actions, append them to `content/actions/rustmoor.json` at the tier rate for their unlock level, so the pacing check is unchanged, and add the new items to the economy file.

No armour. Armour comes with Tailoring; the check's no-armour warnings are expected. No Rations; the model's provisional heal stands in for one.

## Constraints

- Every stat is solved from the model or raised as a question. Show each monster's computed kill time and Scrapjaw's win chance from the check's NOTE lines.
- Report the recomputed boss steepness: Scrapjaw's win chance one level below and above, and with the wrong style. The settled figures came from an earlier illustrative heal.
- Clearance: Act I only for any new name or flavour line.
- Hand new ids to the registrar through your report. The provenance check will fail until it adds the rows; every other check must pass.

## Settled after the first draft

Jeremy set these on 22 October 2026:

- **Weapon power at +0 is 10 × level required.**
- **A monster's attack interval scales with its kill time:** `attack_interval_s = seconds_per_kill / 18`, so every fight has about the same number of monster swings and harder monsters hit harder. Kill times and Ration use are unchanged.
- **Scrapjaw's Cleaver has +0 power 180,** between the Steel Blade and the level-20 rule, so level-20 Cinderworks weapons outclass it.
- **Accepted:** the hit-point jump between tiers, Tinkering as the source of the Spark Rod, and the Garnet Rifle.

## Settled after the inspector's review

Jeremy set these on 22 October 2026. The third, fourth and fifth are recorded in GDD sections 6 and 7.

- **Scrapjaw is weak to melee.** Ada's path in section 7 is melee, and the boss now drops a weapon of the style that beats it. Re-solve Scrapjaw for the melee reference player.
- **Every attack style has a weapon at levels 1, 5, 10 and 15 in Rustmoor.** That is 7 more weapons: melee at 5 and 10 (Smithing), marksmanship at 1 and 10 (Tinkering), aetherics at 1, 5 and 15 (Tinkering), each with its item, its action at the tier rate for its level, and its economy entry. Power follows the 10 × level rule.
- **Scrapjaw keeps the /18 attack interval.** The settled steepness is now about 9 points of win chance per level and about 15% with the wrong style, replacing work order 009's 15 points and 4%.
- **Rations are required for the boss,** and Brassbuckle leaves a starter stock in the first session. A Cooking work order comes next.
- **Rustmoor has no armour** for the capstone, so these stats stand when Tailoring arrives in the Cinderworks.
- **Accepted for now:** the Ration load on new players, to revisit after a playtest.
- **Small fixes:** the Iron Rifle throws a ball, not a bolt. The Garnet Rifle keeps no collector, and its sight adding power rather than accuracy is accepted.
- **`combat.json` must record** the /18 interval rule, the 10 × level power rule and the Cleaver's 180, and its steepness and Vitality/Fortitude figures must match the content.

## Hand back

- The files, every new id, each monster's stats with its computed kill time or win chance, the boss steepness, derivations, proposals, open questions, and the validator output verbatim.
