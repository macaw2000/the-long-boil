# Brief: one Rustmoor storylet that feeds Tailoring

**Agent:** scrivener, reviewed by the inspector, registered by the registrar.
**Act:** 1. **Location:** rustmoor. **Cleared for:** reveal layer 1. **Count:** 1 storylet.
**Storylet id:** `act1.rustmoor.silk_line`

## Why

Work order 032 opens Tailoring on day one, and the Rust Rats carry umbrella silk (`item.rustmoor.umbrella_silk`) home for their nests. A new Tinker should meet that idea in the story as well as the drop table: a short repeatable scene on the tip that ties umbrella silk to the people who live there.

## What the scene must do

- Sit in Rustmoor in Act I, open once `act1.progress` is at least 15 (after the rat nests beat), and cost 1 Nerve with a cooldown of 24 hours.
- Give two or three options. At least one is a challenge on `tailoring` or `scavenging`, with a success and a failure.
- Rewards stay small: at most 3 `item.rustmoor.umbrella_silk` or 1 `item.rustmoor.quilted_silk` per outcome. No Crowns.
- A failure may raise `needle.scald` by 1. Nothing may set a flag or progress.
- Read and set only qualities listed in `qualities.json` or items that already exist.

## Not in this brief

No Ledger Page, no Rook, no Notice, nothing about Gauge Readings. Layer 1 is cleared, but this scene does not need it.
