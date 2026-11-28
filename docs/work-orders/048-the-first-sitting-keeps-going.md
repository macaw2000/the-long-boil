# Work order 048: the first sitting keeps going

**Agents:** the lead session for the rules, server, client and the scene text. `scrivener` to own the new lines; `inspector` on reveal limits, twice; `educator` to cold-read with readers who do play idle games. Still to come: Jeremy to play it.
**Status:** built and tested (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing. Amends first-day decisions 3, 5 and 8 in `docs/first-day-plan.md`; Jeremy approved the change on 27 November 2026, and the decisions themselves are his to rewrite.

## Why this one

At minute 8 the card said "You can go" and Story shut for an hour. The three sittings were set from readers who had never played an idle game. The people who will stay are the ones who do, and they were sent away before anything had hooked them. The first eight minutes also had no mystery, no risk and no choice whose result showed.

## What changed

**Staying counts as the next sitting** (`story.ts`, `countStay`, `stayJobsLeft`). Once a sitting's scenes are played, 30 things made, gathered or beaten while the player is at the workshop count as the next visit, and the next sitting's scenes open. A player who leaves still gets the sittings an hour apart. The card, the goal bar and Story say which way is quicker: "after 30 more things done here, or when you are next back". Played: Pip's letter came about seven minutes into the sitting, without leaving.

**The send-off no longer sends anyone away** (`Guide.tsx`, `SendOff`). "No. 9 is running, whether you stay or go", then what staying gives (the hot steam left, the tube after 30 more things, the Firsts) before what leaving comes back to. The guide's button is "Carry on", and it no longer waits for a full night queued.

**A mystery in the first five minutes** (`the_first_haul`). Caught in the rats' silk is a corner of ruled paper: the foot of a column of figures in brown ink, and a question mark pressed through. Brassbuckle looks at it longer than at anything else, and says nothing. The quieter option keeps it under the vice.

**One real gamble** (`rats_in_the_workshop`, a third option). Reach into the nest after the second rat: Tinkering 2 against difficulty 2, about 60%. Success, 8 Rat Scrap; failure, 1 Rat Scrap and the first point of Scald. The odds dial, first met on day two before, now comes in the first two minutes.

**Choices show what they changed** (`Story.tsx`, `changeLines`; the server sends `played.changes`). Under each result, a chip for every item, Needle and Favour that moved: "+8 Rat Scrap", "Scald +1". Flags and progress stay out of sight.

**A gift with the bill** (`back_rent`). The canister wears a black silk ribbon, "the Row's, for new tenants"; both options give a Silk Favour (the Tailoring charm). Brassbuckle's line for the letter no longer says "while you were away".

## Pip's bill

The bill walk (`scripts/sim/walk-bill.mjs`), before and after work orders 045 to 049 together:

| Profile | Before | After |
| --- | --- | --- |
| few check-ins | sitting 2 to 4 (4 to 23 hours) | sitting 2 (about 4 hours) |
| six-hour gaps | sitting 2 or 3 (7 to 13 hours) | sitting 2 (about 7 hours) |
| evening start | sitting 2 (12 hours) | sitting 2 (12 hours) |

It is never paid in the first sitting, so decision 8 holds as written, and decision 19 already allows a second-sitting payoff. But decision 12 meant the bill as a goal across the second and third sittings, and now it is one sitting's goal for everyone. The cause is the first hour of hot steam paying full Crowns. **For Jeremy, one of:**

1. Keep it: an early win, with Pip's reaction (decision 21) arriving sooner.
2. Raise the bill (for example 2,100 Crowns, six quarters); a canon number, so `world.md` changes with it.
3. Pay a hot kill's Crowns at a sixth, as its time is (one line in `boiler.ts`); hot steam then speeds XP and items, not Crowns.

## Invented here, for Jeremy to keep or strike

- A corner of Hester's paper was in the rats' nest a year: brown ink, a column of figures, a question mark pressed through. It names no figure, place or gauge. The inspector should still read it against Act I's limits, since the brass plate later shows a reading.
- Brassbuckle looks at the paper "for rather longer", and at the vice after.
- Sprocket Row gives new tenants a black silk ribbon, and Pip's note says so.
- Iodine in the tea caddy at No. 9.

## Tests

`engine/packages/rules/test/firsts.test.ts` ("staying counts as the next sitting"): no count while the sitting's scenes are unplayed or once the Prologue is over; jobs add up after the sitting's last scene and count a visit at thirty. `server.test.ts`: a player who stays gets into the second sitting after thirty things done.

## Hand back

- Rules: `story.ts` (`STAY_JOBS`, `STAY_JOBS_FOR_SITTING`, `countStay`, `stayJobsLeft`; a counted visit clears the stay count).
- Server: `tinkers.ts` (`advance` counts staying), `story.ts` (`played.changes`), `api.ts`.
- Client: `Guide.tsx` (`SendOff`, `restLine`, `coach`), `Story.tsx`, `Workshop.tsx`, `api.ts`.
- Content: `prologue.sprocket_row.rats_in_the_workshop`, `prologue.sprocket_row.the_first_haul`, `prologue.sprocket_row.back_rent`, and `pips_bill` in the guide.
- Register: those three rows changed; the registrar to set each back to `validated` and clear its review.
- `docs/first-day-plan.md`: decisions 3, 5 and 8 need Jeremy's amended wording; sitting 1's table gains the paper, the gamble and "or 30 more things done here".
