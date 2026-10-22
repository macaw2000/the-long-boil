# Work order 010: checks for the combat model, monster stats and gear

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** work order 011, Rustmoor's monster and gear stats.

## Why this one now

Work order 009 produced a combat model with a closed-form kill time and a boss win chance. Jeremy has settled its open points. Before the draftsman sets real hit points and damage, code must be able to say whether a monster's stats hit its target kill time, and whether a boss is won about half the time at its level.

## Inputs

Attach only these:

- `content/tuning/combat.json` (revision 2) and `docs/work-orders/009-combat-model.md`, including "Settled after the first draft".
- `content/monsters/rustmoor.json`, `content/items/rustmoor.json` and `content/tuning/xp-curve.json`.
- `docs/gdd.md`, section 6 (Skills, Combat, Treasure and Calibrating).
- Everything under `scripts/validate/`.

## Scope

1. **Schema `tuning.combat/1`,** matching revision 2 of `combat.json`: every constant the kill-time and win-chance formulas read is a machine-readable number, as `tuning.xp_curve/1` requires of the curve. Values may still be null where the model leaves them open (the calibration step).

2. **Schema `monster/2`,** which is `monster/1` plus combat stats, in the model's ×10 units: `hp`, `max_hit`, `attack_interval`, `evasion`, `armour`, and anything else the model's formulas read. Accept `monster/1` alongside it, so the approved Rustmoor monsters stay valid until work order 011 moves them.

3. **Schema `gear/1`,** for files under `content/gear/`. One entry per gear item: `item` (an item id), `slot` (`weapon` or `armour`), `style` (weapons only), `level_required`, and exactly 21 calibration rows, +0 to +20, of the model's gear stats. Rows above +0 may be null while the calibration step is open.

4. **Combat check**, reading every constant from `combat.json`:
   - For each non-boss monster on `monster/2`: build the model's player at the monster's level (main style at that level, the other six skills at the curve's secondary level), with the best +0 gear of the matching style whose `level_required` is at or below that level, and Rations stocked. Compute the model's kill time. It must be within a tolerance of `seconds_per_kill`. Leave the tolerance as a named constant and raise it as a question.
   - For each boss: the model's win chance for that player must be within a tolerance of the model's target (0.5). Same treatment for the tolerance.
   - Report, as NOTE lines, each monster's kill time unmatched and without Rations.
   - Fail if a monster has no gear of its weakness's style available at its level, since its target cannot be reached.

5. **Fixtures**: one pass and one fail for each new schema and rule.

## Constraints

- Keep `python3 scripts/validate/run.py` as the single command.
- The real tree has no `monster/2` monsters or gear yet, so the combat check reports nothing to check, and `combat.json` must pass `tuning.combat/1`.
- Do not change `content/`. If `combat.json` cannot be made to fit a clean schema, say what would have to change.

## Hand back

- Schema and check changes, with paths; fixtures added; the output of `python3 scripts/validate/run.py`; open questions; what is still unchecked.

## Then

Work order 011: the draftsman moves the Rustmoor monsters to `monster/2` and adds the Rustmoor gear.
