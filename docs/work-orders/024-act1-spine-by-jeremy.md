# Work order 024: the Prologue, Act I's close, the Ambition openers and the Ledger Pages

**Writer:** Jeremy (GDD section 9: "The Prologue and every act climax", "The first storylet of each Ambition"; decided again on 24 October 2026, Ledger Pages included)
**Status:** done (Jeremy, 28 October 2026). The assayer's walk (`scripts/sim/walk-act1.mjs`, 35 days, every road and Ambition forced in turn) plays all ten Prologue scenes in order in the first session on exactly one Nerve bar, reaches the Ambition choice on all four Foundry Pass roads, plays each Ambition's opener, and holds all five Ledger Pages with their text, with no refusals or stalls. Not settled here: Scrapjaw falls on day 15.5 to 16.5 rather than section 7's day 14, so the 14-day walk ends before Act I does; the register's 18 rows are still at validated or reviewed.
**Blocks:** the phase 1 gate "Act I playable end to end" (GDD section 11). Jeremy set what it needs on 24 October 2026: all ten Prologue scenes, Act I's close with the Ambition choice right after the Foundry Pass, the Ambition openers, and readable Ledger Pages. The Arrears and Notice redlines are not needed for the gate.

This is a brief, not a commission: the slots the engine already gives each piece, so what you write plays without code changes. Write in the same files and schemas as the agents (`storylet/1`, `letter/1`), run `python3 scripts/validate/run.py`, and the registrar records them as yours.

## 1. The Prologue: eight more scenes (ten in all)

- **Today:** Pip's bill (letter `prologue.sprocket_row.back_rent`, `prologue.progress` 0 to 50) and the brass plate (storylet `prologue.sprocket_row.brass_plate`, 50 to 100), with the first-session guide (`content/guide/first_session.json`) around them.
- **Slots:** ids `prologue.<location>.<name>`; locations the Prologue may use are Sprocket Row and the Polytechnic (GDD section 2, Places), plus Rustmoor for the first fight. Levels 1 to 5, the first session.
- **The rule that matters:** Act I's first scene (`act1.sprocket_row.altitude_review`) opens only when `prologue.progress` is 100 *and* `record.check_ins` is 2 or more, so it waits for a later visit. Anything you add must sit between 0 and 100, and the brass plate must stay the scene that reaches 100. Re-number the bill and the plate if you need the room (for example 0 to 10 and 90 to 100).
- **Nerve:** the first session should not run out. Ten scenes at 1 Nerve each fit one full bar.

## 2. Act I's close and the Ambition choice: one scene

- **Opens:** right after the Foundry Pass, `"act1.progress": "==80"`. All three roads to the Pass end at 80.
- **Must set:** `act1.progress` to 100 on every option, and exactly one Ambition on each of four options: `ambition.gauge`, `ambition.lantern`, `ambition.ember`, `ambition.fathom`, each to `1`. These are the canon names (`docs/canon/qualities.json`); each runs 0 to 100.
- **Nerve 1, no challenge** on the choice itself. A storylet in the Story tab, as you decided; no new screen.
- **Clearance:** Layer 1 still. The Ambitions' questions are in the GDD's Ambitions table; their endings are not for Act I.

## 3. The first scene of each Ambition: four scenes

- **Each opens on** its own Ambition: `"ambition.gauge": "==1"` and so on, and `"act1.progress": "==100"`.
- **Each moves** its Ambition on, for example to `5`, so the opener plays once. What comes after is later work.
- **Leans on** what the GDD's table says each Ambition uses (the Gauge: Exchange and Board Favour; the Lantern: combat, Scavenging, Ledger Pages; the Ember: Smithing and Stokers' Favour; the Fathom: Tinkering and Vapourist Favour).

## 4. The Ledger Pages: five texts

- **Page 1** (`item.rustmoor.ledger_page_1`, from Scrapjaw's chest) carries the Layer 1 reveal: the Board's false Gauge Readings, 70 fathoms in 11 years against the Gazette's 6 (`docs/canon/reveals.md`).
- **Four Rustmoor drop pages** (`item.rustmoor.ledger_page_drop_1` to `_4`) arrive on the pity timer while fighting.
- **Where the text goes:** one file per page, read by the Hester's Ledger section at the foot of the Story tab. A player sees a page's text only while holding the page; until its file exists, it reads as "not yet transcribed". For example `content/ledger/rustmoor.page_1.json`:

  ```json
  {
    "schema": "ledger_page/1",
    "id": "ledger.rustmoor.page_1",
    "item": "item.rustmoor.ledger_page_1",
    "reveal_layer": 1,
    "title": "One line",
    "text": "The page, in Hester's hand. Several lines are fine."
  }
  ```

- **The validators check** that the file is named for its id (`ledger.rustmoor.page_1` lives in `rustmoor.page_1.json`), that the item exists and has only one page, the reveal words for the page's layer, and the house style. Each page needs a provenance row as `drafted_by: "jeremy"`, which the registrar adds. No word limit is set yet; the style check warns until you set one.
