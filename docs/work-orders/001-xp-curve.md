# Work order 001: propose the XP curve

**Agent:** `draftsman`
**Status:** ready to run (revision 2)
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
4. **Per-band XP rate targets.** The XP per hour an action in each band (1 to 20, 20 to 45, 45 to 70) must pay, as a multiple of the reference action, for that band to take about two weeks. These are targets for the later action-table work order, not action yields.

Nothing else. No stats, no drop rates, no calibration odds, no prices. Those are later work orders.

## Settled before you start

Jeremy set these on 21 October 2026. They are now in `docs/gdd.md`, section 6. Do not raise them as open questions.

- **One shared curve.** All sixteen skills level on the same curve. There is not a curve per skill, and no skill is cheaper than another.
- **Logarithmic.** Each level costs more experience than the last, so early levels come quickly and late ones do not.
- **Offline counts.** Progress earned offline counts toward level exactly as time at the keyboard does. A zone's two weeks are two weeks of a player's life, not two weeks of their attention, so your band arithmetic includes the 12 offline hours per check-in.

Revision 2 adds three more, also set by Jeremy on 21 October 2026 after the first draft, and also recorded in section 6:

- **Geometric growth, confirmed.** Each level costs a fixed multiple of the one before, as the first draft built it.
- **A cheaper bottom.** The first levels cost less than the geometric rule gives, so section 7's "By day 2 Ada's total level passes 50" holds. The curve is a hybrid: a cheap opening stretch, then geometric growth. Choose where the opening stretch ends and how it joins the geometric part, and show that day 2 passes total level 50 at the stated rhythm.
- **Harder actions pay more XP per hour.** Do not hold every band to the reference rate. Each band is measured at its own XP rate, and the curve is judged by whether those rates are a sensible climb (say so if a multiplier looks unreasonable), not by whether one rate fits all three bands.

Two more, set the same day:

- **Combat XP goes mostly to the main combat skill.** A fight's XP goes mostly to the combat skill the player's loadout is built around, with the rest spread across the other combat skills. A zone's level band refers to that main combat skill. Propose the split as an assumption.
- **Keep the curve above level 70.** It runs on to level 100 unchanged, even though no capstone content needs those levels. Do not flatten or cap it.

The section 7 timeline has been corrected to match two weeks per zone: Scrapjaw (level 20) falls around day 14, and the Lightning Baron (level 70) around week six.

The first draft is in `content/tuning/xp-curve.json`. Revise it in place.

## Constraints

- Every number is derived from a stated GDD fact or raised as an open question. Show the derivation inline in your report, with the GDD line each one rests on.
- The curve must put each of the three zone bands, 1 to 20, 20 to 45, 45 to 70, near the GDD's two weeks per zone, at the session rhythm it states: 3 to 5 minutes, 2 to 4 times a day, with 12 hours of offline work per check-in.
- State your assumed check-ins per day and offline hours used per day as named constants at the top of the file. They are assumptions, not canon, and the assayer will report them as such.
- A curve that makes level 70 reachable in nine days is a failure, not a near miss. Say so and show the gap rather than quietly stretching a constant to hide it.

## Hand back

- The file, with the formula, the table, and the constants.
- A derivation per constant, each citing its GDD line.
- The three band checkpoints as elapsed days, each at its band's own XP rate, against the two-week target, with the gap.
- The per-band XP rate multipliers, and the day-2 total level at the stated rhythm.
- Every assumption, in a table, each marked as an assumption.
- Open questions. The shape questions, the band skill and the curve above 70 are settled above, so expect these instead, and add any others: whether total level across all sixteen skills gates anything beyond the level 50 trading unlock.
- The new ids, handed to the `registrar` for rows at `drafted`.

## Then

Jeremy reads the gaps and the assumptions, and either approves the curve or sets the constants himself. Nothing moves past `drafted` until he does.

## Carried forward to the action-table work order

Set by Jeremy on 21 October 2026, after the inspector's review of revision 2:

- **Each band's average XP rate is fixed by the curve:** 1x, 3.38x and 7.98x the Brass Ingot reference for bands 1 to 20, 20 to 45 and 45 to 70. Actions within a band climb, but the band's average must hold. In Rustmoor, the first actions pay slightly under the reference and later ones slightly over, so the zone averages 1x and Scrapjaw stays near day 14. This also softens the slow stretch around levels 15 to 20.
- **Two weeks per zone is for a balanced player** who splits the queue between combat and crafting. A player who fights around the clock moves about twice as fast, and that is accepted.
- **The 70/30 combat split is provisional** until combat stats exist. Secondary combat skills, Vitality and Fortitude among them, sit near level 18 when the main skill reaches 70.
- **Story skill checks must allow for crafting skills lagging the zone bands.**
- **Open:** whether §4's "Prologue (levels 1 to 5, the first session)" means skill levels. A 20-minute first session reaches about level 3 at the reference rate.
