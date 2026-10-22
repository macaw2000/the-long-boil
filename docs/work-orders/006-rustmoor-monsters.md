# Work order 006: the Rustmoor monsters

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** the combat half of Rustmoor's pacing, and the combat-stats and drops work orders.

## Why this one

Rustmoor's level band counts the main combat skill. GDD section 6 names its monsters, the Rust Rats, and its boss, Scrapjaw. Section 7's first session has Ada win her first fight there.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Combat).
- `docs/canon/slices/act1.md`, the Act I slice. Nothing above Act I.
- `docs/canon/style.md`.
- `content/tuning/xp-curve.json`, and `docs/work-orders/001-xp-curve.md`'s "Carried forward" section.
- The schema `monster/1` under `scripts/validate/schemas/content/`.

## Scope

**Exactly 5 monsters** in `content/monsters/rustmoor.json`:

- **4 kinds of Rust Rat**, at `level` 1, 5, 10 and 15. Section 6 names only "Rust Rats", so the four kinds' names are yours to propose. Each is a Rust Rat, and you list every name in your report.
- **Scrapjaw**, the boss, with `boss: true`. Its level is where section 7 puts the fight: Ada beats it around day 14, at about level 20.

Spread the three weaknesses across the four rats so that no single combat skill covers the whole zone. Nothing else: no stats, no drops, no Ledger Pages, no Scrapjaw's Cleaver.

## Settled before you start

- **The main combat skill must cross levels 1 to 20 within 2 days of 14,** as the combat pacing check measures it. That puts the band's average at about 1x the reference rate.
- **The rate climbs within the band,** as it does for actions: 0.90x, 0.95x, 1.00x and 1.05x the reference for the four tiers, which already holds the band for Prospecting, Smithing and Tinkering.
- **Kill times rise from tier to tier, and XP is a whole number.** The same timing pattern as the actions is the obvious first choice: 54, 108, 162 and 216 seconds.
- **`seconds_per_kill` is a target,** not a result. The combat-stats work order will set hit points and damage to hit it.
- **Section 7's ledger** shows a check-in "2 Rust Rat kills short of a level". Say whether your numbers make that plausible.
- **Scrapjaw's XP:** propose a value and say what it rests on. A boss attempt is a separate queue item, and a lost fight spends the attempt.

## Clearance

Act I only. Flavour lines may not lean toward anything above Layer 1 in the slice. Scrapjaw's flavour must not mention Ledger Page 1 or what it holds.

## Constraints

- Every number is derived or raised as a question. Show each tier's XP per hour as a multiple of the reference.
- Hand your new ids to the registrar through your report. The provenance check will fail until it adds the rows, which is expected. Every other check must pass before you hand back.

## Hand back

- The file, every new id for the registrar, the combat band days and effective rate, derivations, proposed names, open questions, and the validator output verbatim.
