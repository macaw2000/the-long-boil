# Brief: one Lowvents storylet for Smithing

**Agent:** scrivener, reviewed by the inspector, registered by the registrar.
**Act:** 1. **Location:** lowvents. **Cleared for:** reveal layer 1. **Count:** 1 storylet.
**Storylet id:** `act1.lowvents.shovel_rack`

## Why

Smithing is the skill a new Tinker trains first, but only one Act I storylet asks for it. The Lowvents are Stoker country, and a Stoker's shovel takes a beating against the Kettle's coal every shift. The canon says the stair pays a Tinker in coal. A short repeatable scene at the Fellowship hall, where the off-shift Stokers bring their split and blunted shovels to the Tinker who can mend them, puts Smithing in the life of the district.

## What the scene must do

- Sit in the Lowvents in Act I, open once `act1.progress` is at least 10 and `smithing` is at least 5, and cost 1 Nerve with a cooldown of 24 hours.
- Give two or three options. At least one is a challenge on `smithing`, with a success and a failure. Use the GDD's odds formula to choose a difficulty that a Tinker at Smithing 5 to 10 passes about half the time.
- Rewards stay small and come as the Lowvents pay: at most 3 `item.rustmoor.coal` or 1 `item.rustmoor.iron_ingot` per outcome. No Crowns.
- A failure may raise `needle.scald` by 1. Nothing may set a flag or progress.
- Read and set only qualities listed in `qualities.json` or items that already exist.

## Not in this brief

No Ledger Page, no Rook, no Notice, no Gauge Readings, no Ballast Day. Layer 1 is cleared, but this scene does not need it.
