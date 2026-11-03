# Work order 035: Hester in the first ten minutes

**Agents:** `scrivener` for the rewrites; `inspector` for voice and reveal; `assayer` for the walk and the cold read; `registrar` for the rows
**Status:** drafted, reviewed and measured (3 November 2026). Six scenes reworked (bill, neighbours, register, tip book, receipt, brass plate) and the guide's `brass_plate` line; the other four are unchanged. Hester is named in the bill and her empty notebook binding is found at the bench in scene two. The walk still plays all ten scenes in order on one Nerve bar. The cold read names Hester and her notebook after three scenes; today's Prologue never names her. The inspector failed the register's option 2 outcome and the plate's option 1 label (two evasions where one is allowed); both are fixed at Jeremy's direction, with its polish, and await a re-review. Jeremy kept "long in the arm" and "never used a word where a figure would do". Open for Jeremy: playing it; whether the torn pages prime Act I beat 3's torn charts.
**Blocks:** nothing in the build plan. It should land before the next round of playtesters.

## Why this one

From a playtester, 3 November 2026, after her first session: "The story element doesn't hook me right out of the gate. I'm not invested in/curious about what's going on yet. My initial focus is on how to make everything work, not why I am in this shop." She also said the story only needs to "last long enough for me to learn the world and get invested in my builds", and that she liked making story choices while her first crafts ran.

GDD section 7 sets the bar: after one evening a player should be able to say "I run a workshop in a flying city, it keeps working while I'm away, and there's a missing woman's notebook I'm trying to finish." Today's Prologue misses the last third of that sentence:

- **Hester Vane is never named.** She shows up only as "the last tenant" in the bill, a name under Brassbuckle's thumb in the register, and a question the player can ask Pip in the receipt.
- **The notebook is never mentioned.** The landing page promises "a Tinker who vanished with a notebook full of questions", and the Story tab's Hester's Ledger says "Not a page of it yet. Hester's notebook came apart somewhere in the city." Nothing in play connects the two.
- **The one real mystery comes last.** The brass plate, whose gauge reading disagrees with the Gazette, is scene ten (`prologue.progress` 90). Scenes one to nine are a bill, neighbours, a register, missing tins, a tip book, a rat nest, a receipt, a lecture and a newspaper. They build the world well, but none of them asks a question the player wants answered.
- **The opening scene is a chore.** A bill is a "how do I make this work" scene, and that is where her attention already was.

## Who writes it

GDD section 9 makes the Prologue Jeremy's to write, and work order 024 was his. So the scrivener drafts **proposals** in the existing files: Jeremy rewrites or approves each one before it ships, and the registrar records them as drafted by the scrivener until he does.

## Inputs

Attach only these:

- `docs/gdd.md`, section 7's "The first session" and the one-evening sentence above it; section 4's Act I heading.
- `docs/canon/slices/act1.md`, `docs/canon/world.md`, `docs/canon/characters.md`, `docs/canon/style.md`, `docs/canon/qualities.json`, and `docs/canon/reveals.md` truncated at Layer 1.
- All ten Prologue files: `content/letters/prologue.sprocket_row.back_rent.json` and `content/storylets/prologue.*.json`.
- `content/guide/first_session.json`, and `content/ledger/rustmoor.drop_1.json` as a sample of Hester's hand.
- `docs/work-orders/024-act1-spine-by-jeremy.md` (the Prologue's slots and Nerve rule) and `026-guide-lines-in-character.md`.

## Part 1: the hook (`scrivener`)

The order of play today is bill (0), neighbours (10), register (20), missing tins (30), tip book (40), first nest (50), receipt (60), lift lecture (70), Gazette (80), brass plate (90).

1. **Name Hester within the first two scenes.** Use the bill or the neighbours: the Row knew her, Pip ran her bills. One concrete detail is enough (her lamp burned late, she owed rent, she left mid-job). Do not make her a saint or a ghost.
2. **Put something of hers in the player's hands by scene three,** tied to the bench, because the bench is where a new player's attention is. Proposed: the notebook's empty binding, its pages torn out, found where she worked. This is the moment the Story tab's "Hester's notebook came apart somewhere in the city" points back to. Other objects are welcome if they do the job better. It must ask a question the player wants answered (where did the pages go, why tear them out), and it must not answer it.
3. **Thread her through the middle.** The register's thumbed name, the tip book, the nest and the receipt can each carry one small new fact about Hester, so the player arrives at the brass plate already wanting to know whose hand scratched it. One line per scene, not a rewrite of every scene.
4. **Keep the brass plate as the payoff** at 90 to 100, and keep its two options and flags. It should now read as "this is hers, and it is the first thing she was right about", without saying what she was right about.
5. **Rewrite the bill's opening if you need room** for item 1, but keep it a bill: GDD section 7 and the Arrears tip depend on it.
6. **Say what changes in the guide,** if anything: for example, one in-character line pointing at Hester's Ledger once the binding is found. Propose it; do not apply it.

## Settled before you start

- **Still ten scenes,** each costing 1 Nerve, all in the first session on one Nerve bar (work order 024). Rework existing scenes rather than adding scenes; if a scene has to go to make room, propose which one and why.
- **Every existing id, `requires` and `changes` stays,** including `flag.owes_back_rent`, `flag.back_rent_reduced`, `flag.asked_brassbuckle_plate`, `flag.kept_brass_plate` and every `prologue.progress` step, because Act I reads them. A new flag is fine if a later scene could use it; list it.
- **The brass plate stays the scene that reaches 100,** and Act I's first scene still waits for `record.check_ins` of 2 or more.
- **Hester appears only through what she left behind** and what other people say about her (act I slice: "Hester only through Ledger Pages"). She does not speak, and no one has seen her since she left.
- **Clearance is Layer 0, with Layer 1 suspicion only where the plate already has it.** Nothing about why she vanished, where she went, or what the pages say. Act I beat 2 ("R.S. The Rats have it") and Ledger Page 1's two columns are not to be pre-empted. Per `reveals.md`, a character who is suspiciously careful not to answer counts as a leak; Brassbuckle may change the subject once, at the plate, as she does now.
- The bill keeps its new label from 3 November 2026 ("Stick the bill on the spike above the vice…"), which replaced "Spike the bill" after the same playtest.

## Part 2: review (`inspector`)

Voice and style against `style.md`; reveal timing against Layer 1; whether Hester reads as a person rather than a plot device; whether any line leaks Act I's beats 2, 3, 4 or 7.

## Part 3: measure (`assayer`)

1. **The walk:** `scripts/sim/walk-act1.mjs` still plays all ten Prologue scenes in order in the first session on one Nerve bar, and every Act I road still opens. Report it verbatim.
2. **The cold read:** give a fresh agent, with no canon and no GDD, only the text of the first three scenes in play order, then the first six, then all ten, and ask it three questions each time: who is missing; what do you want to find out; what would you do next in the game to find it. Report the answers verbatim beside the same test run on today's Prologue. The target is that the three-scene answers name Hester and her notebook.

## Not in this work order

Act I's scenes; new Ledger Pages; the landing page and sign-in copy (changed 3 November 2026); new art (if the binding wants an icon or vignette, list it for `docs/art-requests.md`); engine or client changes.

## Constraints

- Prose follows `docs/canon/style.md` and the description and option length limits `check_style.py` enforces.
- Run `python3 scripts/validate/run.py` and hand back only when it passes.

## Hand back

The changed files; for each scene, the old and new description side by side, with options only where they changed; any new flag and who could read it; the guide proposal; the inspector's verdicts; the walk and the cold read verbatim; and open questions for Jeremy, including whether he wants to write any scene himself rather than edit the draft.
