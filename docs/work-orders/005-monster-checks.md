# Work order 005: checks for monsters and combat pacing

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** work order 006, the Rustmoor monsters.

## Why this one now

Combat is the missing half of a zone's pacing. A zone's level band counts the main combat skill (GDD section 6), and that skill earns XP only from monsters. Work order 003 refused combat skills in action files for that reason. Before the draftsman drafts monsters, code must be able to say whether they land Rustmoor's main combat skill near two weeks.

## Inputs

Attach only these:

- `content/tuning/xp-curve.json`, for the table, the reference action, the assumptions and the band rate targets.
- `docs/gdd.md`, section 6 (Skills, Combat).
- Everything under `scripts/validate/`.

## Scope

1. **Schema `monster/1`**, for files under `content/monsters/`. A file holds a list of monsters. Each monster has:
   - `id` in `monster.<zone>.<name>` form, using the same zone list as items and actions;
   - `name`, and one line of `flavour` of at most 20 words;
   - `level`, an integer from 1 to 100: the main combat level at which the monster becomes the player's sensible target;
   - `boss`, a boolean;
   - `weakness`, one of `melee`, `marksmanship` or `aetherics` (GDD section 6: "Monsters are weak to Melee, Marksmanship, or Aetherics");
   - `xp`, a positive number: total combat XP for one kill, before the main-skill split;
   - `seconds_per_kill`, a positive number: the **target** time for one kill by a player at `level`, including the time between kills. It is a design target that the later combat-stats work order must hit, not a result of stats.

   No hit points, damage or drops yet. Those come with the combat model and the drops work order.

2. **Combat pacing check**, added to the pacing check you built in work order 003:
   - The main combat skill's best target at each level is the non-boss monster with the highest XP per hour (`xp × 3600 / seconds_per_kill`) among those with `level` at or below that level. Bosses are fought on purpose (section 6), so they never count.
   - Band days, the tolerance, the band selection rule and the rate report work exactly as for actions. The main skill's share and its daily hours come from the curve file's assumptions, as they do now.
   - Report the result as the main combat skill, alongside the per-skill action results.

3. **Fixtures**: one pass and one fail for the new schema and for combat pacing.

## Constraints

- Keep `python3 scripts/validate/run.py` as the single command.
- Keep the refusal of combat skills in `action/1`. Combat XP comes from monsters, not actions.
- The real tree has no monsters yet, so it must still pass, with combat pacing reporting nothing to check.

## Hand back

- Schema and check changes, with paths; fixtures added; the output of `python3 scripts/validate/run.py`; open questions; what is still unchecked.

## Then

Work order 006: the draftsman drafts the Rustmoor monsters against this schema.
