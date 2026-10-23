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

## Settled after review

Jeremy set these on 22 October 2026, after the inspector's review:

- **Fix the inspector's fails as it proposed:** Brassbuckle is "she" (canon; the GDD's "He" was a typo, now fixed); the vent "empties a week's worth of steam straight into your sleeve" and says nothing; Pip's letter does not promise the Arrears dial stays up; "the rent is still owed" goes from the_list; "the coal" becomes "the Rations"; the kettle line ends at "Then she goes to put the kettle on."
- **Pip runs the bill for the Counting-House.** The repair is a deal Pip brokers: the clock is a Counting-House clerk's, and success takes 10 Crowns off the 15.
- **The bill is a Crown debt the engine tracks,** not an Arrears change. The letter sets `flag.owes_back_rent`; a successful repair also sets `flag.back_rent_reduced` (owing 5, not 15); the engine clears both when the player pays at the Counting-House window. Arrears may still rise for the risky options.
- **Five flags are now in the registry:** `flag.kept_brass_plate`, `flag.asked_brassbuckle_plate`, `flag.own_reading`, `flag.owes_back_rent`, `flag.back_rent_reduced`. Use them so the brass plate, altitude review and bottom rim choices carry forward.
- **A discarded letter returns to the deck** while its requirements still hold (an engine rule), so the letter may keep gating the Prologue.
- **Add beat 2, the sealed laboratory,** as a sixth storylet at the Polytechnic, between the_list and rat_nests, and renumber `act1.progress` so the chain still runs in order. The Polytechnic is now an allowed location. rat_nests may then use the "R.S. The Rats have it" lead.
- **rat_nests' hand search drops to difficulty 4.**

## Constraints

- Follow your own rules: voice, word limits, the banned list, terrible things offstage, invented details marked and surfaced.
- Nerve costs follow section 5: most storylets cost 1.
- Challenge difficulties suit a new Tinker in the first week (skills around 1 to 12).
- Run the validators. The provenance check will fail until the registrar adds rows for your ids; every other check must pass.

## Hand back

- What your own "What you hand back" section asks for, with the validator output verbatim.

## Settled after the second review

Jeremy set these on 22 October 2026, after the inspector's review of the revised drafts:

- **Take the inspector's fixes.**
  - bottom_rim: Mother Ash hands over "a sheet of brass, a riveting hammer and a dented Stokers' pocket gauge"; every outcome says "her pocket gauge". The gauge is not an item and gates nothing.
  - sealed_lab, forced path: "You pocket it and put the drawer back", so rat_nests' "The card in your pocket" holds on every path.
  - sealed_lab: "your spanner", not "your No. 4 spanner"; "draw the drawer" is rewritten.
  - sealed_lab: after a failure, the retry no longer asks you to straighten a runner that has snapped.
  - sealed_lab: Brassbuckle's dodge is no longer the weather. Give her one that belongs to the Polytechnic.
  - sealed_lab: cut "in a quick, slanting hand". Nothing on the card invites a comparison of handwriting.
- **rat_nests stays as drafted, at difficulty 4.** Its fail is fixed by work order 017, which gives Scavenging actions in Rustmoor so the skill can be trained before the scene.
- **Left as drafted:** the padlock, the wax and the hurry; the R.S. lead to the Rust Rats; the clerk who asked Pip for your name; the careful option's reward; Pip's voice; `flag.own_reading` on every path; altitude_review setting no flag of its own.

## Settled after work order 017

Jeremy set this on 22 October 2026:

- **Brassbuckle points the Tinker to Scavenging,** early enough that an hour of it fits before rat_nests (about 63 minutes of the level 1 action reaches Scavenging 4). Nothing in the first session queues Scavenging, so without the pointer a player meets rat_nests at Scavenging 1.

## Settled after the third review

Jeremy set these on 22 October 2026:

- **rat_nests requires Scavenging 3** (`"scavenging": ">=3"`), alongside its `act1.progress` gate. A player cannot reach it at Scavenging 1 in the first sitting; about 15 minutes of the level 1 action unlocks it, and the hand search is 45% there and 60% at Scavenging 4.
- **altitude_review:** "and an hour of it will teach your eye what is worth bending down for", so "it" no longer reads as the nails.
- **Left as drafted:** Brassbuckle's line does not name the skill, and no UI tip is added for now.

## Settled after the 48-hour assay

Jeremy set these on 22 October 2026, after the assayer's walk of the first playable slice:

- **Act I waits for the next visit.** altitude_review also requires `"record.check_ins": ">=2"`, so the first session ends after the Prologue and Act I opens at the first check-in after it. `record.check_ins` is a new engine-set quality in the registry: the engine counts a workshop check-in as a visit when it comes at least an hour after the last counted one. Setting the queue, changing a weapon and the Exchange do not count, so a long first sitting cannot roll into Act I (Jeremy, the same day). With the Prologue's two scenes spent, the first session ends at Nerve 8.
- **rat_nests at 45% after Brassbuckle's hour is accepted** as it stands.

## Settled after the Act I assay

Jeremy set these on 23 October 2026, after the assayer's 21-day walk found the first five Act I scenes all played in one sitting:

- **One opening scene per visit.** Each scene after altitude_review needs one more counted visit than the one before: the_list `"record.check_ins": ">=3"`, sealed_lab `">=4"`, rat_nests `">=5"`, bottom_rim `">=6"`, on top of their existing gates.
