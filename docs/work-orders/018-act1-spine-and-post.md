# Work order 018: the rest of Act I's spine, and the first Post deck

**Agent:** `scrivener`
**Status:** ready to run
**Act:** Act I. **Locations:** Rustmoor, Sprocket Row, the Polytechnic, the Lowvents, the Brass Exchange. **Clearance:** Layer 1.
**Blocks:** story pace. The 48-hour assay measured 7 story actions in two days against GDD section 5's 25 to 30 a day. Act I stops at `act1.progress` 30 after bottom_rim, and the Post holds only Pip's bill.

## Why this one now

The first playable slice works end to end, but a player runs out of story within one sitting. This order carries Act I from beat 5 to the Foundry Pass, and gives the Post a deck to deal from. Ambition and district storylets, which the GDD uses to fill the gaps between beats, come in a later order.

## Inputs

Attach only these:

- `docs/canon/slices/act1.md`, with `world.md`, `characters.md`, `style.md` and `qualities.json`, as the slice says.
- `docs/gdd.md`, section 5 (Storylets, Nerve, The Pneumatic Post, The Four Needles, Ledger Pages) and section 6 (Combat, for Scrapjaw only).
- The seven Act I and Prologue files already drafted: `content/storylets/*.json` and `content/letters/prologue.sprocket_row.back_rent.json`, read only, for continuity of voice, flags and progress values.
- `content/items/rustmoor.json` and `content/monsters/rustmoor.json`, for real item and monster ids.
- The schemas `storylet/1` and `letter/1` under `scripts/validate/schemas/content/`.

## Scope

1. **Exactly 6 storylets** in `content/storylets/`, one file each, continuing `act1.progress` from 30 in order:
   - **Beat 5, Notice: 2 storylets.** Inspector Rook starts appearing wherever you have just been. The second carries forward whether you cooperated or evaded. Notice enters here: evading or lying raises `needle.notice`; cooperating does not.
   - **Beat 6, Scrapjaw: 1 storylet.** It leads the player to the fight. The fight itself is a boss attempt in the queue, not a storylet. Do not require the kill or describe its outcome.
   - **Beat 7, The page: 1 storylet.** Requires `item.rustmoor.ledger_page_1 >= 1`, which only Scrapjaw's first kill drops, bound to the player. Hester's two columns: 70 fathoms in 11 years against the Gazette's 6.
   - **Beat 8, What you do with it: 1 storylet,** with four options: give the page to Mrs. Inkwell, to Inspector Rook, or to Lord Gauntlett, or keep it. Each raises one faction's Favour and carries forward. None locks content.
   - **The Foundry Pass: 1 storylet,** offering the three roads the slice names: a Stokers' token, a Board pass, or a pass bought from Silas Tallow.
2. **Exactly 6 letters** in `content/letters/`, for a Prologue and Act I deck:
   - Each has `requires` that keep it relevant (a progress range, a skill level, an item held), a `sender` from the slice's cast, and a `weight`.
   - At least two talk to the idle game, as GDD section 5 describes: a request for items the player makes (for example Brass Ingots or Rations), taken as an item change, with a favour or a small story reward attached.
   - At least one offers a way to lower `needle.arrears` without Crowns.
   - Letters are side texture: none moves `act1.progress` or `prologue.progress`.

Nothing else. No Ambition scene, no district storylets, no new items or monsters.

## Settled before you start

- **Act beats are gated to the zone's level band** (GDD section 6). Spread beats 5 to 8 across Rustmoor's two weeks with skill requirements. Scrapjaw is a level 20 boss; propose each gate and say why.
- **Nerve costs:** most scenes cost 1. Beat 7 or 8, as the act's climax, may cost 2 or 3.
- **A storylet never sets a skill or a `record.*` quality.** The validators now fail either.
- **Crowns are not a quality** (work order 016). An outcome cannot charge or pay Crowns; raise any price as a question, as Pip's bill was.
- **Challenge odds** use the GDD formula on skills only. Difficulties suit the beat's level gate.

## Open, for Jeremy, before these ship

Draft with your best proposal and list each one under "New qualities" or "Invented details". Do not wait on them.

- **Carry-forward flags** for beat 5 (cooperated or evaded) and beat 8 (who got the page). The registry holds no such flags; Jeremy adds them. The qualities check will fail on these names until he does; every other check must pass.
- **Whose Favour Mrs. Inkwell raises.** The registry has no Gazette faction (`favour.board`, `stokers`, `counting_house`, `chapel`, `gaugers`, `polytechnic`, `vapourists`, `thunderhead`). Propose one and say why.
- **Whether giving the page away removes it.** Ledger Pages are bound and also count as lore. Do not remove it until Jeremy decides; say which you would choose.
- **What the Foundry Pass is:** an item for the draftsman to add, or a flag. Propose one. Tallow's road costs Crowns, which an outcome cannot charge.
- **Gauntlett's Boiler licence** (GDD section 4, beat 8) has no engine effect yet. Write it as an offer in the prose, and raise whether it should become real.

## Constraints

- Follow your own rules: voice, word limits, the banned list, terrible things offstage, invented details marked and surfaced.
- Clearance: Layer 1 only. Haze does not exist yet; no Whistle, no Hearth, no Steeped, no capsules. Hester appears only through the Ledger Page.
- Run the validators. The provenance check fails until the registrar adds your ids, and the qualities check may fail only on the names you propose above; every other check must pass.

## Hand back

- What your own "What you hand back" section asks for, with the validator output verbatim, and each proposed level gate with its reason.
