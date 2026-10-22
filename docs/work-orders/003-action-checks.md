# Work order 003: checks for actions and items

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** work order 004, the Rustmoor action table. The draftsman drafts against these schemas, and no waiver is given this time.

## Why this one now

Work order 001 fixed each zone band's average XP rate: 1x, 3.38x and 7.98x the Brass Ingot reference. Work order 004 drafts the first real actions. Before it does, code must be able to say whether a set of actions actually lands a band near two weeks, so the draft can be judged by a check, not by hand.

## Inputs

Attach only these:

- `content/tuning/xp-curve.json`, for the table, the reference action and the band rate targets.
- `docs/work-orders/001-xp-curve.md`, especially "Carried forward to the action-table work order".
- `docs/gdd.md`, section 6 (Skills, Offline play) and section 7 (The first session).
- Everything under `scripts/validate/`, which you built in work order 002.

## Scope

1. **Schema `item/1`**, for files under `content/items/`. A file holds a list of items. Each item has an `id` in `item.<zone>.<name>` form, a `name`, and one line of flavour text of at most 20 words. Nothing else is required yet; stats, prices and calibration come in later work orders.

2. **Schema `action/1`**, for files under `content/actions/`. A file holds a list of actions. Each action has:
   - `id` in `action.<zone>.<name>` form;
   - `skill`, one of the sixteen skill names in GDD section 6, lowercase with underscores;
   - `level_required`, an integer from 1 to 100;
   - `seconds`, a positive number: how long one action takes;
   - `xp`, a positive number: XP for one action;
   - `inputs` and `outputs`, each a list of `{ "item": <item id>, "qty": <positive integer> }`, either of which may be empty.

3. **Reference check, extended.** Every `item` id an action names must exist under `content/items/`. Fail on any that does not.

4. **Band pacing check**, for each skill that has actions:
   - At each level, a player uses the action with the highest XP per hour among those unlocked at that level.
   - The time to cross a band is the sum, over the band's levels, of that level's `cost_to_next` divided by that action's XP per hour.
   - Convert hours to days at the main combat skill rate the curve file uses: 12 band-skill hours a day at a 0.70 share. Read those numbers from the curve file's `assumptions`; do not copy them into the check.
   - A band passes when its days are within `BAND_DAYS_TOLERANCE` (2) of 14. Only check a band when the skill has an action unlocked at the band's first level and actions cover it to its end. Report a band with no actions as a NOTE, not a failure.
   - Also report each band's effective rate as a multiple of the reference, so it can be read against 1x, 3.38x and 7.98x.

5. **Fixtures**: one pass and one fail for each new check, as before.

Combat is out of scope. Combat XP comes from monsters, and they come in a later work order.

## Constraints

- Follow your own rules, and keep `python3 scripts/validate/run.py` as the single command.
- Register rows for actions and items must still pass the provenance check. Do not change the register's schema.
- There is no real action or item content yet, so the real tree should still pass with the new checks reporting nothing to check.

## Hand back

- Checks and schemas added, with paths.
- Fixtures added.
- The output of `python3 scripts/validate/run.py`.
- Open questions, especially any place where "the best action at each level" is ambiguous, such as an action whose inputs the player cannot make yet.
- What is still unchecked.

## Then

Work order 004: the draftsman drafts the Rustmoor action table against these schemas.
