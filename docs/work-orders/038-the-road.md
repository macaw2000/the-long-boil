# Work order 038: the road

**Agents:** `scrivener` for the stop names; the lead session for the schema, engine and client; `educator` on the words as a newcomer meets them; `inspector` for voice and reveal; `registrar` for the row.
**Status:** done (6 November 2026). Drafted, validated and reviewed; `road.main` passed the inspector, with four strings carrying notes for Jeremy, and ten novice cold reads found no debug-text reading and no confusing label.
**Blocks:** nothing in the build plan. Follows work order 037, which it must not undo.

## Why this one

Jeremy, 6 November 2026: "is there also some visual indicator we can give to the player to see their progress and inspire them to continue?" No tester who started since 3 November was seen again after their first stretch, and a player never sees how far through the story they are: `act1.progress` is shown nowhere, and the NEXT bar gives one task at a time.

## What it is

A road at the top of Story, and its dots on the NEXT bar. It has two sections and shows one at a time: three stops for the first day, then five stops for Act I, ending at the Foundry Pass (Jeremy, 6 November 2026).

- **Only what is earned is named.** A stop's name reaches the client once the stop is reached. Stops ahead are unnamed marks, so the road adds no term to a sitting and spoils nothing (`docs/first-day-plan.md`; 16 of 18 cold readers took counters for debug text).
- **The next scene shows what it waits on:** a bar for a skill, with a way to it, a calm line with a time for a visit, a line for anything else. Attention only when a scene can be played now.
- **Arrival is a moment:** the mark lights and the stop's name appears.
- **A finished section stays up** until the next visit (`opens_on`), so the third mark is seen lit and Act I's words stay out of the first day (the educator's check).
- **The gold ring means the scene reaches the stop.** Stops are two to five scenes apart, so the line says "the next scene", and the ring is kept for the one that arrives.

## The stops (`content/road/road.json`)

| Section | Stop reached when | Scene |
| --- | --- | --- |
| First day | `prologue.progress` 8 | rats_in_the_workshop |
| First day | `prologue.progress` 30 | the_neighbours |
| First day | `prologue.progress` 100 | brass_plate |
| Act I | `act1.progress` 15 | sealed_lab |
| Act I | `act1.progress` 30 | bottom_rim |
| Act I | `act1.progress` 40 | rook_at_the_tip |
| Act I | `act1.progress` 60 | two_columns |
| Act I | `act1.progress` 80 | foundry_pass |

## Scrivener

Each stop's `label`: one to four words, a small title for what the player has just lived through, read only after it. Act I's section `title` and `goal`, and the first day's `title`; the goal is shown from the start of Act I, so it must make sense before the player has reached it, and the Foundry Pass stays its name (the glossary explains it). The `hint` on the fourth Act I stop replaces "needs Ledger Page 1", read once the player has played scrapjaws_den. The first day's labels are act 0 and carry no term the scene has not taught. No new canon.

## Not in this work order

The email reminder (Jeremy's call); icons for the stops (list them for `docs/art-requests.md`); a road for Act II.
