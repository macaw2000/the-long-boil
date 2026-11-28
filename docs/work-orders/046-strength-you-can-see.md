# Work order 046: strength you can see

**Agents:** the lead session for the rules and tests. `draftsman` to restate the two constants in `combat.json` and `tools.json` with their basis; `inspector` on whether each number is defensible; `assayer` to rerun the walks. Still to come: Jeremy to play it.
**Status:** built and tested (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing.

## Why this one

The review measured it: from Melee 1 to Melee 4 the Runt went from 55 seconds a kill to 54, because every kill was floored at the monster's target time. Bench levels changed nothing at all. Levels arrived, the banner fired, and the game played the same.

Approved by Jeremy, 27 November 2026.

## The rules

**A monster you outlevel falls faster** (`combat.ts`, `levelEdge`, `planCappedKill`). Each level of the weapon's style above a monster's level cuts its kill time by `LEVEL_EDGE_PER_LEVEL` (4%), to no less than `LEVEL_EDGE_FLOOR` (half) of its target. The fight must still be won in that time. It works with the gear cap, never past the floor, and not on a boss.

**XP and Crowns an hour stay where they were.** A quicker kill pays XP at the same share (`KillPlan.xpShare`), and its Crowns at that share on average: the share is the chance of the whole purse, drawn only when it is under 1. So an easy monster never out-pays a harder one in XP or Crowns; only its items come faster. This keeps first-day decision 8 and the Crown budget where they were.

**Fine work at the bench** (`boiler.ts`, `fineChance`). Each level a Tinker holds above what a job needs adds 2% to the chance that a go makes twice its output, to 20%. It never doubles gear, what a go uses, or its XP, and never a go that makes an input for a queued piece. The haul says "Fine work N times", and a floater says it as it happens.

## Measured

In play: Melee 2 shows 52 seconds a kill against the Runt, down from 55; by Melee 5 it is about 46.

`engine/packages/rules/test/combat.test.ts` ("strength you can see"): no edge at the monster's own level, 4% a level above, never more than half; each Melee level a faster Runt with XP an hour unchanged; a night at Melee 20 makes over 60% more kills than at Melee 1 with Crowns within a tenth. `boiler.test.ts` ("fine work"): the chances, and what is and is not doubled.

The walk numbers are in work order 045.

## For Jeremy

1. **4% a level, to half.** A Runt is at its floor by Melee 14.
2. **Fine work instead of a speed step at the bench.** The review offered either. Fine work is a surprise the player can see, and it leaves XP an hour alone. More items do enter the economy, at most 20% more of a job the player far outlevels.
3. **GDD.** Section 6, "Combat", after "The reward for levelling is reaching harder ones": "and an easier one falls faster: each level above a monster cuts its kill time by 4%, to half, while XP and Crowns an hour stay as they were." Section 6, "Skills": "Each level above what a job needs adds 2% to the chance a go makes twice its output, to 20%. Gear is never doubled."

## Hand back

- Rules: `combat.ts` (`levelEdge`, `LEVEL_EDGE_PER_LEVEL`, `LEVEL_EDGE_FLOOR`, `KillPlan.xpShare`, `killXp` share), `boiler.ts` (`fineChance`, the purse at the share), `ledger.ts` (`fine`).
- Tests: `combat.test.ts`, `boiler.test.ts`, `ledger.test.ts`.
- The constants live in code for now. The draftsman should restate them in `combat.json` and `tools.json` so the validators hold them.
