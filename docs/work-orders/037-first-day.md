# Work order 037: the first day, in three sittings

**Agents:** `scrivener` for the scenes and guide lines; the lead session for the client and guide code; `educator` on every draft, before the inspector; `inspector` for voice, lore and reveal; `assayer` for the walk; `registrar` for the rows
**Status:** open (3 November 2026).
**Blocks:** the next round of playtests. Supersedes the first-session parts of work orders 021, 035 and 036, whose hooks it keeps.

## Why this one

Playtesters who had never played an idle game met about twelve mechanics, ten scenes and six named people in the first half hour, and kept none of it: "I remember seeing or encountering pretty much everything... But I didn't hang onto any of it." The educator's baseline (the Ledger in `docs/first-day-plan.md`, 20 cold reads) found the worst screen asks about twelve new things at once, 20 of 20 readers could not say what the Needles are, 19 of 20 could not say who they are or why No. 9 is theirs, and nobody knew why they were fighting rats before the first fight.

`docs/first-day-plan.md` is the design. Build it.

## Inputs

- `docs/first-day-plan.md` in full: the rules, the three sittings' tables, "What it changes", the decisions, and the Ledger.
- `docs/work-orders/035-prologue-hook.md` and `036-prologue-clarity.md` with their status lines.
- The ten Prologue files, `content/guide/first_session.json`, and for the lead session `engine/packages/client/src/Guide.tsx`, `Story.tsx` and `SignIn.tsx`.
- For the scrivener: `docs/canon/slices/act1.md`, `world.md`, `characters.md`, `style.md`, `qualities.json`, and `reveals.md` truncated at Layer 1.

## Part 1: the scenes and lines (`scrivener`)

Write the first day's ten scenes to the plan's tables (steps 4, 5, 9, 11, 13, 16, 18, 19, 20, 21), each introducing only the one thing in its "New in the story" column.

1. **Who you are** (sitting 1): new. Three options, each certain: Hester's apprentice, a relative named in her will, a stranger. Each sets a new quality for the origin (propose its name and values; add it to `qualities.json` with the toolwright if the validators need it). Name Hester and that she left mid-job; no binding yet.
2. **Rats in the workshop** (sitting 1): new. Danger to you, a reason to fight, and nothing about Rustmoor beyond "the scrapyards below".
3. **The bill** (sitting 2): Pip and 15 Crowns of Hester's rent. Both options certain. No Arrears, no Counting-House explanation (the sale teaches it), no odds.
4. **The receipt** (sitting 2): carries the binding, found by Pip behind a hook. Keep "She was never without that."
5. **The Row** (sitting 2): the neighbours and the missing tins as one scene.
6. **The register** (sitting 3): add one skill-check option to teach odds, keep the put-it-off option, and drop "only a registered Tinker may sell" in favour of Brassbuckle's vouching (decision 4).
7. **The tip book and the nest** (sitting 3): as now, without re-teaching Rustmoor.
8. **The lecture** (sitting 3): cut to what the plate needs. The Great Kettle and the Lift move to Act I; check no Act I scene relies on the lecture having named them.
9. **The brass plate** (sitting 3): the Gazette folds in; the payoff stays.
10. **Gates:** each scene's `requires` adds `record.check_ins` so sitting 1's two scenes open at the first visit, sitting 2's at the second, sitting 3's at the third. Act I's first scene opens at the visit after the brass plate.
11. **Guide lines:** rewrite `content/guide/first_session.json` for sitting 1's steps, and propose the goal lines for sittings 2 and 3, including Brassbuckle's vouching line at the first sale and Rations at step 12.

Keep every flag Act I reads (`flag.owes_back_rent`, `flag.back_rent_reduced`, `flag.asked_brassbuckle_plate`, `flag.kept_brass_plate`, the Favour changes) or list each one you retire and every Act I scene that reads it. Ids may change where scenes merge; list old and new.

## Part 2: the screen (lead session)

From the plan's "Client" list: the guide runs sitting 1 only and sittings 2 and 3 become goal lines; Needles stay hidden until a scene first moves each; Story shows a calm "next time, after HH:MM" line while a sitting is gated; the debt line points only at places already open; armour shows what it protects; the sign-in letter says the city flies. Screenshot each at 1600 by 1067 and phone width.

## Part 3: check (`educator`, then `inspector`)

The educator walks the drafted first day against the plan's "You can now say" column, with cold reads by both personas, two runs each, at the end of each sitting, and compares with the baseline Ledger. The scrivener rewrites from its requests until each line is met or the gap is put to Jeremy. Then the inspector reviews, as for 035 and 036.

## Part 4: measure (`assayer`)

A first-day walk at two, three and four check-ins a day: which scenes open at each sitting, Nerve at each, every register option, and the day Act I opens. Every Act I road must still open.

## Settled before you start

- The plan's rules, tables and decisions 1 to 6.
- Hester's thread from 035 stays: named early, her notebook gutted, the brass plate as the payoff. Her binding now comes in sitting 2.
- Layer 0, with the plate's Layer 1 suspicion only. Hester only through what she left and what others say.
- No change to the economy: the same items, Crowns and Rations change hands as now, or the draftsman and assayer are asked first.

## Not in this work order

Act I's scenes beyond what the moved terms require; new art (list any for `docs/art-requests.md`); the Tinker's looks (decision 2).

## Hand back

Per part: the changed files; old and new ids; the scenes in sitting order with their gates; the educator's can-now-say table against the baseline; the inspector's verdicts; the walk; open questions for Jeremy.
