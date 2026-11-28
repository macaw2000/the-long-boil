# Work order 047: chance drops and first kills

**Agents:** the lead session for the drop rows, the rules, client and tests. `draftsman` to review the rows; `assayer` on Crowns a week; `inspector`; `registrar` for the register. Still to come: Jeremy to play it.
**Status:** built and tested (27 November 2026). Not reviewed by the crew.
**Blocks:** nothing.

## Why this one

Every Runt dropped the same three things at 100%; the only chance drop was a Ledger Page at 0.05%, and every `first_kill` list was empty. Nothing could make a player say "look what I got".

Approved by Jeremy, 27 November 2026.

## What changed

**Chance rows** on the four Rustmoor monsters (`content/drops/rustmoor.json`), all items that already exist, so no new art or economy rows:

| Monster | Bent Nails | Umbrella Ribs | Odd Spoons | Clock Movement | Misstruck Crown |
| --- | --- | --- | --- | --- | --- |
| Runt | 6.6% | 2.5% | 1% | | 0.3% |
| Scrounger | 10% | 4% | 1.5% | 0.6% | 0.4% |
| Tinplate | | 6.6% | 2.5% | 1% | 0.5% |
| Gaffer | | | 4% | 1.6% | 0.6% |

**The first of each monster** always turns up its rarest find that is not a Ledger Page (`boiler.ts`, `rarestFind`): the first Runt brings a Misstruck Crown. A Tinker's beaten monsters are kept in `first_kills` (migration 028), so a Tinker already playing gets theirs on the next kill of each.

**A drop at 3% or rarer is a find** (`RARE_CHANCE`). Played live, it is a banner over the page ("Rare find", or "First of its kind") with its own sound. Coming back, the haul leads with a gold "Rare finds" box.

**Work Orders ignore luck** (`work_orders.ts`, `DEPENDABLE_DROP`). A drop under 5% no longer counts as a way to come by an item, or a 1% Clock Movement would make a band-15 order look fillable at level 10.

## Measured

Played: the first Runt's banner, then Bent Nails within a minute; six hours away brought 3 Odd Spoons and 14 Umbrella Ribs. The walk's Crowns are in work order 045 (finds are items, and only the Misstruck Crown sells).

## For Jeremy

1. **The Misstruck Crown as everyone's first find.** It is the Runt's rarest row, so every new Tinker gets one in their first minute. If it should stay rare, the first-kill find needs its own choice: the drop tables' `first_kill` list is read only for bosses today, so either extend it to ordinary monsters (a few lines in `fightStep`) or move the Crown's row above another's in rarity.
2. **Cinderworks** has no chance rows yet. The same shape fits; it wants the draftsman's numbers.
3. **The bench has no finds.** The review suggested one; fine work (work order 046) stands in for it for now.

## Hand back

- Content: `content/drops/rustmoor.json`.
- Rules: `boiler.ts` (`RARE_CHANCE`, `rarestFind`, `firstKills`), `ledger.ts` (`finds`, `firsts`), `work_orders.ts` (`DEPENDABLE_DROP`).
- Client: `Workshop.tsx` (`announce`), `Juice.tsx` (a banner's `kicker`), `Ledger.tsx`, `sound.ts`.
- Register: `drops.rustmoor.scrapyards` changed; the registrar to set it back to `validated` and clear its review.
