# Work order 023: Act I repeatable scenes for the long middle

**Agent:** `scrivener`, with numbers reviewed by the `draftsman`, then the `assayer` re-walks the act
**Status:** done (28 October 2026). Eight repeatable scenes, two inspector rounds, all reviewed; approval waits on Jeremy playing the build. Jeremy decided the same day that the walk counts an item gained as worth playing (`scripts/sim/walk-act1.mjs`), that coal_count, vent_slate and public_urn take a 24-hour cooldown, and canonised the scenes' invented details (`docs/canon/world.md`, District detail; one line in `slices/act1.md`). The draftsman set the five item-giving scenes to 24 hours and the other three to 12, and priced Favour at the settled 14 coal or 20 Rations. Story actions a day over days 3 to 15: 7.46, 7.85 and 7.46 at 2, 3 and 4 check-ins (1.2 to 1.5 before); every walk reaches the Foundry Pass; Scald peaks at 4, Notice at 2. Still open: Arrears cannot yet be paid in Crowns (GDD section 5's sink), and closing_bell's slip run takes Arrears -2 on a win.
**Act:** Act I. **Locations:** Sprocket Row, Rustmoor, the Lowvents, the Polytechnic, the Brass Exchange. **Clearance:** Layer 1.
**Blocks:** story pace, and with it the phase 1 gate "Act I playable end to end" (GDD section 11).

## Why this one now

The Act I assay of 24 October 2026 (on build 83561f5) walked the act through the server and found it plays from a new Tinker to the Foundry Pass, but starves in the middle:

- Two long gaps with no spine scene: about days 3 to 9 (waiting on Scavenging 9) and 9 to 15 (grinding for Scrapjaw).
- About 1.5 story actions a day at 3 check-ins, and at most 5.8 even spending every spare Nerve on district scenes; about 9.5 of 10 Nerve sits unspent at a sitting.
- The 10 district scenes (work order 019) have 24-hour cooldowns and mostly are not worth their Nerve under the sim's rules.

Jeremy set the target the same day: **6 to 8 story actions a day** for a player who checks in 3 times, through days 3 to 15. GDD section 9 gives "repeatable progress scenes inside each act" and "district texture storylets" to agents, so this is the scrivener's. The Prologue, Act I's close with the Ambition choice, the Ambition openers and the Ledger Page texts are Jeremy's (work order 024).

## Inputs

Attach only these:

- `docs/canon/slices/act1.md`, with `world.md`, `characters.md`, `style.md` and `qualities.json`.
- `docs/gdd.md`, section 5 (Storylets, Nerve, The Four Needles) and section 7 (a normal check-in, the first week).
- All Act I and Prologue story files under `content/storylets/` and `content/letters/`, read only, for voice, flags, progress values and what the district scenes already cover.
- `content/items/rustmoor.json` and `content/tuning/economy-rustmoor.json`, for real item ids and which items a collector or grocer prices.
- The schemas `storylet/1` and `letter/1`.
- The sim `scripts/sim/walk-act1.mjs`, read only, for the player policy that decides whether a scene is "worth playing".

## Scope

1. **Exactly 8 repeatable storylets** in `content/storylets/`, ids `act1.<location>.<name>`, spread so each of the five Act I locations has at least one.
   - **Open in the long middle.** Each requires an `act1.progress` floor; together they cover the days 3 to 15 gap: at least four open by the progress the act reaches on day 3 (`bottom_rim`'s), the rest by `rook_at_the_tip`'s. Skill gates, if any, sit in the zone's band.
   - **Repeatable, as in work order 019:** none sets the progress that opens it, none moves `act1.progress` or `prologue.progress`, and each reads well the second and fifth time.
   - **Worth playing.** Every option leaves the player better off on balance or trades fairly, so the sim's policy plays it: small Needle relief, `lore.*` (canon range 0 to 24), small Favour, or a modest item the economy can carry. Prefer cooldowns of 8 to 12 hours (the engine's `cooldown_hours`) over 24, so a scene can be played twice on a 3-check-in day.
   - **Each has 2 to 4 options;** at least half carry a skill challenge. **Nerve 1 each.**
2. **Up to 4 changes to the existing district scenes,** where one small number (a cost, a cooldown, a Favour cap) is why the sim skips it. List each change with its reason; do not rewrite their prose.

## Settled before you start

- **Repeatable rewards must not become a faucet,** as in work order 019: no outcome gives an item a collector buys, and none gives Crowns. Favour at most `+1` per outcome, and district and repeatable scenes together raise a faction's Favour to 2 at most.
- **Item costs and rewards are placeholders** for the draftsman.
- **A storylet never sets a skill or a `record.*` quality.**
- **No Ambition content and no `ambition.*` qualities:** the Ambitions start at Act I's close, which is Jeremy's.
- **Challenge odds** use the GDD formula on skills only, with difficulties that suit the scene's gate.

## Open, for Jeremy, before these ship

- **What `lore.*` is for.** Canon gives it a range (0 to 24) but no use yet. Propose a meaning (for example, what a player has learned of Rustmoor's people, read later by the Commonplace Book) or avoid it.
- **New flags or qualities,** if any scene needs to remember something. Prefer none.

## Acceptance

- The validators pass, apart from provenance until the registrar adds the ids.
- **The assayer re-runs `scripts/sim/walk-act1.mjs` at 2, 3 and 4 check-ins a day** and reports story actions a day over days 3 to 15. At 3 check-ins it must be 6 to 8; if not, the draftsman proposes the smallest number changes that get there.

## Constraints

- Follow your own rules: voice, word limits, the banned list, terrible things offstage, invented details marked and surfaced.
- Clearance: Layer 1 only. No Haze, Whistle, Hearth, Steeped, capsules, or knock words. Hester appears only through what is already written.

## Hand back

- What your own "What you hand back" section asks for, with the validator output verbatim, each scene's gate, cooldown and why, and a table of every item cost and reward for the draftsman.
