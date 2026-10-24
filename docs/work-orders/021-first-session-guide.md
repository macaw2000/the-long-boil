# Work order 021: Brassbuckle's first-session guide

**Agents:** `toolwright` (part 1), then `scrivener` (part 2)
**Status:** ready to run
**Act:** Prologue. **Location:** No. 9 Sprocket Row. **Clearance:** Layer 0.
**Blocks:** onboarding. Jeremy, after playing the build on 23 October 2026: no visual cues for what to do when. GDD section 7's first session has Brassbuckle walk the player through it, with one-line tips; the build has neither.

## What the guide is

A short card from Professor Brassbuckle at each step of GDD section 7's first session, shown in the client beside the control the step wants pressed, which glows. The client decides when a step is done from the game's own state; the card's words are content. Steps, in order (ids are fixed, the client depends on them):

| id | GDD section 7 | Done when (the client's rule) |
| --- | --- | --- |
| `boiler` | 2: Brassbuckle peels the Gauger tape off the Boiler; it fills to 12 hours | The player presses the card's button |
| `queue_spanners` | 3: queue 50 Brass Spanners from her 50 Brass Ingots | Spanners are queued, or one is held |
| `first_spanner` | 3: watch the first few land | A Brass Spanner is held |
| `pips_bill` | 4: Pip's first letter, the back-rent bill | The letter has been answered |
| `equip` | 5: equip the spanner | A weapon is equipped |
| `rats` | 5: fight the Rust Rats on the Row | The first kill pays Crowns |
| `pay_bill` | 6: sell the scrap at the Counting-House window and pay the bill | The back rent is paid |
| `brass_plate` | 7: the brass plate in the workbench | The Prologue reaches 100 |
| `come_back` | 8: queue 12 hours of work and come back | The player presses the card's button with work queued |

## Part 1, toolwright: the guide file and its checks

- **Schema `guide/1`** for one file, `content/guide/first_session.json`, id `prologue.sprocket_row.first_session_guide`: a `steps` array, each `{ "id", "speaker", "line", "button" }`. `id` must be one of the nine above, each exactly once and in that order; `speaker` is free text; `line` is the card's text; `button` is the label of the card's own button, required for `boiler` and `come_back` and forbidden on the others.
- **Checks:** the style check covers `line` and `button` (banned words, and a word limit of 40 for a line and 4 for a button); the reveal check covers them as act 0. Add the file to the provenance and references checks as any content file.
- **Fixtures:** a pass and a fail for each rule. Keep `python3 scripts/validate/run.py` the single command.

## Part 2, scrivener: the nine lines

- **One card per step,** in Brassbuckle's voice (`docs/canon/characters.md`): practical, protective, changing the subject when cornered. `speaker` is "Professor Brassbuckle" for every step except `pips_bill`, which may be Brassbuckle commenting on the canister.
- **Each line tells the player what to do and where,** in her words, not a manual's: the Queue work button, the Story tab, the Loadout, the Exchange tab and its Counting-House window. One sentence of character, one of instruction, at most 40 words.
- **`boiler`'s line** carries GDD section 7's tip, that the Boiler's 12 hours are how long the Tinker works without her. **`come_back`'s** says the Boiler and the queue will keep working, and that the city will have written by the time she returns.
- **Nothing above Layer 0.** The brass plate step says only that something is in the workbench; Brassbuckle does not explain it, and she changes the subject if it comes near.
- Attach only: `docs/canon/characters.md`, `docs/canon/style.md`, `docs/canon/world.md`, `docs/gdd.md` section 7, the Prologue's storylet and letter, and the `guide/1` schema.

## Hand back

- Toolwright: files changed, each new rule's failure message, and the validator summary verbatim.
- Scrivener: the file, each line, any invented detail, and the validator output verbatim.

## Settled during part 1

- **The guide is one content item:** its step ids are not content ids (an exemption like the economy file's anchors), so the file takes one register row.
- **A card is one line:** `line` and `button` may not contain a line break.
