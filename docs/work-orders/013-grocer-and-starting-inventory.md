# Work order 013: the grocer's prices and starting inventory, as data

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** counting Rustmoor's first Crown sink, and putting the first session's starter stock anywhere the engine can read it.

## Why this one now

Work order 012 created Rustmoor's first Crown sink, the grocer's counter, but its prices live in free-text notes because no schema field holds an NPC sell price. So the drops check still reports "no sinks exist yet". The first session's starting inventory (50 Brass Ingots, 342 Rations, any starting Crowns) has no file at all.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (The Brass Exchange, Guilds, The Crown budget) and section 7 (the first session).
- `docs/work-orders/012-rustmoor-cooking.md`, its "Settled after review" section.
- `content/tuning/economy-rustmoor.json`, `content/items/rustmoor.json`, `content/tuning/combat.json` and `content/tuning/xp-curve.json`.
- Everything under `scripts/validate/`.

## Scope

1. **Schema `tuning.economy/2`:** `tuning.economy/1` plus, per item, an optional `grocer_price` (Crowns per unit, an integer of at least 1, or null). Keep accepting `/1` until the draftsman migrates the Rustmoor file.
2. **Schema `start/1`,** for one file, `content/start.json`, with a file-level id `start.global.inventory`: a list of `{ "item", "qty", "bound" }` and a `crowns` integer. Every item must exist. Ledger Pages may not appear.
3. **Grocer rules:** an item with a `grocer_price` must not also have a `collector_price` greater than or equal to it, so nobody can buy from the grocer and sell to a collector at a profit. Fail on any breach.
4. **Crown sink report** (NOTE lines, in the drops check's Crown report): for each zone, the Crowns per week a player removes buying from the grocer, given the Ration use the combat model gives at each band tier and Cooking levelled at the pacing rate. Report it next to the faucet, with the ratio. The 90% rule stays reported, not enforced, until Calibrating exists; say so.
5. **Fixtures:** one pass and one fail for each new schema and rule.

## Constraints

- Keep `python3 scripts/validate/run.py` as the single command.
- Do not edit `content/`. The draftsman migrates the economy file and writes `content/start.json` after you hand back.
- Raise any assumption the sink report needs (which Ration recipe a player uses, whether surplus Rations count) as an open question rather than choosing silently.

## Hand back

- Schema and check changes, with paths; fixtures added; the output of `python3 scripts/validate/run.py`; open questions; what is still unchecked.

## Then

The draftsman moves `economy-rustmoor.json` to `tuning.economy/2` with the grocer prices, and writes `content/start.json`.
