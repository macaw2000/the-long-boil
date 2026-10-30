# Work order 031: retune for gear and tools

**Agents:** `assayer` for the walk, then `draftsman` for the numbers
**Status:** ready to run
**Blocks:** committing work order 030's Rustmoor gear and tools, which fail pacing without it.

## Why this one

Work order 030 drafted 44 Rustmoor pieces and tools. With them, the reference player (who holds the best reachable gear and tools, `combat.json` `gear.reference_gear`) moves faster than the curve allows, and the rats and Scrapjaw are off target:

- Crafting bands 1 to 20 read 12.68 days with tools (13.96 without), and 20 to 45 read 12.00 (outside 14 ± 2), because Rustmoor's level-15 tools carry through the Cinderworks band.
- With the drafted reference pieces, the rats' damage share a kill is 0.190 to 0.234 against the 0.25 target, and kill times run 0.1% to 4.1% fast.
- Jeremy settled on 30 October 2026 that the Act I walk wears what it can make and that Scrapjaw is re-solved to 0.5 against that. The walk today never wears gear, and with work order 030's quantities it no longer forges the Riveting Hammer at all (it wins with the Iron Crowbar at 41%, melee 22).

## Part 1: the walk (`assayer`)

`scripts/sim/walk-act1.mjs` plays Act I as a balanced player. Change its policy so it:

1. **Crafts and wears gear.** Give a share of the queue to the pieces and tools its skills can make (work order 030's held-hour model used 25% of the queue; use that unless the walk shows a reason not to), wearing each through `PUT /tinkers/:id/gear` as it is made, best piece per slot and best tool per skill.
2. **Still forges the Riveting Hammer** for Scrapjaw, as work order 025 settled (`boss.reference_weapon`). Its "tinkering 6" gate must not be trained on a 23-ingot Plumb Bob; pick training actions by labour per XP, not by level alone.
3. **Reports,** at 2, 3 and 4 check-ins a day: what it holds in each of the six slots and each tool when it first attacks Scrapjaw, the day of the first win, and Scrapjaw's win chance per attempt.

Also fix `cook()`'s NaN for actions with non-grocer inputs (work order 030, open question 8). Do not change content.

## Part 2: the numbers (`draftsman`)

1. **Re-solve the band rates for tools** (`tools.json` `pacing.resolve_must_hit`): scale each crafting action's XP per go by 1/F, keeping seconds and tiers, where F is the band's measured tool factor on the drafted ladder. Rustmoor 1 to 20 and the Cinderworks 20 to 45 must land at 14 days within 2 for the reference player with tools, and no further from 14 than today's 13.96 and 13.80. In the Cinderworks band, F comes from Rustmoor's level-15 tools until the Cinderworks has its own; say so.
2. **Retune the four rats** (`content/monsters/rustmoor.json`) to their `seconds_per_kill` and the 0.25 damage share against the reference player with work order 030's reference pieces, solving hit points and max hit as work order 011 did.
3. **Record and re-solve Scrapjaw:** list in `combat.json` `boss.reference_weapon._non_weapon_slots` what Part 1's walk holds at its first Scrapjaw attempt (the 3-a-day cadence, as work order 025 used), and re-solve Scrapjaw to 0.5 against the Riveting Hammer plus those pieces. Report the first-win day at 2, 3 and 4 check-ins from a rerun of the walk.

## Settled before you start

Everything in work orders 029 and 030 as settled; Jeremy's three answers of 30 October 2026 on work order 030 (hours of materials per piece, Smithing's salvage hook, the walk wears gear and Scrapjaw is re-solved to it).

## Hand back

Each part's changed files, the walk's report verbatim, every changed id for the registrar, pacing's band lines verbatim, each rat's and Scrapjaw's figures against target, derivations, open questions, and the validator output verbatim. The validators must pass in full, apart from provenance rows.
