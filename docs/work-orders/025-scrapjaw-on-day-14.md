# Work order 025: Scrapjaw on day 14

**Agents:** `assayer` (part 1), then `draftsman` (part 2), then `assayer` (part 3)
**Status:** done (28 October 2026). Part 1 found the gear path, not Scrapjaw, made the fight late: the walk reaches melee 20 on time but never holds the Steel Blade the fight was tuned for (Smithing 15). Jeremy decided a launch-day player cannot be assumed to buy one, the walk keeps attacking at 40%, and the XP curve stays. Scrapjaw is now tuned to the riveting hammer (hp 15,004 to 12,860; combat.json revision 8, `boss.reference_weapon`), and the combat check honours the listed weapon. First win: d16.05, d14.54 and d13.17 at 2, 3 and 4 check-ins (d14.54 in 4 of 5 seeds at 3; one a sitting later). Story pace over days 3 to 15: 7.46, 7.69 and 6.46. The Steel Blade now wins 73%, the best wrong-style weapon 38%. Both rows are validated; approval waits on Jeremy.
**Act:** Act I. **Zone:** Rustmoor, band 1 to 20. **Clearance:** Layer 1.
**Blocks:** Act I's pacing against GDD section 7 ("Around day 14 she beats Scrapjaw on her second attempt"). It does not block the phase 1 gate, which work order 024 closed.

## Why this one now

The Act I walk of 28 October 2026 (`scripts/sim/walk-act1.mjs`, `SIM_DAYS=21`, after work order 023) has the first win over Scrapjaw on day 16.0, 14.8 and 14.8 at 2, 3 and 4 check-ins a day. In the 14-day walk no cadence finishes Act I. Work order 001 put Scrapjaw at day 14 at about level 20, and the zone's band is 13.96 days by the pacing check.

**Melee is on time. The weapon is not.** At 3 check-ins the walk's player reaches melee 20 on day 12.7, as the curve says. But it holds an iron crowbar (power 50, melee 5) until the fight, and the win chance by melee level is:

| Day | Melee | Weapon | Win chance |
|---|---|---|---|
| 11.8 | 19 | iron crowbar | 2.3% |
| 13.1 | 20 | iron crowbar | 5.2% |
| 13.8 | 21 | iron crowbar | 10.0% |
| 14.5 | 22 | iron crowbar | 16.8% |
| 14.8 | 22 | (best) | 43.6%, first win |

The combat check tunes Scrapjaw to `BOSS_TARGET_WIN_CHANCE` 0.5 for a reference player at melee 20, other skills 6, three Rations and a **steel blade** (power 150, melee 15). Against that player the numbers already hit day 14. The walk's player never holds that blade, because forging it (`action.rustmoor.forge_steel_blade`) needs Smithing 15 and the walk ends Act I at Smithing 10. The riveting hammer (power 100, Smithing 10) turns up a sitting or two before the fight.

So the question is how a player comes to hold a power-150 melee weapon by about day 13, or whether Scrapjaw should be tuned to the weapon a player actually holds.

## Part 1: assayer, the diagnosis

Before any number moves:

1. Confirm the cause. Re-walk with the player handed a steel blade at melee 15 (a sim switch, not a content change) and report the first-win day at 2, 3 and 4 check-ins. If that lands on day 14 ± 0.5, the gap is the gear path; if not, say what else is short.
2. Report the gear path as the walk plays it: Smithing level by day, the day each melee weapon is first held, and the share of Boiler hours each skill gets after melee 15.
3. Say whether the walk's skill rotation is a fair stand-in for a player who wants to beat Scrapjaw, or whether a real player would push Smithing (or buy the blade on the Exchange) and the walk under-plays it. The walk has no other players to buy from.

## Part 2: draftsman, the smallest fix

Only if part 1 confirms the gear path. Propose the smallest change that puts the first win at day 14 ± 0.5 at 3 check-ins, with each option's knock-on effects:

- **(a) The sim, not the content.** The walk's player trains Smithing toward the blade once melee reaches 15. No content changes; the assayer owns the policy.
- **(b) The weapon arrives sooner.** For example `forge_steel_blade` at a lower Smithing level, or the steel blade as an uncommon drop from the Rust Rat Gaffer (levels 15 to 19).
- **(c) Scrapjaw tuned to the riveting hammer.** The reference player holds the power-100 hammer, and Scrapjaw's stats come down so that player wins half the time at melee 20.
- **(d) Anything smaller** you find.

Recommend one. Do not move the XP curve.

## Settled before you start

- **Target:** first win over Scrapjaw on day 14 ± 0.5 at 3 check-ins, on the first or second attempt (GDD section 7).
  Restated by Jeremy on 28 October 2026, after part 2: **by the first sitting of day 15** (day 14.54 at 3 check-ins). The walk's sittings fall at fixed hours, and the riveting hammer cannot be in hand before that sitting without changing the walk.
- `BOSS_TARGET_WIN_CHANCE` stays 0.5 for whichever reference player is settled.
- Offline resolution must still equal step-by-step replay.
- No new Crown faucet: a weapon drop has no collector price, or a capped one.
- Combat check warnings about missing armour stay as they are; Rustmoor armour is a separate work order.

## Open, for Jeremy, before this ships

- Which player the day-14 target is for: one who trains only melee and buys the blade, one who forges it, or the walk's mixed player.
- If the fix is (b) or (c), whether the steel blade should stay the weapon Scrapjaw is "meant" to be fought with.

## Acceptance

- The validators pass.
- The assayer re-walks at 2, 3 and 4 check-ins (`SIM_DAYS=21`) and reports the first-win day, attempts, end Crowns and story pace over days 3 to 15. At 3 check-ins the win lands on day 14 ± 0.5 and pace stays 6 to 8 (work order 023).

## Hand back

- Part 1: the cause, with the numbers above re-measured.
- Part 2: the options with knock-on effects, the recommendation, and a table of every changed value with its source.
- Part 3: the re-walk table and anything it moved that it should not have.
