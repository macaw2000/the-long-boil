# The Long Boil: Game Design Document

Oct 16, 2026 · @Jeremy

*A steampunk idle game*

## 1. Executive Summary

**The Long Boil** is a steampunk idle MMO for web and phone: 10 non-combat and 7 combat skills, a player-run market, guilds, and AFK party combat. You are a Tinker in Kettleport, a floating city, and work continues for 12 hours offline, so a session is a 3 to 5 minute check-in.

- **Win condition:** none in the usual sense, since an idle game never ends; success means higher levels, better and higher-calibrated gear, and leaderboard ranks (total level, each skill, net worth, guilds).
- **Loss states:** a knockout (60-second respawn, then the queue resumes), a lost boss fight (the attempt is spent), or a failed calibration (gear falls to +0 unless protected).
- **Business:** free to play; Stripe-sold Gilded Cogs buy time savers and cosmetics, and nothing is exclusive to paying players.

## 2. Game Mechanics

**Core loop.** You queue an action and a count, and the server works through it online or off: queue → collect the haul → craft it up a chain or sell it → equip or calibrate gear → unlock a harder zone → queue again. A first chain: smith brass, tinker a Brass Spanner, fight Rust Rats. Sixteen skills, each leveled 1 to 100, feed the loop:

- **Gathering:** Prospecting, Lumbering, Scavenging (ore and gems, timber, wreck salvage)
- **Production:** Smithing (plate, blades), Tinkering (tools, rifles, keys), Tailoring (coats, goggles), Cooking (healing rations), Tea Blending (buff teas and tonics)
- **Special:** Calibrating (gear +1 to +20); Alchemy arrives after the MVP
- **Combat:** Vitality, Pressure, Precision, Melee, Fortitude, Marksmanship, Aetherics

**Offline play: the Boiler.** Logging off leaves 12 hours of steam, shown as a pressure gauge; at zero your Tinker stops until you return. The queue holds two actions ("smelt 400 ingots, then tinker 50 spanners"), and a While You Were Away ledger greets you on return.

**Combat.** Combat is automatic: pick a zone, a loadout, and triggers ("eat a Ration below 40% HP"), then watch or walk away. Monsters are weak to Melee, Marksmanship, or Aetherics, so loadouts matter. A knockout respawns in 60 seconds and resumes the queue, so offline hours are never wasted.

- **Rustmoor Scrapyards** (1 to 20): Rust Rats; boss Scrapjaw drops Scrapjaw's Cleaver
- **Cinderworks Foundry** (20 to 45): Soot Wraiths; boss Old Bellows drops Bellows Plate
- **Thunderhead Reach** (45 to 70): Storm Harpies; the Lightning Baron, this semester's endgame boss, drops a Coil Staff
- **Dreadnought Hangar** (70+, 5-player dungeon, after the semester): the Iron Dreadnought drops its armor set

**Treasure and Calibrating.** Monsters also drop Crowns, materials, and ability Schematics. Gear has fixed stats per calibration level, so a +5 Brass Spanner is identical everywhere and fits an order book. Each calibration attempt costs Crowns and materials, with its odds shown up front; failure resets gear to +0 unless a crafted Safety Valve, consumed on use, limits the loss to one level. It is the main Crown sink.

**The Brass Exchange (auction house).** An order book: sellers list, buyers post standing bids, and matches fill at once, even offline, which suits idle play. Prices move in 2 to 5% steps, a 2% sales tax removes Crowns, and orders expire after 30 days. At launch, NPC sell orders at a price ceiling keep a thin market moving while also removing Crowns.

**Guilds and Work Orders.** A guild (500,000 Crowns) gets chat, a contribution roster, a Workshop, and 5 weekly Guild Contracts such as "Smelt 50,000 Brass Ingots" whose tiers pay upgrades and tokens. Solo players get a new Work Order every 8 hours; Work Orders and trading unlock at total level 50, so throwaway alt accounts can't farm them.

**Gilded Cogs (Stripe).** Cogs come in Cog Crates of 10 to open or sell on the Exchange (15% tax), so free players can buy them with Crowns; crates lock 72 hours to blunt card fraud. Cogs buy queue slots, Boiler upgrades (+2 offline hours each, up to 24), cosmetics, and Boiler Boosts; free players can earn all of it through the Exchange.

**What the player sees.** After Google or Discord sign-in, Professor Ottoline Brassbuckle walks you through a copper-to-spanner chain, a first fight, and a first sale. Desktop puts skills left, your Tinker at work center, and chat right; phones use a bottom tab bar. Art is 48×48 pixel sprites in brass, copper, and verdigris; the Tinker wears its gear.

## 3. AI Architecture

Five Claude agents build and tune content between patches, and each is built around one task it does exceptionally well (one agent, one wow). None sits in a player's moment-to-moment loop: drops, combat, and trades stay in deterministic server code, since idle play runs offline and a traded economy needs repeatable outcomes.

| Agent | Its one wow, in one sentence | What players notice |
| --- | --- | --- |
| Foreman | Turns a one-page patch brief into a complete, correctly ordered set of work orders. | A new zone or gear tier every two weeks. |
| Draftsman | Writes new items, recipes, and monsters as game-ready JSON that fits each tier's stat budget. | Thunderhead Reach's monsters and gear. |
| Inspector | Reviews tone, lore, and names after code has already checked every stat budget. | No off-tone items or overpowered swords. |
| Assayer | Predicts how a patch will move pacing and prices before players touch it. | About two weeks per zone; stable prices. |
| Chronicler | Writes the Brass Gazette's prose around facts and opt-in names taken straight from game data. | "Copper up 12%; Iron Owls fell the Baron." |

[Diagram: patch pipeline. Patch brief (me) -> Foreman -> Draftsman -> Inspector (fails a rule: back to Draftsman) -> Assayer -> Chronicler -> My review (merge, or send back to Foreman) -> Live in game.]

**One patch (illustrative).** For Patch 0.3, Thunderhead Reach, the Inspector bounces the Coil Staff for exceeding its damage budget, and the Assayer finds players reach level 70 in 9 days against a 14-day target, so it proposes cutting Storm Harpy XP by 35%. I approve, merge, and the data ships with no code change.

**Pipeline in one sentence.** In my game, the Draftsman takes the Foreman's work orders and produces item, recipe, and monster JSON that the player sees as a new zone full of gear to chase.

## 4. Technical Strategy

One TypeScript codebase on Expo (React Native plus React Native Web) ships the web game now and phone apps later; menus, timers, and sprite sheets need no game engine.

- **Client:** Expo, TypeScript, Reanimated sprites; a PWA on S3 + CloudFront.
- **Server:** authoritative Node.js on ECS Fargate, WebSockets; EventBridge + SQS jobs.
- **Offline:** the server never stops. Each Tinker's state changes through one ordered event log: solo queues resolve on demand, Exchange fills and boss fights write events as they happen, and seeded RNG plus versioned config make every result replayable.
- **Data:** Aurora PostgreSQL for inventory and orders; Valkey for sessions, chat, ranks.
- **Sign-in:** Cognito with Google and Discord (OIDC); 3 Tinkers per account, 1 trading.
- **Payments:** Stripe Checkout webhook to Lambda grants crates once per event ID.
- **Agents:** Step Functions runs each agent as a Lambda calling Claude.
- **Admin console:** an MFA-gated web app to tune drop rates, XP curves, costs, taxes, and the Boiler cap live through a versioned config store, watch economy dashboards, manage players, and approve agent patches, all audit-logged.

**Token budget.** Each player game action costs 0 tokens, because no agent runs per player. The only daily cost is the Gazette, about 14K tokens or roughly $0.002 a day at Claude Haiku 5.5 pricing, for any number of sessions. Content patches add about 1.15M tokens every two weeks, roughly $3.50 at October 2026 Claude API list prices:

| Agent | Model | Calls | Input | Output | Cost |
| --- | --- | --- | --- | --- | --- |
| Foreman | Sonnet 5.5 | 12 | 120K | 40K | $0.64 |
| Draftsman | Sonnet 5.5 | 9 | 225K | 120K | $1.65 |
| Inspector | Haiku 5.5 | 12 | 165K | 36K | $0.03 |
| Assayer | Sonnet 5.5 | 4 | 120K | 40K | $0.64 |
| Chronicler (patch) | Sonnet 5.5 | 6 | 48K | 40K | $0.50 |
| Chronicler (Gazette) | Haiku 5.5 | 14 | 168K | 28K | $0.03 |
| **Total** |  | **57** | **846K** | **304K** | **$3.49** |

Output counts thinking; Draftsman calls include resends. Development adds about 10M Sonnet 5.5 tokens ($36) plus 4 patches ($14), under a $75 hard cap.

**Constraints.** My biggest constraint is output reliability, because one bad number in a traded economy (an overpowered sword) crashes prices players spent real time on; that is why the Inspector and my review gate every patch.

- **API limits:** per-minute request and token caps mean sequential 10-entity Draftsman batches with backoff; thinking bills as output.
- **Context window:** Sonnet 5.5 holds 1M tokens, but prompts stay near 15K, since Haiku 5.5 costs 5 times more above 100K and smaller prompts stay sharper.
- **Latency:** barely matters; no agent runs while a player waits.
- **Identity and stores:** Discord's Cognito token exchange gets tested in week one, with a Lambda shim as fallback; non-US store billing rules delay app-store builds.

**Scope.** This semester: 16 skills, 3 zones up to level 70, the Exchange, guilds, leaderboards, Work Orders, the admin console, and a test-mode Cog Shop on web, run by five agents. If time runs short, the Cog Shop's Stripe path drops first, then Guild Contracts, then Discord sign-in. It passes the 48-hour test: two developers could build a rough playable version (one skill chain, the offline timer, one zone, a basic Exchange) in a weekend, and every skill runs on one generic action engine, so the rest is mostly data. Later: the 5-player Dreadnought dungeon, Alchemy, more zones, an Ironclad no-trade mode, live payments, store builds, and a market-watching Warden agent.

**Known logic gap.** With a small player base the Exchange may stay too thin; NPC sell orders are a start, but the overall Crown faucet and sink budget still needs an owner. The future dungeon's offline rule is already decided: each run snapshots every member's gear and consumables at launch and resolves to the end, so nothing outside the run can change it.

Sources: [Claude API pricing](https://dev.to/scorpion4ik26lang/claude-api-pricing-per-million-tokens-all-models-oct-2026-2am2) · [Discord OpenID configuration](https://discord.com/.well-known/openid-configuration) · [Expo: Stripe on iOS](https://expo.dev/blog/mobile-app-payment-processing-best-practices)
