# Work order 026: Brassbuckle's guide lines, in character only

**Agents:** `scrivener`, then `inspector`
**Status:** ready to run
**Act:** Prologue. **Location:** No. 9 Sprocket Row. **Clearance:** Layer 0.
**Blocks:** nothing; the guide works as it stands. Polish for onboarding after the playtest of 28 October 2026.

## Why

Playtesters were lost in the first session, so the client's guide (`engine/packages/client/src/Guide.tsx`) was rebuilt on 28 October 2026. Each card now shows Brassbuckle's line in italics, and under it a plain instruction the client writes from the game's state, one press at a time ("Open Tinkering in the menu on the left.", "Pick Brass Spanner.", "Press Start."), with a single glow on that control. The card does the equip step itself with an "Equip Brass Spanner" button.

The lines in `content/guide/first_session.json` still end in instructions ("Press the Queue work button and set fifty Brass Spanners going."). None is wrong, but each now repeats the bold line under it, and the `equip` line points at the Loadout's Equip button when the card has its own.

## The change

- **Every line becomes character only:** one or two sentences in Brassbuckle's voice saying why this matters now, with no control names and no "press", "open" or "tab". The client's plain line says what to press.
- Keep `boiler`'s tip (the Boiler's 12 hours are how long the Tinker works without her) and `come_back`'s (the Boiler and queue keep working; the city will have written by the time she returns).
- Keep both `button` labels ("Open the valve", "Leave it running"): the client uses them.
- Aim for 25 words or fewer a line, inside the existing 40-word limit: on a phone her line sits above the instruction and should not push it off the card.
- Everything else as work order 021: Layer 0, `pips_bill` may be Brassbuckle on the canister, and the brass plate is never explained.

## Hand back

The file, each line before and after, and the validator output verbatim. The inspector reviews voice and the reveal layer; the registrar moves the row.
