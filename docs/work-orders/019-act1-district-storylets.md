# Work order 019: Act I district storylets, and Tallow's reminder

**Agent:** `scrivener`, with numbers reviewed by the `draftsman`
**Status:** ready to run
**Act:** Act I. **Locations:** Sprocket Row, Rustmoor, the Lowvents, the Polytechnic, the Brass Exchange. **Clearance:** Layer 1.
**Blocks:** story pace. The Act I assay (21-day walk, after work order 018) measured about 1 story action a day against GDD section 5's 25 to 30. Most days nothing was open; Nerve sat full.

## Why this one now

The act's spine is written. GDD section 6 says act beats are stretched across the zone's two weeks "with Ambition and district storylets filling the gaps". Ambitions wait on clearance; district storylets do not. They are the scenes a player can return to: the city's ordinary life between the beats.

## Inputs

Attach only these:

- `docs/canon/slices/act1.md`, with `world.md`, `characters.md`, `style.md` and `qualities.json`.
- `docs/gdd.md`, section 5 (Storylets, Nerve, The Four Needles) and section 7 (a normal check-in, the first week).
- All Act I and Prologue story files under `content/storylets/` and `content/letters/`, read only, for voice, flags and progress values.
- `content/items/rustmoor.json` and `content/tuning/economy-rustmoor.json`, for real item ids and which items have a collector or grocer price.
- The schemas `storylet/1` and `letter/1`.

## Scope

1. **Exactly 10 district storylets** in `content/storylets/`, two for each of the five Act I locations, ids `act1.<location>.<name>`.
   - **Repeatable.** Each stays open while its requirements hold, and none sets the progress value that opens it, so a player can return to it on later visits. Each should read well the second and fifth time: a situation, not an event.
   - **Spread across the act.** Each requires an `act1.progress` floor (`>=`), so districts open as the spine reaches them, and may add a skill gate in the zone's band. At least two open by `act1.progress >= 5`, so the first days are not empty.
   - **None moves `act1.progress` or `prologue.progress`.**
   - **Each has 2 to 4 options with real trade-offs** between Needles (Scald, Arrears, Notice from beat 5 on), Favour, and items. At least half carry a skill challenge.
   - **Nerve 1 each.**
2. **Exactly 1 letter:** Silas Tallow's reminder about the Foundry Pass account. It requires `flag.owes_foundry_pass == 1`, is dealt only while the debt is unpaid, and raises `needle.arrears` on at least one option. It cannot charge Crowns; it may point the player to the Counting-House window.

## Settled before you start

- **Repeatable rewards must not become a faucet.** No outcome gives an item that a collector buys (any item with a `collector_price` in the economy file), and no outcome gives Crowns. Favour is capped at 7 by the registry, so it may be a reward, but small: at most `+1` per outcome.
- **Item costs and item rewards are placeholders** for the draftsman to review, as in work order 018.
- **A storylet never sets a skill or a `record.*` quality.**
- **Letters are one-shot once answered;** a letter's requirements decide when it is dealt.
- **Challenge odds** use the GDD formula on skills only, with difficulties that suit the scene's gate.

## Open, for Jeremy, before these ship

Draft with your best proposal and list each under "New qualities" or "Invented details".

- **New flags or qualities,** if any scene needs to remember something. Prefer none.
- **Whether any district scene should be one-shot** after all.

## Constraints

- Follow your own rules: voice, word limits, the banned list, terrible things offstage, invented details marked and surfaced.
- Clearance: Layer 1 only. No Haze, Whistle, Hearth, Steeped, capsules, or knock words (the validators now fail them below Act II). Hester appears only through what is already written.
- Run the validators. The provenance check fails until the registrar adds your ids; every other check must pass.

## Hand back

- What your own "What you hand back" section asks for, with the validator output verbatim, each scene's gate and why, and a table of every item cost and reward for the draftsman.
