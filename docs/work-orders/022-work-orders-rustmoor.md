# Work order 022: Work Orders for Rustmoor

**Agents:** `toolwright` (part 1), then `draftsman` (part 2), then `scrivener` (part 3), then `assayer` (part 4)
**Status:** ready to run (Jeremy, 24 October 2026: recommendations accepted)
**Act:** Act I. **Clearance:** Layer 1.
**Blocks:** build plan milestone 9 (Work Orders). The engine work starts once the content passes review.

## Why this one now

GDD section 6, Guilds, Work Orders, and Favour: "Solo players get a new Work Order every 8 hours", and "every Work Order and Guild Contract carries a faction's seal. Completing it earns that faction Favour, and during a Reckoning it counts as a pledge to that faction's side. Players choose which seals to take, so the daily grind becomes a quiet vote on the city's future."

Work Orders are also the GDD's answer to Favour beyond 2: work order 019 capped story Favour at 2 so that storylets alone cannot open a faction's storyline (section 3, "Favour opens that faction's storyline, titles, and cosmetics").

## Settled before you start

- **The rule:** a new Work Order every 8 hours. Unlocked at total level 50 across the 16 skills, on an account at least 2 days old, the same gate as trading (section 6).
- **What an order asks:** hand in items the Rustmoor skills make or gather (Smithing, Prospecting, Scavenging, Tinkering, Cooking) or monster drops. No order asks for Curios, bound items or anything from the Exchange alone.
- **What an order pays:** its faction's Favour, plus a modest Crown reward. Work Order rewards are a named Crown faucet (section 6, the Crown budget). No order gives gear or bound items.
- **Seals in Act I:** only factions a Layer 1 player has met: the Board of Gauges, the Stokers' Fellowship, the Counting-House and the Gaugers. The Chapel, the Polytechnic, the Vapourists and the Thunderhead come with later acts.
- **Favour never buys power on the Exchange** (section 3).
- **Haze does not exist in Act I. No knock words below Act II.**

## Part 1, toolwright: the Work Order schema and checks

- A schema, `work_order/1`, for files in `content/work_orders/`. Each order has:
  - an id, `wo.<zone>.<faction>.<name>`;
  - a faction seal;
  - a level band;
  - the items it asks for and their quantities;
  - its Favour and Crown reward;
  - a one-line request in the faction's voice.
- Checks:
  - every asked item exists, is unbound, and is made or dropped in the order's zone at or below its band;
  - the seal is an Act I faction;
  - Favour per order is 1;
  - the Crown reward is at or below the draftsman's ceiling (part 2);
  - the request line passes the style check.
- Wire the checks into `scripts/validate/run.py` with pass and fail fixtures, as every other check has.

## Part 2, draftsman: the order pool and its numbers

- **Exactly 16 Work Orders** for Rustmoor, 4 per seal, spread across the 1 to 20 band.
- **Size:** each order should take about 1 to 2 hours of the Boiler's work at the low end of its band. Derive the quantities from `content/actions` and the XP curve, and show the arithmetic.
- **Crowns:** derive a ceiling per order from the collectors' prices for the same items, so turning in an order never pays far more than selling the goods. Report what one order every 8 hours adds to the Rustmoor faucet per week, against the 51,313 Crowns a week the drops check reports now.
- **Favour:**
  - Propose how far Work Orders may raise Favour in Act I: a cap per faction, and how many orders reach it.
  - Report how many days a player taking every order would need to reach it.

## Part 3, scrivener: the request lines

- One line per order, at most 25 words, in its faction's voice. Examples of the register:
  - the Board, formal and reassuring;
  - the Stokers, practical and warm;
  - the Counting-House, transactional;
  - the Gaugers, procedural.
- Layer 1 only. A line may name a district or a character the player has met, but adds no new facts.

## Part 4, assayer: the walk

- Add Work Orders to the 48-hour and Act I walks once the pool exists.
- Report:
  - Crowns added per week;
  - Favour reached by day 14;
  - whether taking orders changes which skills a player levels.

## Settled before it runs

Jeremy accepted every recommendation on 24 October 2026:

- **A player holds up to 3 waiting orders.** A new one arrives every 8 hours while fewer than 3 wait, so checking in once a day loses nothing.
- **Each new order offers two seals and the player picks one.** That is the GDD's "players choose which seals to take". The two seals differ, and both orders come from the same level band.
- **Discarding an order is free.** The next one arrives on the usual clock, as the Post's letters do.

## Hand back

- Toolwright: the schema, the checks, the fixtures and the validator output.
- Draftsman: the 16 orders, the derivations, the Crown ceiling, the faucet figure and the Favour cap proposal.
- Scrivener: the lines, with validator output verbatim.
- Assayer: the walk's figures.
