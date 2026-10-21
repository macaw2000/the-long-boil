# Work order 001: propose the XP curve

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** every pacing number the assayer reports, and therefore every later tuning step.

## Why this one first

`docs/targets.md` lists seven figures the GDD does not state. The XP curve is the root of four of them. Until it exists, "about two weeks per zone" cannot be simulated, only assumed, and the assayer has to label every pacing report as estimated.

## Dependency, read before starting

The draftsman's own rules say to run `scripts/validate/` before handing back. **That directory does not exist yet.** For this work order only, the validator step is waived, and the draft hands back with `validators: none, waived by work order 001`. The toolwright builds the tuning schema and the curve checks in work order 002, and this file is re-validated then.

Do not treat this waiver as a precedent. It applies to this work order and no other.

## Inputs

Attach only these:

- `docs/gdd.md`, sections 1, 6 and 7.
- `docs/targets.md`, the Pacing and Open questions sections.
- `docs/canon/qualities.json`, for the skill names.

No canon slice. This work order writes no prose and touches no story.

## Scope

Produce one file, `content/tuning/xp-curve.json`, holding:

1. **Total XP to reach each level, 1 to 100.** A formula with its constants, plus the resolved table. A formula alone is not enough; the table is what the engine and the sim read.
2. **One reference action yield.** Pick a single early action named in the GDD, smelting a Brass Ingot, and give the XP it grants. Without this the curve cannot be tested against time. Mark it clearly as a reference value for pacing work, not the start of an action table.
3. **The band checkpoints.** Where levels 20, 45 and 70 fall on the curve, since those are the zone boundaries in section 6.

Nothing else. No stats, no drop rates, no calibration odds, no prices. Those are later work orders.

## Constraints

- Every number is derived from a stated GDD fact or raised as an open question. Show the derivation inline in your report, with the GDD line each one rests on.
- The curve must put each of the three zone bands, 1 to 20, 20 to 45, 45 to 70, near the GDD's two weeks per zone, at the session rhythm it states: 3 to 5 minutes, 2 to 4 times a day, with 12 hours of offline work per check-in.
- State your assumed check-ins per day and offline hours used per day as named constants at the top of the file. They are assumptions, not canon, and the assayer will report them as such.
- A curve that makes level 70 reachable in nine days is a failure, not a near miss. Say so and show the gap rather than quietly stretching a constant to hide it.

## Hand back

- The file, with the formula, the table, and the constants.
- A derivation per constant, each citing its GDD line.
- The three band checkpoints as elapsed days, against the two-week target, with the gap.
- Every assumption, in a table, each marked as an assumption.
- Open questions. Expect at least these, and add any others: whether offline hours count toward the band time, whether non-combat skills share the curve with combat skills, and whether the 16 skills level independently or feed a total level that gates zones.
- The new ids, handed to the `registrar` for rows at `drafted`.

## Then

Jeremy reads the gaps and the assumptions, and either approves the curve or sets the constants himself. Nothing moves past `drafted` until he does.
