# Work order 036: a Prologue a stranger can follow

**Agents:** `scrivener` for the rewrites; the lead session for the client change in Part 2; `inspector` for voice and reveal; `assayer` for the walk and the cold read; `registrar` for the rows
**Status:** drafted, reviewed and measured (3 November 2026). Nine scenes and three guide lines reworked; the receipt is unchanged. The twins and the woman from No. 7 are gone; the binding is found behind the last tool hook. Brassbuckle introduces herself in the guide's first line and in the register; Pip in the guide and the bill's signature. The bill is laid out as a letter and glosses the Post, the Counting-House and Crowns; the lecture and Gazette gloss the Scald, the Great Kettle, the Lift, the Board and the Gauge Reading. The register has a third option, to read the rules before signing, which still reaches 30. Part 2 shipped: game words in story text and outcomes open the glossary (`88059e2`). The walk plays all ten scenes on one Nerve bar with each register option. The cold read places every named character correctly and no longer lists Crowns, the Counting-House, the Scald or the Seven Gauges as confusing. The inspector failed the guide's `pips_bill` (glossing order) and the register (an unkept promise; a lecture-like introduction); all fixes and notes applied, not yet re-reviewed. "Arrears counts your debts" was replaced, and the guide no longer says "your Tinker". Open for Jeremy: the lecture's option 2, where Brassbuckle sidesteps how far the Scald has climbed (a second subject change; the inspector offers wording); whether the pie shop should become a character; the receipt's `favour.stokers` before the Stokers are introduced.
**Blocks:** nothing in the build plan. Follows work order 035, which it must not undo.

## Why this one

A second playtester, 3 November 2026, played the Prologue before work order 035 shipped. His notes, in his words:

- "The story is too much too quick, characters and terminology are thrown out left and right with not enough context and it is not clear what is important (ex. the Row appeared but I have no idea who they are or why the 3 other characters I was described as seeing (twins and a woman from No. 7) matter to the scene)."
- "There is no introduction to Professor Brassbuckle at all, she just appears and suddenly I'm signing something, both options have me sign it but one has me sign in 'my best hand' whatever that means. It doesn't make sense that I cannot refuse to sign nor why I am here at all."
- On Pip's bill: "are Crowns currency? what does it mean to spike the bill, what is the Counting-House, the letter quoted would be better if it was spaced like a letter is formatted. Also what does 'write back offering' mean."

The first playtester (work order 035) wanted one question to chase. This one needs fewer things competing with it. They agree: **one mystery, few names, each introduced.** Work order 035 added Hester and her binding, which makes the cast problem a little worse unless something else goes.

## Who writes it

As in 035: the Prologue is Jeremy's (GDD section 9). The scrivener drafts proposals in the existing files, and Jeremy rewrites or approves them.

## Inputs

Attach only these:

- This work order and `docs/work-orders/035-prologue-hook.md` with its status line.
- All ten Prologue files: `content/letters/prologue.sprocket_row.back_rent.json` and `content/storylets/prologue.*.json`, as they stand after 035.
- `content/guide/first_session.json`.
- `engine/packages/client/src/glossary.ts` (read only: the game words the client already defines).
- `docs/gdd.md` section 7's "The first session"; `docs/canon/slices/act1.md`, `world.md`, `characters.md`, `style.md`, `qualities.json`, and `reveals.md` truncated at Layer 1.
- `docs/work-orders/024-act1-spine-by-jeremy.md` for the Prologue's slots and Nerve rule.

## Part 1: the rewrites (`scrivener`)

1. **A cast budget.** No scene introduces more than one new named person or group. By the end of the Prologue the player has met, by name and role, only: Brassbuckle, Pip, Hester (through what she left), and the Row as "your neighbours on Sprocket Row". Anyone else (the twins, the woman from No. 7, the tip-keeper) is either cut, left unnamed and doing something that matters to the scene, or justified in the hand-back.
2. **Introduce Brassbuckle** at her first appearance in a scene, in one clause: who she is (a Polytechnic professor, Hester's oldest colleague) and why she is at No. 9 (she has the keys, and is seeing the workshop handed over). The guide shows her portrait first, so its opening line may carry the introduction instead. Propose which.
3. **Introduce Pip** the same way, in the bill: Pip Tumbler runs the Pneumatic Post's bills for the Counting-House.
4. **Gloss every game word on first use, in the prose,** without a lecture. Crowns are money; the Counting-House is where the city's bills are paid and where you sell; the Pneumatic Post is the brass tube that brings letters. A word the player meets before its gloss is a fail.
5. **Lay the bill out as a letter.** The canister arrives in prose; the bill and Pip's note below it are set off on their own lines with `\n`: a heading line, the sum, then Pip's note signed on its own line. Keep it inside the description and option limits `check_style.py` enforces. Say if a limit stops it.
6. **Plain option labels.** Every option says what the player does in everyday words. "Write back offering to work some of it off at the bench" becomes something like "Offer Pip some repair work instead of part of the rent." "Your best hand" goes.
7. **The register needs a reason and a way out.** Say why signing matters: No. 9 is a registered workshop, and only a registered Tinker may sell their work at the Counting-House. Add a third option to refuse or put it off. It must still move `prologue.progress` from 20 to 30, so nothing locks; it may cost something small (a Favour point, or Brassbuckle's look), and the scene's text should make clear the player can come back to it. If a third option breaks the Nerve rule or a validator, say so.
8. **Keep 035's hook.** Hester is named in the bill; her binding reaches the player's hands by scene two; the brass plate pays it off. If the cast budget forces a cut, cut the twins and the woman from No. 7 before anything of Hester's. The binding may be found some other way than through No. 7's chisel.

## Part 2: game words in the Story tab (lead session)

Story text is plain text today: the glossary popups (`Term.tsx`) work only on the top bar. Make the first appearance of each glossary word in a scene's description a popup term, as the top bar's are, and add entries for `counting_house` and `pneumatic_post` to `glossary.ts`. Check the result by screenshot at 1600 by 1067 and at phone width. This part ships even if Part 1 is still with Jeremy.

## Settled before you start

- Everything settled in work order 035: ten scenes, 1 Nerve each, one Nerve bar, every id, `requires` and `changes` kept, the brass plate the scene that reaches 100, Hester only through what she left and what others say, Layer 0 with the plate's Layer 1 suspicion.
- A new option may add `changes` only from qualities that already exist in `docs/canon/qualities.json`.
- The bill keeps its 3 November label idea (the spike above the vice) unless item 6 replaces it with something plainer.

## Part 3: review (`inspector`)

As in 035, plus: the cast budget per scene, with each named person counted; every game word glossed before use; whether the register's refusal reads as a real choice, not a punished one.

## Part 4: measure (`assayer`)

1. **The walk,** as in 035: all ten scenes in order in the first session on one Nerve bar, and every Act I road still opens.
2. **The cold read,** as in 035 (`claude -p` on Jeremy's plan, an empty directory, first 3, 6 and 10 scenes, today against the draft), with the questions widened: (1) who is missing; (2) list every character you met and say who each one is; (3) what are Crowns and the Counting-House; (4) which character or term confused you; (5) what do you want to find out, and what would you do next. Targets: Hester and the notebook named after three scenes, as before; every named character placed correctly; nothing listed under (4) that the scene meant to explain.

## Not in this work order

Act I's scenes; the landing page; the "times" a playtester could not read (waiting on which screen he meant); the Smithing art and the spanner's frames (fixed 3 November 2026).

## Constraints

- Prose follows `docs/canon/style.md`.
- Run `python3 scripts/validate/run.py` and hand back only when it passes, apart from provenance rows.

## Hand back

The changed files; per scene, old and new description side by side, with options where changed; the cast list per scene, before and after; each game word and where it is first glossed; the proposed guide change, if any; open questions for Jeremy.
