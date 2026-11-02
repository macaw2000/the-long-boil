# Brief: one Lowvents storylet that spends umbrella silk

**Agent:** scrivener, reviewed by the inspector, registered by the registrar.
**Act:** 1. **Location:** lowvents. **Cleared for:** reveal layer 1. **Count:** 1 storylet.
**Storylet id:** `act1.lowvents.wet_coats`

## Why

The Lowvents hang so close to the Scald that the windows sweat, and the Stokers work in coats that never dry. Umbrella silk, which the Rust Rats carry home and work order 032 made a Tailoring material, is made to shed water. A Lowvents scene where you line the Stokers' work coats with it gives Tailoring a use beyond your own armour, and gives umbrella silk a sink in the story.

## What the scene must do

- Sit in the Lowvents in Act I, open once `act1.progress` is at least 20, and cost 1 Nerve with a cooldown of 24 hours.
- Give two or three options. At least one is a challenge on `tailoring`, with a success and a failure. At least one option requires and spends `item.rustmoor.umbrella_silk` (3 to 5 of it).
- Rewards stay small: at most `favour.stokers` +1 per outcome, and only on an option that spends silk; otherwise at most 2 `item.rustmoor.coal`. No Crowns.
- A failure may raise `needle.scald` by 1. Nothing may set a flag or progress.
- Mother Ash may be named but need not appear. Read and set only qualities listed in `qualities.json` or items that already exist.

## Not in this brief

No Ledger Page, no Rook, no Notice, no Gauge Readings, no own reading of the Scald. Nothing about where the Scald's heat comes from (see the slice's hard limits). Layer 1 is cleared, but this scene does not need it.
