# Work order 015: checks for storylets and letters

**Agent:** `toolwright`
**Status:** ready to run
**Blocks:** work order 016, the first five Act I storylets and Pip's first letter, which are the last content the 48-hour test needs.

## Why this one now

GDD section 10's 48-hour test needs "five storylets with Nerve". No storylet exists, and no check can say whether one is well formed, reads only real qualities, is reachable, or leaks a later reveal. Your own list of checks names the story graph, the reveal guard and house style; none is built yet.

## Inputs

Attach only these:

- `docs/gdd.md`, section 5 (Qualities, Storylets, Nerve, The Pneumatic Post, The Four Needles) and section 6 (Skills).
- `docs/canon/qualities.json`, the quality registry.
- `docs/canon/style.md`, for word limits and the banned list.
- Everything under `scripts/validate/`.

Do not read `docs/canon/reveals.md` or `docs/canon/locked.md`. The reveal guard needs only the mapping below.

## Scope

1. **Schema `storylet/1`,** for files under `content/storylets/`, following the example in GDD section 5: `id` in `act.location.name` form, `act` (0 for the Prologue, then 1 to 3), `location`, `reveal_layer` (0 to 3), `requires`, `nerve` (1 to 3), `description`, and 2 to 4 `options`. Each option has a `label`, an optional `requires`, and either a certain outcome or a `challenge` (`quality`, `difficulty`) with `success` and `failure` outcomes. Each outcome has `text` and its quality changes.
2. **Schema `letter/1`,** for files under `content/letters/`: a letter is a short storylet (one or two options) with a `sender` and a deck weight.
3. **Quality check:** every quality a storylet or letter reads or changes exists in `qualities.json`, or is an item id that exists under `content/items/`. Fail on any other name.
4. **Story graph check:** every quality a storylet requires is set by something (another storylet's outcome, a letter, or a quality the registry marks as set by the game, such as skills); every storylet is reachable from a fresh Tinker; no option leads nowhere.
5. **Reveal guard:** Layer 1 belongs to Act I, Layer 2 to Act II and Layer 3 to Act III; a storylet's `reveal_layer` may not exceed its `act`. Layers 4 and 5 are never allowed. Fail on any breach.
6. **House style:** description at most 120 words, each option label at most 25, each outcome text at most 150; the banned words and phrases from `style.md`; no "the player".
7. **Fixtures**: one pass and one fail for each new schema and rule.

## Constraints

- Keep `python3 scripts/validate/run.py` as the single command. The real tree has no storylets yet, so the new checks report nothing to check.
- Where `qualities.json` does not say how a quality is set, raise it as an open question rather than guessing.

## Hand back

- Schema and check changes, with paths; fixtures added; the output of `python3 scripts/validate/run.py`; open questions; what is still unchecked.

## Then

Work order 016: the scrivener drafts the first five Act I storylets and Pip's first letter against these checks.
