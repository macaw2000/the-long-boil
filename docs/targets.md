# Targets

What the assayer measures against. Every number here is quoted from `docs/gdd.md`; nothing is invented. Numbers the GDD does not state are listed at the bottom as open questions, and the assayer reports them as unmeasurable rather than guessing a threshold.

## Pacing

| What | Target | Source |
| --- | --- | --- |
| Time to cross a zone's level band | About two weeks | §9, Assayer row: "About two weeks per zone" |
| Act beats against zone time | An act's roughly five days of Nerve stretched across the zone's two weeks | §6, "Act beats are gated to the zone's level band" |
| Session length | 3 to 5 minutes | §1, At a glance |
| Sessions per day | 2 to 4 | §1, At a glance |
| An act ends on | That zone's boss | §4, and §9 Assayer row |

## Story budget

| What | Value | Source |
| --- | --- | --- |
| Nerve cap | 10 | §5, Nerve |
| Nerve refill | 1 every 36 minutes, full in 6 hours | §5, Nerve |
| Story actions for a 3-check-in day | 25 to 30 | §5, Nerve |
| One act's scenes take | About five days at that rate | §5, Nerve |
| Post letters | Up to 3 held, 1 arriving every 2 hours | §5, The Pneumatic Post |
| Needle decay | 1 per 24 hours, redline at 8 | §5, The Four Needles |
| Ledger Page pity timer | Guaranteed within 500 kills | §5, Ledger Pages |

## Economy

| What | Target | Source |
| --- | --- | --- |
| Crown budget | Sinks remove at least 90% of what faucets add each week, once steady | §6, The Crown budget |
| Main Crown sink | Calibrating | §6, Treasure and Calibrating |
| Exchange sales tax | 2% | §6, The Brass Exchange |
| Price step | 2 to 5% | §6, The Brass Exchange |
| Order expiry | 30 days | §6, The Brass Exchange |
| Cog Crate tax on the Exchange | 15% | §8 |
| Trading and Work Orders unlock | Total level 50 | §6, Guilds |

An illustrative tolerance, from the worked patch example in §9: a change that would add **6% more Crowns per week than the sink target allows** was treated as a failure and sent back for a 20% cut to the reward. Treat that as the shape of the call, not a committed threshold.

## Offline

| What | Value | Source |
| --- | --- | --- |
| Boiler hours | 12, upgradable to 24 in +2 steps | §6, Offline play |
| Queue depth | 2 actions | §6, Offline play |
| Knockout respawn | 60 seconds, queue resumes | §6, Combat |

## Build and phase gates

| Gate | Threshold | Phase | Source |
| --- | --- | --- | --- |
| 7-day retention | At or above 30% | Closed alpha exit | §11, Rollout |
| No economy-breaking bug | 2 weeks clear | Closed alpha exit | §11, Rollout |
| Load test | 3,000 connections, p95 action latency under 200 ms | Open beta exit | §11, Rollout |
| Cost per daily player | Under $0.12 a month | Launch | §11, Rollout |

## Open questions

The GDD does not state these, so the assayer cannot measure them yet. Each needs a number from Jeremy before the step that depends on it:

1. **Hours of play, not days.** "About two weeks per zone" assumes a check-in rhythm but no total hours or actions. Without it, pacing can only be simulated as elapsed days at an assumed rhythm, which the assayer must label as estimated.
2. **The XP curve.** No formula, no per-level values, no per-action XP. Every pacing number is unmeasurable until this exists.
3. **Absolute faucet and sink figures.** The 90% rule is a ratio with no baseline. Crowns per hour from drops, per Work Order, per Guild Contract tier, and the cost of a calibration attempt are all unset.
4. **Calibration odds per level.** §6 says the odds are shown up front and that failure resets to +0, but gives no table from +1 to +20.
5. **Drop rates.** Named drops exist; rates do not, apart from the Ledger Page pity timer.
6. **Starting Crown prices.** §8 gives Cog prices in Cogs and a $4.99 crate, but no Crown prices for anything.
7. **Needle rise rates.** Decay is 1 per 24 hours. How much a failed check adds is set per storylet, with no cap stated.
