# Brief: one Sprocket Row storylet for Tailoring at home

**Agent:** scrivener, reviewed by the inspector, registered by the registrar.
**Act:** 1. **Location:** sprocket_row. **Cleared for:** reveal layer 1. **Count:** 1 storylet.
**Storylet id:** `act1.sprocket_row.mending_basket`

## Why

Work order 032 opens Tailoring on day one, but no Act I storylet challenges it outside Rustmoor. The workshop is No. 9 Sprocket Row, and the Row knows its neighbours' business. Word that the Tinker at No. 9 can sew should bring the neighbours' mending to the door. A short repeatable scene at home makes the new skill part of the street's life.

## What the scene must do

- Sit on Sprocket Row in Act I, open once `act1.progress` is at least 5 and `tailoring` is at least 3, and cost 1 Nerve with a cooldown of 24 hours.
- Give two or three options. At least one is a challenge on `tailoring`, with a success and a failure. Use the GDD's odds formula to choose a difficulty that a Tinker at Tailoring 5 to 10 passes about half the time.
- Rewards stay small and come in kind, as the Row pays: at most 2 `item.rustmoor.rustmoor_ration` per outcome, or `needle.arrears` down by 1. No Crowns, no Favour.
- A failure may raise `needle.arrears` or `needle.scald` by 1. Nothing may set a flag or progress.
- Read and set only qualities listed in `qualities.json` or items that already exist.

## Not in this brief

No Ledger Page, no Rook, no Notice, no Gauge Readings, no Altitude Review. Layer 1 is cleared, but this scene does not need it.
