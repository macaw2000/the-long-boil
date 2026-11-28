# Work order 045: hot steam

**Agents:** the lead session for the rules, server, client and tests. `scrivener` to review the three guide lines changed; `assayer` to rerun the walks with the numbers below as the baseline. Still to come: Jeremy to play it.
**Status:** built and tested (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing. Picks up "the first steam burst" that work order 041 held back.

## Why this one

Every first-tier job is 54 seconds, so a new player watched one bar for most of a minute to get one thing. Work order 041 held back a faster first ten minutes "until playtesters have seen this version"; they have, and they still leave.

Approved by Jeremy, 27 November 2026, from the review: a stock of hot goes, a top-up at each visit, and existing Tinkers granted the stock.

## The rule (`engine/packages/rules/src/boiler.ts`)

- A Tinker holds **hot goes**, `HOT_STOCK` 300 at most. A new Tinker starts full.
- A go that starts **while the player is at the workshop** spends one and takes a sixth of its time (`HOT_FACTOR` 6): 9 seconds for a 54-second job.
- "At the workshop" is a window of `HOT_WINDOW_MS` (90 seconds) opened by a look, a check-in or a change to the bench (`stoke`). The open tab looks after every go, so the window stays open while the player is there. Stoking is an input like any other, so resolving a span in one call or in many still gives the same state. The offline queue never spends the stock: nothing stokes it.
- A cold go already under way when the player arrives joins in at the same share done, so arriving never means waiting out a cold go.
- Each **counted visit** (an hour or more after the last) adds `HOT_TOP_UP` 30, up to the stock. Staying (work order 048) does not.
- The tool and the Boost multiply first; hot steam divides what they leave, rounded once, halves up.

Server: migration `028_hot_steam_and_firsts.sql` adds `hot_goes` (default 300, so **every Tinker already playing gets the full stock**), `hot_until` and `head_hot`. Nothing is reset.

Client: a Hot Steam count on the bar, "running hot" under the job, tile times shown hot while it runs, and Brassbuckle saying so in three lines of the guide. The queue's length is judged at the usual pace, so the goal bar does not read a night's rats as two hours. The places that open by work done were raised about threefold (Exchange 20, Tailoring 40, Prospecting 65, Smithing 90, Cooking 120, Scavenging 150), so a new one still comes every few minutes instead of all in five; a place already visited never shuts again.

## Measured

Played in a browser: Tinkering 2 lands during the first scene, three rats fall in about 30 seconds, and Melee 5 comes on the first day.

The Act I walk (`scripts/sim/walk-act1.mjs`, Tinker 1), before and after work orders 045 to 049 together:

| Check-ins a day | Foundry Pass before | after | Crowns at the end before | after |
| --- | --- | --- | --- | --- |
| 2 | day 17.04 | day 16.54 | 74,706 | 83,740 |
| 3 | day 16.54 | day 15.54 | 74,753 | 77,430 |
| 4 | day 16.54 | day 16.54 | 73,393 | 77,370 |

Still "about two weeks a zone". Crowns over the walk are 4 to 12% higher, mostly from the extra goes; the walk does not claim Firsts.

The bill walk (`scripts/sim/walk-bill.mjs`) moved more: see work order 048, "Pip's bill".

## Tests

`engine/packages/rules/test/boiler.test.ts` ("hot steam"): never spent by a queue nobody is watching; a sixth of the time while stoked; back to the usual pace when the window closes; the same state in one call or many with the same stokes; a cold go joining at the same share; cold once the stock is gone, and a top-up never past the full stock. `engine/packages/server/test/server.test.ts` ("the first hour"): a new Tinker's stock, and only the minute and a half after leaving running hot.

## For Jeremy

1. **Stock 300, top-up 30.** About 45 minutes of quick play to start, then a few minutes at each visit.
2. **The Cog Shop's Boost stacks** with hot steam (both apply). Since hot steam is spent only while present and the Boost is a paid time saver, this seemed fair. Say if it should not.
3. **GDD.** Section 6, "Offline play: the Boiler", and section 7's first sitting should mention hot steam. The GDD is above the lead session's clearance, so these are for you to apply:
   - Section 6, after the Boiler's hours: "A Boiler lit after a year cold runs hot. A Tinker holds up to 300 hot goes; while the player is at the workshop, each go spends one and takes a sixth of its time. Each visit an hour or more after the last adds 30. The queue never spends them while the player is away."
   - Section 7, the first sitting: "The bench runs hot while she is there: a spanner every nine seconds, and three rats in half a minute."

## Hand back

- Rules: `boiler.ts` (`HOT_STOCK`, `HOT_TOP_UP`, `HOT_FACTOR`, `HOT_WINDOW_MS`, `stoke`, `grantHot`, `paced`), `index.ts`.
- Server: `tinkers.ts` (`advance` takes `present`; check-ins, looks and bench changes pass it; `view` gives `hot`), migration 028.
- Client: `ActionBar.tsx`, `SkillView.tsx`, `Guide.tsx` (`JOBS_OPEN`, `queuedMs`), `api.ts`.
- Content: `content/guide/first_session.json` (`first_spanner`, `first_haul`, `come_back` lines and button; `pips_bill`'s "while you were away" for work order 048).
- Register: `prologue.sprocket_row.first_session_guide` changed; the registrar to set it back to `validated` and clear its review.
