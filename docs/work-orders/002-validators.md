# Work order 002: build the first validators

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** moving anything past `drafted`. Work order 001's curve cannot reach `validated` until these checks exist and pass.

## Why this one now

Work order 001 waived the validator step because `scripts/validate/` did not exist. That waiver applied to 001 only. Every later work order needs a real validator run, so the checks come before any more content.

The registrar also found that the register cannot describe the XP curve properly. Those fixes belong here, because the provenance check is what enforces the register's shape.

## Inputs

Attach only these:

- `content/tuning/xp-curve.json`, the only content file so far.
- `content/provenance.json`, the register.
- `.claude/agents/registrar.md`, for the current row format and status ladder.
- `docs/work-orders/001-xp-curve.md`, for what the curve file is meant to hold.
- `docs/gdd.md`, section 6, for the zone level bands.

No canon slice. This work order writes no content and touches no story.

## Scope

Build these under `scripts/validate/`, runnable as one command. Use Python 3.9 and the standard library only, so nothing needs installing.

1. **Schema check** (your check 1, for the content that exists today).
   - Every file under `content/` parses as JSON.
   - Every content file declares a `schema` string, and a schema exists for it.
   - Every `id` is unique across the whole content tree, including ids nested inside a file, such as `reference_action.id` in the curve.
   - Write the schema `tuning.xp_curve/1`. It matches the current file's shape with two changes:
     - The file no longer carries `status` or `validators`. The register owns both, and copies drift.
     - `formula` must state its constants as machine-readable numbers (base, ratio, where the opening ends and its power), not only as a string. The curve check needs to recompute the table from them.

2. **Provenance check** (your check 2), against a new register schema, `provenance/2`. It keeps every `provenance/1` field and adds these, each nullable:
   - `revision`: an integer, the content revision the row describes.
   - `work_order`: the path of the work order that produced the item.
   - `pointer`: a JSON Pointer into the file at `path`, for an item that is one part of a file (for example `/reference_action`). Null means the whole file.
   - `validators.waiver`: `{ "by": <work order path>, "reason": <string> }`.

   The check fails when:
   - `validators.result` is not one of `pass`, `fail`, `waived` or null.
   - `waived` appears without a `waiver`, or a `waiver` appears without `waived`.
   - A row's file does not exist, or its `pointer` does not resolve inside that file.
   - A content id has no row, or more than one row.
   - Two rows share a `path` and both have a null `pointer`.

3. **XP curve check.** For every `tuning.xp_curve` file:
   - The table runs from level 1 to level 100 with no gaps, and level 1 has `total_xp` 0.
   - `total_xp` rises strictly, and each row's `total_xp` plus `cost_to_next` equals the next row's `total_xp`.
   - `cost_to_next` never falls from one level to the next.
   - Recomputing the table from `formula`'s constants reproduces it exactly.
   - The stated `band_checkpoints` match what the table and `band_xp_rate_targets` give, within rounding.
   - Each band's elapsed days fall within a tolerance of 14. Leave the tolerance as a named, unset constant and raise it as an open question. Work order 001 states one hard floor, which you may encode: level 70 reachable in nine days or fewer is a failure.

4. **CI.** A GitHub Actions workflow that runs the same single command on every push and pull request.

Checks 3 to 7 in your own list (stat budget, story graph, reveal guard, reward caps, house style) are out of scope. There is no content for them yet.

## Constraints

- Follow your own rules on fixtures: each check gets one committed fixture that fails and one that passes.
- **Expect the real content to fail, and report it.** `content/tuning/xp-curve.json` is still on schema `/0` and carries `status`. The register is still `provenance/1` and lacks the new fields. Do not edit either; the draftsman and the registrar fix them after you hand back.
- The validators may still accept `provenance/1` with a warning while the registrar migrates. Do not accept `tuning.xp_curve/0`.
- Do not change the registrar's agent file. Propose the wording for its row format in your report, and Jeremy will apply it.

## Hand back

- Checks added, with paths and what each catches.
- The one command to run them all, and its output against the real content today.
- Fixtures added.
- The two schemas, `tuning.xp_curve/1` and `provenance/2`, with their file paths.
- Proposed wording for the row format in `.claude/agents/registrar.md`.
- Thresholds you could not source, as open questions. The band tolerance is one.
- What remains unchecked and rests on human review.

## Then

1. The draftsman moves `xp-curve.json` to `tuning.xp_curve/1`: it drops `status` and `validators`, and adds machine-readable formula constants. The numbers do not change.
2. The registrar moves the register to `provenance/2` and fills `revision`, `work_order`, `pointer` and the 001 waiver on both rows.
3. The validators run. If they pass, the registrar moves both rows to `validated`. The 001 waiver is then history, not a status.
