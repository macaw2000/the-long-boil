# Work order 020: Curios for the districts, and the Infirmary of St. Pinion

**Agents:** `draftsman` (part 1), then `scrivener` (parts 2 and 3)
**Status:** ready to run (Jeremy, 23 October 2026: run as written; the two open questions are settled after the drafts)
**Act:** Act I. **Clearance:** Layer 1.
**Blocks:** story pace. The district re-walk (work order 019, "Settled after the district re-walk") measured about 1.5 story actions a day for a player who plays only what pays: Favour caps at 2, Needles rarely rise, so nothing is worth Nerve.

## Why this one now

GDD section 5 names the rewards a storylet can give and the risks that make it matter. Act I uses neither yet:

- **Curios** (section 5, Story rewards and the economy): "A Board memo in a rat's nest, a hymn sheet ... Low volume; NPC collectors buy them for Crowns, capped per player per week." A district scene that sometimes turns up a Curio is worth returning to, and the weekly cap keeps it from becoming a faucet.
- **Redline** (section 5, The Four Needles): "At 8, the Needle is redlined and the story sends you somewhere you would rather not be." Scald's redline is the Infirmary of St. Pinion: "Recover over several storylets, or charm the night nurse." Nothing in Act I sends a player there, so a high Scald costs nothing and relieving it is worth nothing.

## Part 1, draftsman: Rustmoor Curios

- **Exactly 4 Curio items** in `content/items/rustmoor.json`, Act I clearance, each something thrown off Gaugehill or found in the Lowvents or the Exchange (section 4, beat 3: "Everything thrown off Gaugehill lands in Rustmoor"). Names and flavour lines are yours; the scrivener will place them.
- **Economy entries:** unbound and tradable, with a `collector_price` and a `collector_weekly_cap` each. Derive both, and report what the four add to the collectors' weekly maximum and to the Rustmoor faucet. The purse already reaches about 95,000 Crowns by day 14 with Calibrating, the main sink, not yet built; keep the addition small and say how small.
- No new skills, actions, monsters or drops.

## Part 2, scrivener: Curios in the district scenes

- Rewire **4 of the 10 district storylets** from work order 019 so a challenge success, or a costly certain option, sometimes gives one of the 4 Curios. "Sometimes" means a skill challenge, not a random roll: the engine has no story drop tables.
- Every scene keeps its other effects and its Favour and Needle numbers unless the draftsman's review changes them.

## Part 3, scrivener: the Infirmary of St. Pinion

- **Exactly 4 storylets** at a new location, `infirmary`, ids `act1.infirmary.<name>`, all requiring `"needle.scald": ">=8"`:
  - Being admitted, and what it costs to be there.
  - Two ways out over several scenes ("Recover over several storylets"), each lowering Scald.
  - Charming the night nurse, a challenge that gets you out faster.
- **What redline costs:** while Scald is 8 the Infirmary scenes are what the story offers. The engine does not yet hide other storylets at redline; say whether you think it should, and Jeremy decides. A redlined Tinker keeps smelting, fighting and trading as normal (section 5).
- **Raise Scald in the spine and districts** where a failed physical risk now costs nothing, so a careless player can reach 8 in Act I. List each change with its reason; the draftsman reviews the numbers.

## Settled before you start

- Curios are tradable and collector-capped; no story outcome gives Crowns.
- A storylet never sets a skill or a `record.*` quality. Letters are one-shot once answered. A storylet may carry `cooldown_hours`.
- The Needles fall 1 a day on their own; redline is 8.
- Haze does not exist in Act I; Notice from beat 5. No knock words below Act II.

## Open, for Jeremy, before these ship

- **Whether redline hides the rest of the story** until the Tinker is out, as "sends you somewhere" suggests. That is an engine rule.
- **Whether any Curio may be given to a character** in a later scene, as a story use beside the collector.

## Hand back

- Draftsman: the items, economy entries, derivations, and the faucet figure.
- Scrivener: your usual hand-back, with validator output verbatim, each Scald change and its reason, and a table of every item cost and reward for the draftsman.
