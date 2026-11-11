# Work order 040: the Commonplace Book's notes

**Agents:** `scrivener` for the notes; the lead session for the engine, client and validators (done); `educator` and `inspector` on the notes; `registrar` for the revised rows.
**Status:** engine done; 20 notes in 19 files drafted, cold-read and reviewed (10 November 2026). The inspector's fixes to `brass_plate` and `the_first_nest` (both failed) and to `stair_lamp` and `bottom_rim` were applied word for word by the lead session.
**Blocks:** nothing in the build plan.

## Why this one

GDD section 5: "Every lore fact a player uncovers is written into the Commonplace Book, a re-readable codex." The GDD never says what a lore fact is, and work order 023 left `lore.*` without a meaning. Jeremy, 10 November 2026, chose option B: a lore fact is a short note on a storylet or letter outcome, and the book lists the notes a player has found, in the order found.

## What it is (built)

- **`note`, optional, on any outcome** of a storylet or letter (storylet/1, letter/1). When that outcome is played, the result card says "Noted in your Commonplace Book" with the note, and the note is in the book from then on.
- **The book is read from the event log** (`engine/packages/server/src/commonplace.ts`): no new table. The same note found twice, from a replay or from two options, is written once. A note added later is in the book of everyone who already played that outcome, so these notes reach existing testers on the day they ship.
- **The book also shows the Ledger Pages held,** after the notes.
- **"Read the Commonplace Book" appears on the Story tab once a note is in it,** not before: an empty book is nothing to do.
- **Validators:** a note is at most 30 words (`docs/canon/style.md`, Limits), and the banned-word, reveal and clearance checks read it as they read outcome text.
- **`lore.*` is untouched.** The book does not read it; what it counts stays open (work order 023).

## Scrivener

Add a `note` to outcomes in `content/storylets/` and `content/letters/`, Prologue and Act I.

- **A note is a fact about the city, its people or its factions** that a player would want to look up later: who answers to whom, what a word means in the Lowvents, what a place is for. It is not a recap of what you did ("You stood with Pip") and not a feeling.
- **It restates only what the scene's own prose already establishes.** No new canon, and no detail the description and outcome do not already give. If a fact needs more than the scene says, leave it out and list it for Jeremy.
- **Written as a commonplace book entry:** one or two plain sentences, present tense, third person, at most 30 words. Not in the second person: it is the book's voice, not the scene's.
- **Not every outcome.** Only where a real fact is uncovered. Aim for 15 to 25 notes across Prologue and Act I, and at least one in the Prologue, so a first-day player sees the book open.
- **Where two outcomes uncover the same fact,** give both the same note, word for word: the book writes a note once, however many times it is found.
- **Reveal:** each note at or below its file's `reveal_layer`. Layer 1 at most. No Haze, Whistle, Hearth, Steeped, capsules or knock words.
- Bump each touched file's `revision`.

## Decided while drafting

- **The first note is the tip book's, step 18 of the first-day plan.** Notes on the rats in the workshop, Pip's back-rent letter and the register were cut: the educator found the Book was a second new thing in sitting 1, and two of those notes raised questions they did not answer ("Am I a Tinker?", scrapyards against Rustmoor). No Prologue scene before the tip book carries a note.
- **One exception to restate-only, written by the lead session at Jeremy's request:** `act1.lowvents.the_list` defines Ballast Day from `gdd-cleared.md` (premise and glossary, Layer 0), though the scene's prose does not. The inspector passed it on canon and reveal. It is not a precedent: a scrivener still writes only what the scene establishes, and a fact the prose lacks goes to Jeremy.
- **A second exception, approved by Jeremy:** `act1.brass_exchange.rooks_question` tells the Gaugers from the Board (the educator's readers merged them, 5 of 6), in the inspector's wording from `gdd-cleared.md` (the factions table). It does not say whether the Gaugers answer to the Board; canon has not settled that.

## Acceptance

- `python3 scripts/validate/run.py` passes, apart from provenance until the registrar moves the revised rows.
- The educator's cold reads: a newcomer who reads a note alone, out of its scene, can say what it tells them.
- The inspector passes voice, lore and reveal on every note.

## Not in this work order

- What `lore.*` counts (work order 023's open question).
- Grouping the book by person, place or faction (option C), or a notes count on the Story tab.
- Notes in Act II and later: each act's scrivener work order adds its own.
