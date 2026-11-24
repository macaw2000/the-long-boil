# Work order 043: Guild Contracts and the guild Workshop

**Agents:** the lead session for the rules, server and client. `draftsman` for the contract pool and tuning; `toolwright` for its schema and checks; `scrivener` for the one-line requests; then `inspector`, `assayer` and `educator`.
**Status:** design approved by Jeremy (23 November 2026). Contracts and tokens are built and tested, not reviewed by the crew. Guild Tokens have nothing to buy and Workshop points raise nothing until the second part, the Workshop and looks.
**Blocks:** guild charters (GDD section 5), which fill from Contracts.

## Why this one

Jeremy, 23 November 2026: "this is a social game, along with being an idle game, we are lacking so much". A guild has chat, a notice and a roster, and nothing to do together.

Settled by Jeremy the same day: five contracts a week, scaled to the guild's size; ordinary work counts by itself; rewards are tokens and Workshop progress, and no Crowns.

## What a player sees

A panel at the top of the Guild tab: five contracts, each an icon, a bar with three marks, and this Tinker's share. There is nothing to accept, hand in or claim. The panel says when the week ends. Nothing badges or glows: a finished tier is told in Recent activity (the While You Were Away ledger does not tell of it yet).

## The rules

1. **The week** starts Monday 00:00 UTC, on the game's clock. Five contracts are drawn for each guild, seeded by guild and week: four of the six skills the content trains (Prospecting, Scavenging, Smithing, Tinkering, Tailoring, Cooking) and one for fighting.
2. **A contract asks for hours of a skill's work,** not one item. The GDD's example, 50,000 Brass Ingots, is closed to a newcomer who cannot smelt and dull to a veteran who has moved on. Any item in the skill counts.
3. **Work is counted at the action's base seconds** (`seconds`; a monster's `seconds_per_kill`). An hour at level 1 and an hour at level 20 count the same. A tool or a Boiler Boost makes more goes in an hour, so it counts for more.
4. **Boss attempts do not count.** A boss is fought for its drop.
5. **Tiers** are 2, 4 and 8 hours per active member. A member is active if their Tinker was seen in the 7 days before the week began. The number is at least 1, so an absent member costs the guild nothing. One who joins mid-week adds only the part of the week left, an absent one who comes back to work is added then, and a tier once reached stays reached.
6. **Counted from the week's start or from joining,** whichever is later. Work done before leaving stays with the guild, if it had been settled; work still on the Boiler when a Tinker leaves counts for no one.
7. **Work settles late.** A Boiler's work is logged with the time it happened but only when its Tinker is next touched. A week therefore stays open 48 hours after it ends, for work dated inside it, and then closes for good. The Boiler runs at most 24 hours, so a player back within a day of it running dry loses nothing.

## Rewards

| For | Reward |
| --- | --- |
| Each member with at least 2 counted hours that week | 1 Guild Token for each tier the guild reached, at most 15 a week |
| The guild | 1 Workshop point for each tier, at most 15 a week |

- Tokens are paid when the week closes, to those still in the guild. An account is paid by one guild a week.
- Tokens are bound to the Tinker and never trade. No Crowns are paid, so no faucet opens.
- **Tokens buy looks:** guild-only outfits and backdrops, beside those Cogs and Favour open. They are recolours and existing paintings, so no new art is needed.
- **Workshop points raise the Workshop,** and each level adds 2 member places, from 30 to at most 50. Level n costs 10n points: 10, 20, 30, and so on to 100 for the tenth, 550 in all. No level makes work or fighting faster.

## The figures

- A Boiler filled once a day runs 12 hours, 84 a week. The full set is 5 x 8 = 40 hours a member, 48% of that. The first tier of everything is 10 hours, 12%.
- A guild reaching every tier gains its first two places in its first week, and reaches level 10 in 37 weeks (550 / 15, rounded up).
- These are proposals. `assayer` should run them against real check-in counts before the content is approved.

## How it is built

- Migration 026: `guild_weeks`, `guild_week_members`, `guild_contract_shares`, `guild_token_payments`, tokens on Tinkers and points on guilds.
- Counting happens in the transaction that saves a Tinker's settled work, from the same events, so a retry cannot count twice. It holds the week's row for that moment, so members of one guild settling together take turns.
- A week is drawn when first needed and closed when a member's Guild tab is next loaded. There is no scheduler. Payments wait in a table until each Tinker is next touched, as Exchange fills do.
- The hours and rewards are constants in `rules/src/contracts.ts`, not content. Moving them to `content/tuning/guild-contracts.json` with a schema waits for the `draftsman` and `toolwright`.
- Tests: the cap, a late settlement inside and outside the 48 hours, joining and leaving mid-week, changing guilds, an inactive member, and two members settling at once.

## Not in this step

- **Faction seals and Favour.** The GDD gives every contract a seal. Favour is capped at 3 in Act I and weekly guild Favour would reach it without a Work Order, so it should come with charters.
- Fights the guild makes together, trials on a schedule, and buffs.

## Getting into a guild in the first sitting

Jeremy, 23 November 2026: a "super low barrier to entry for creating and joining a guild. Ideally, someone should be able to do that within their first 15 mins". This replaces his choice earlier that day to keep the Guild tab hidden.

- The tab opens at the guide's last step, `come_back`, which docs/first-day-plan.md puts at about ten minutes. An invitation opens it at once, at any step.
- A new guild lets anyone in at once; its leader may change that. Guilds founded before keep what they had.
- Being in a guild opens chat. Work Orders and the whole Exchange still wait for the visit after the Prologue.

For the `educator`: the tab now appears beside `come_back`, whose load the first-day plan counts carefully.

## Settled by Jeremy (23 November 2026)

1. Hours of a skill in place of a fixed item (rule 2).
2. Tokens buy looks and the Workshop adds places, with nothing that speeds work.
3. Seals and Favour wait for charters.
