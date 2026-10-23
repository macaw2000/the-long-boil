# Work order 017: Rustmoor Scavenging

**Agent:** `draftsman`
**Status:** ready to run
**Blocks:** a fair choice in `act1.rustmoor.rat_nests` (work order 016), and so the story half of the 48-hour test.

## Why this one now

Act I's third beat asks for a Scavenging check (GDD section 4, beat 3: "Scavenging checks turn up torn gauge charts in the Rust Rats' nests"), but nothing in the game trains Scavenging. Every player reaches rat_nests at Scavenging 1, so its difficulty 4 hand search succeeds 15% of the time and smoking the nest is the obvious choice. The inspector failed the storylet on this. Jeremy kept difficulty 4 and ordered the skill instead, on 22 October 2026.

## Inputs

Attach only these:

- `docs/gdd.md`, section 6 (Skills, Zones, The Crown budget) and section 7 (the first session and the first week).
- `content/actions/rustmoor.json`, `content/items/rustmoor.json`, `content/tuning/economy-rustmoor.json`, `content/tuning/xp-curve.json`.
- `docs/work-orders/004-rustmoor-actions.md`, its "Settled" and "Carried forward" sections.
- `docs/work-orders/012-rustmoor-cooking.md`, its "Settled after review" section.
- `content/storylets/act1.rustmoor.rat_nests.json`, read only, for the check it must serve.
- `docs/canon/slices/act1.md` and `docs/canon/style.md`.
- The schemas `item/1`, `action/1` and the current `tuning.economy` schema under `scripts/validate/schemas/content/`.

## Scope

1. **Exactly 4 Scavenging actions** in `content/actions/rustmoor.json`, at levels 1, 5, 10 and 15, at the tier times and XP the other skills use (54/108/162/216 s; 9/19/30/42 XP), so the pacing check holds Scavenging at about 14 days for the band. Scavenging "picks over the loose surface" of the tip (GDD section 6); Prospecting digs the seams. Keep them apart.
2. **What they find.** Prefer outputs that already have a use: existing materials or ingredients another skill consumes. Propose at most 4 new items, and mark each a proposal. Every output needs a use or a capped collector buyer (work order 004, carried forward). Say what each action adds to the Crown faucet per week at the reference rate, if anything.
3. **Economy entries** for every new item, keeping the grocer rule: no `collector_price` at or above any `grocer_price` on the same item.
4. **Say when a new player reaches Scavenging 4,** the level at which rat_nests' hand search is a coin toss or better, against section 7's first session and first week. The storylet is reachable from about the second check-in.

No new skills, no monsters, no drops, no storylets, no Ledger Pages, no other zones.

## Constraints

- Every number is derived or raised as a question. Mark every proposal.
- Clearance: Act I only for every name and flavour line.
- Report the pacing check's Scavenging line and the drops check's Crown faucet and sink lines after your changes.
- Hand new ids to the registrar through your report. The provenance check fails until it adds the rows; every other check must pass.

## Hand back

- The files, every new and changed id grouped by type, the Scavenging pacing line, the faucet figure, when a new player reaches Scavenging 4, open questions, and the validator output verbatim.

## Settled after the first draft

Jeremy set these on 22 October 2026:

- **The pricing is accepted.** Salvage is priced as a finished product at its full labour value, with the end-product caps. The collectors' weekly maximum rises to 8137 Crowns and the Rustmoor faucet to 50473, about 4% more, with no new sink until Calibrating.
- **Brassbuckle points the Tinker to Scavenging** before rat_nests, in a storylet line (work order 016, scrivener). The four actions stay as drafted.
- **Open:** salvage has no use past the collector cap, like the Brass Key, Iron Lock, Steel Blade and Garnet Sight. A later work order may give it a consumer.

## Settled after review

Jeremy set these on 22 October 2026, after the inspector's review:

- **`anchors.ration_sink`:** the faucet it cites is 50473 a week since this work order (48464 before), giving 15.5% and 4.1% (16.2% and 4.3% before).
- **`anchors.scavenging_salvage`** opens as settled, not as a proposal, citing "Settled after the first draft".
- **Bent Nails:** "picked off the tip's loose top", not "the tip's crust".
- **Clock Movement:** "thrown off Gaugehill", the canon phrase.
- **Left as drafted:** Odd Spoons' crests and its line, silver, "sold by weight", and the Clock Movement's two minutes a week.
- **rat_nests now requires Scavenging 3** (work order 016).
