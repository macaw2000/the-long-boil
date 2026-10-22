# Work order 016: the first five storylets and Pip's first letter

**Agent:** `scrivener`
**Status:** ready to run
**Act:** Prologue and Act I. **Location:** No. 9 Sprocket Row, Rustmoor and the Lowvents. **Clearance:** Layer 1.
**Blocks:** the story half of the 48-hour test (GDD section 10: "five storylets with Nerve").

## Why this one now

Every other piece of the first playable slice has approved content. The story engine needs real scenes to run.

## Inputs

Attach only these:

- `docs/canon/slices/act1.md`, the Act I slice. Nothing above it.
- `docs/canon/style.md` and `docs/canon/qualities.json`.
- `docs/gdd.md`, section 5 (Qualities, Storylets, Nerve, The Pneumatic Post, The Four Needles) and section 7 (the first session and the first week).
- `content/items/rustmoor.json`, for real item ids.
- The schemas `storylet/1` and `letter/1` under `scripts/validate/schemas/content/`.

## Scope

1. **Exactly 5 storylets** in `content/storylets/`, one file each: the first story scenes a new Tinker meets, in order. One is the Prologue's brass plate on the workbench (section 7, step 7). The rest come from the slice's opening Act I beats, as far as the slice clears them.
2. **Exactly 1 letter** in `content/letters/`: Pip Tumbler's first letter, the bill for the workshop's back rent (section 7, step 4). The bill is 15 Crowns (work order 012).

## Settled before you start

- **Item ids** are the real ones, in `item.<zone>.<name>` form, not the GDD example's `item.pressure_gauge`.
- **Challenges use skills only,** since the odds formula is written in terms of skill.
- **Flags are set only by storylet outcomes.** Nerve is a cost, never a requirement.
- **A fresh Tinker** starts with every skill at 1 and every other quality at 0.
- **Letters cost 1 Nerve,** like most storylets.
- **Crowns are not a quality,** so paying Pip's bill cannot be written as a quality change. Model the bill through `needle.arrears` and raise payment in Crowns as an open question for the engine.

## Constraints

- Follow your own rules: voice, word limits, the banned list, terrible things offstage, invented details marked and surfaced.
- Nerve costs follow section 5: most storylets cost 1.
- Challenge difficulties suit a new Tinker in the first week (skills around 1 to 12).
- Run the validators. The provenance check will fail until the registrar adds rows for your ids; every other check must pass.

## Hand back

- What your own "What you hand back" section asks for, with the validator output verbatim.
