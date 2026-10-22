# Work order 008: Rustmoor's drops and prices

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** a playable Rustmoor loop, and the first Crown budget report.

## Why this one

Section 7's first session has Ada sell "the rats' scrap at the Counting-House window" to pay a bill. Section 6 says monsters drop Crowns and materials, and Scrapjaw drops Scrapjaw's Cleaver and Ledger Page 1. Section 5 adds 4 rare Ledger Pages per zone. Work order 004 carried forward four end products with no use. This work order gives Rustmoor all of that.

## Inputs

Attach only these:

- `docs/gdd.md`, section 5 (Ledger Pages and the Commonplace Book, Story rewards and the economy), section 6 (Combat, Treasure and Calibrating, The Brass Exchange, Guilds, The Crown budget) and section 8.
- `docs/canon/slices/act1.md`, the Act I slice, and `docs/canon/style.md`.
- `content/items/rustmoor.json`, `content/actions/rustmoor.json`, `content/monsters/rustmoor.json` and `content/tuning/xp-curve.json`.
- `docs/work-orders/004-rustmoor-actions.md`, its "Carried forward to the economy work order" section.
- The schemas `drops/1` and `tuning.economy/1` under `scripts/validate/schemas/`.

## Scope

*Where this section disagrees with "Settled after the first draft" below (the 500-kill pity, a bound Cleaver), the settled section wins.*

1. **`content/drops/rustmoor.json`: exactly 5 drop tables,** one per Rustmoor monster.
   - Every rat drops Crowns and Rat Scrap.
   - The 4 rare Ledger Pages drop from rats. Spread them across the rats. Each needs a `zone_pity` entry of 500 kills, counted across every kill in Rustmoor (GDD section 5).
   - Scrapjaw drops Scrapjaw's Cleaver, and gives Ledger Page 1 on the first kill.

2. **New items in `content/items/rustmoor.json`: exactly 7,** appended after the existing 12. Do not change the existing 12.
   - Rat Scrap;
   - Scrapjaw's Cleaver (no stats; gear stats come with the combat-stats work order);
   - Ledger Page 1 and the 4 rare Rustmoor Ledger Pages.

   Ledger Pages are story items. Their names say only which page they are, and their flavour says only that the page is Hester's, in her hand. **A page's flavour may not hint at what it says.** The scrivener writes what is on them later.

3. **`content/tuning/economy-rustmoor.json`:** bound status for every Rustmoor item, and collector prices and weekly caps for the items collectors buy. Collectors buy Rat Scrap and the four end products (Steel Blade, Brass Key, Iron Lock, Garnet Sight), which gives those products the capped buyer work order 004 asked for. Ledger Pages and Scrapjaw's Cleaver are bound; whether the Cleaver should be bound is a question for your report.

## Anchors to work from

- **The only Crown price the GDD states** is in appendix A.2, quoted here: a Stoker offers "+600 Crowns" for "20 Brass Ingots", which is 30 Crowns per ingot. It is a favour price in a storylet, so it likely sits above the market. Use it as a ceiling, and say how you placed the market below it.
- **Guild founding costs 500,000 Crowns** (section 6), a group goal.
- **Collectors are capped per player per week** (section 5), and the Crown budget lists them as a faucet.

## Settled after the first draft

Jeremy set these on 22 October 2026, after the inspector's review. The first two are recorded in GDD sections 5, 6 and 7.

- **Rare pages arrive in a fixed order on one shared counter,** guaranteeing the next page within 1,000 Rustmoor kills, with a base chance of about 1 in 2,000 per kill. Pages land around days 2, 5, 9 and 14, two by the end of week one.
- **Selling to collectors is never locked** by the total-level-50 trading rule.
- **Scrapjaw's Cleaver:** the first kill always gives one; repeat kills drop it at 0.02; it is tradable.
- **Flavour:** the Cleaver's line ends at "girders"; Rat Scrap is "sold by the sackful".
- **Ledger Page names** stay "Rustmoor Drop 1–4" until the 24-page reading order is set.
- **Carried forward:** Pip's first bill is 15 Crowns, so first-session scrap can pay it (for the scrivener). Rat Scrap needs a use beyond collectors, such as recipes (for a later work order).

## Settled after the second review

Jeremy set these on 22 October 2026. The first and third are recorded in GDD sections 5 and 6.

- **Any Rustmoor kill rolls for the next page,** boss attempts included, and every kill advances the shared counter. The per-rat page entries in the drops file are read as zone-wide.
- **Accepted gap:** a player who puts nearly all combat XP into one skill may leave Rustmoor before the counter guarantees all four pages. Revisit when the combat XP split stops being provisional.
- **A boss's first-kill reward replaces its ordinary roll** on that kill, so the first Scrapjaw win gives exactly one Cleaver.
- **Carried forward to the combat-stats work order:** Scrapjaw's Cleaver needs level 20 to equip and is outclassed by Cinderworks gear, so its falling price harms nothing.

## Clearance

Act I only. Nothing above the Act I slice, and nothing about any Ledger Page's contents.

## Constraints

- Every number is derived from a stated fact or raised as a question. Drop chances, Crown amounts and collector prices are the most likely to be invented; mark every one that is your proposal rather than a derivation.
- Report the Crown faucet figures from work order 007's report.
- Hand your new ids to the registrar through your report. The provenance check will fail until it adds the rows; every other check must pass.

## Hand back

- The files, every new id for the registrar, the Crown faucet figures, derivations, proposals marked as such, open questions, and the validator output verbatim.
