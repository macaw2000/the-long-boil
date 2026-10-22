# Work order 007: checks for drops and the Crown faucet

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** work order 008, Rustmoor's drops and prices.

## Why this one now

Rustmoor has actions, items and monsters, but nothing drops and nothing has a price. The GDD fixes several drop rules that code can hold: Ledger Pages are bound, each zone has 4 rare page drops with a pity timer of 500 kills, the boss's first kill gives a page, and Cogs never buy Ledger Pages. The Crown budget needs a faucet figure before any sink can be judged against it.

## Inputs

Attach only these:

- `docs/gdd.md`, section 5 (Ledger Pages and the Commonplace Book, Story rewards and the economy), section 6 (Combat, Treasure and Calibrating, The Brass Exchange, The Crown budget) and section 8.
- `content/monsters/rustmoor.json`, `content/items/rustmoor.json` and `content/tuning/xp-curve.json`, for shapes and ids.
- Everything under `scripts/validate/`.

## Scope

1. **Schema `drops/1`**, for files under `content/drops/`. A file holds a list of drop tables, one per monster:
   - `monster`: a monster id;
   - `crowns`: `{ "min": <int ≥ 0>, "max": <int ≥ min> }` per kill;
   - `entries`: a list of `{ "item", "chance" (0 < chance ≤ 1), "qty_min", "qty_max" }`, rolled independently per kill;
   - `first_kill`: a list of item ids given once, on the player's first kill (bosses only);
   - `pity`: a list of `{ "item", "kills" }`, guaranteeing that item within that many kills.

2. **Schema `tuning.economy/1`**, for one file per zone under `content/tuning/` (for example `economy-rustmoor.json`). It holds, per item id:
   - `bound`: a boolean. A bound item cannot be traded or sold.
   - `collector_price`: Crowns an NPC collector pays per unit, or null if collectors will not buy it;
   - `collector_weekly_cap`: units a collector buys per player per week, or null. Both are null together or set together.

   It also holds an `anchors` object for the draftsman's stated assumptions, free in shape, which the check does not read.

3. **Reference check, extended.** Every monster and item a drop table names must exist. Every item in an economy file must exist.

4. **Ledger Page rules,** for any item whose id contains `ledger_page`:
   - it is `bound` in the zone's economy file and has no collector price;
   - each zone has exactly 4 Ledger Pages that drop from non-boss monsters, each with a `pity` entry of at most 500 kills;
   - each zone's boss gives exactly one Ledger Page in `first_kill`;
   - Fail on any breach, naming the zone and the item.

5. **Crown faucet report** (NOTE lines, no thresholds). For each zone band:
   - Crowns per hour from the best non-boss monster at each level (the same monster the combat pacing check picks), using the mean of `min` and `max`;
   - Crowns per week from that at the curve file's combat hours a day (12 × 0.70 of combat queue time is the main-skill share; use the full 12 combat hours for Crowns, since every kill drops Crowns);
   - the most a player can earn from collectors per week: the sum over items of `collector_price × collector_weekly_cap`.

   Report these as figures. The 90% sink rule cannot be checked until sinks exist.

6. **Fixtures**: one pass and one fail for each new schema and rule.

## Constraints

- Keep `python3 scripts/validate/run.py` as the single command.
- Do not change `item/1`, `action/1` or `monster/1`. Bound status and prices live in the economy file so that approved items stay as they are.
- The real tree has no drops or economy file yet, so it must still pass, with the new checks reporting nothing to check.

## Hand back

- Schema and check changes, with paths; fixtures added; the output of `python3 scripts/validate/run.py`; open questions; what is still unchecked.

## Settled after the first build

Jeremy set these on 21 October 2026:

- **The pity timer counts any kill in the zone,** not kills of one monster. Pity moves to a file-level `zone_pity` list. Recorded in GDD section 5.
- Drop and economy files carry a file-level id, so the register tracks them.
- A Ledger Page may not drop from a boss's `entries`, from two tables, or in two zones. Ledger Page rules skip the `global` zone.
- Boss Crowns are reported separately in the faucet report.

## Then

Work order 008: the draftsman drafts Rustmoor's drops, its new items and its economy file.
