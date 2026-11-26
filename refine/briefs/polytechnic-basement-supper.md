# Brief: one Polytechnic storylet for Cooking

**Act:** 1. **Location:** polytechnic. **Cleared for:** reveal layer 1. **Count:** 1 storylet.
**Storylet id:** `act1.polytechnic.basement_supper`

## Why

Cooking is a day-one skill, but only two Act I storylets challenge it, and neither is at the Polytechnic. The canon says Brassbuckle's first-years build boilers on a practical bench in the basement, and a qualified hand must test each before it is lit. First-years who are testing boilers late are not eating. A short repeatable scene puts Cooking in the life of the Polytechnic.

## What the scene must do

- Sit in the Polytechnic in Act I, open once `act1.progress` is at least 10 and `cooking` is at least 3, and cost 1 Nerve with a cooldown of 24 hours.
- Give two or three options. At least one is a challenge on `cooking`, with a success and a failure. Use the GDD's odds formula to choose a difficulty that a Tinker at Cooking 3 to 8 passes about half the time.
- Rewards stay small: at most 2 `item.rustmoor.rustmoor_ration`, or `favour.polytechnic` +1, per outcome. No Crowns.
- An option may spend up to 2 `item.rustmoor.barley_meal` or 2 `item.rustmoor.salt_pork`, if it requires them.
- A failure may raise `needle.scald` by 1. Nothing may set a flag or progress.
- Read and set only qualities listed in `qualities.json` or items that already exist.

## Not in this brief

No Ledger Page, no Rook, no Notice, no Gauge Readings, no Hester's sealed laboratory. Layer 1 is cleared, but this scene does not need it.
