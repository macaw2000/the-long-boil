# Build plan: the first playable slice

Target: GDD section 10's 48-hour test, built on the stack section 10 names, with a real database from the first commit.

> One skill chain, the offline timer, one zone, a basic Exchange, and five storylets with Nerve.

The content for all of that exists and is approved, except the five storylets (work orders 015 and 016).

## Principles

- **The database is the source of truth from day one.** PostgreSQL, the same engine as production's Aurora PostgreSQL Serverless v2 (section 11), run locally in Docker. No in-memory or file stores standing in for it, so nothing has to be rewritten to scale.
- **One ordered event log per Tinker** (section 10, Offline). Every state change is an event row. Inventory, skills, the queue and qualities are projections kept in the same transaction, so reads are fast and the log can always rebuild them.
- **Deterministic resolution.** Seeded RNG plus the content version stamped on every event make every result replayable. The offline Boiler resolves on demand when a Tinker is next touched, up to the 12-hour cap.
- **Game rules are pure TypeScript,** with no database or network inside them, so the server runs them authoritatively and tests run them in milliseconds. The story engine is one of these modules (section 10).
- **Content is read from `content/`,** validated by the existing checks, and loaded at server start with its git hash as the content version. AppConfig replaces this at deploy time (section 11), without changing the rules code.

## Layout

```
engine/
  packages/rules/    pure TypeScript: action engine, combat, drops, Boiler, story engine, seeded RNG
  packages/server/   authoritative Node.js: Postgres access, event log, WebSocket API, Exchange matching
  packages/client/   Expo (React Native Web): the playable surface
  docker-compose.yml PostgreSQL 16 for local development
```

## Database (first migration)

| Table | Holds |
| --- | --- |
| `accounts` | Sign-in identity (a local dev login until Cognito, section 10) |
| `tinkers` | One row per Tinker; up to 3 per account |
| `events` | The ordered log: tinker, sequence number, type, payload, RNG seed, content version, time. Append-only; unique on (tinker, sequence) |
| `inventory` | Projection: tinker, item, quantity, bound |
| `skills` | Projection: tinker, skill, XP |
| `queue` | Projection: the two queued actions and the Boiler's last resolution time |
| `qualities` | Projection: story qualities, Nerve, Needles |
| `exchange_orders` | Open buy and sell orders; matched in a transaction with row locks, 2% tax, 30-day expiry |

Valkey (sessions, chat, leaderboards) is not needed for this slice and comes later.

## Milestones

1. **Rules:** the action engine and the Boiler, reading `content/actions` and the XP curve. Tests prove offline resolution equals step-by-step replay.
2. **Database and server:** migrations, the event log with projections, and a small API to queue actions, resolve the Boiler and read state. Tests run against a real Postgres.
3. **Combat and drops:** fights from the combat model, drops and Crowns, Rations, knockouts, and Scrapjaw as a boss attempt.
4. **Client:** a playable Expo web screen: queue, Boiler gauge, inventory, skills, the While You Were Away ledger, and a fight.
5. **Exchange:** the order book, collectors and the grocer's counter.
6. **Story:** the story engine, Nerve, the five storylets and Pip's first letter.

Each milestone ends with the validators and the tests passing, and a commit.

## After the slice: the social city

Milestones 1 to 6 are built. The GDD makes Kettleport a shared city (sections 6 and 7: guilds, Work Orders, chat on the right of the desktop screen), so these come next, in this order (Jeremy, 24 October 2026):

7. **Live connection.** One WebSocket per open workshop (section 10), server to client only; everything a player does still goes through HTTP. The server pushes a change notice when an action changes a Tinker, including the other side of an Exchange fill, and carries chat. Work finishing on the Boiler's clock is not pushed, so the client still looks every few seconds while open. The socket trusts the Tinker id it is given, exactly as the HTTP routes do under the dev login; both take a Cognito token at milestone 11.
8. **City chat.** One city channel, shown on the right on desktop and as a sheet on phones.
   - Messages are stored in Postgres (`chat_messages`), so history survives a restart and the last 50 load on connect.
   - At most 280 characters; one message every 3 seconds per account; plain text only.
   - Any player can mute another for themselves. A muted sender's messages are hidden on the muter's screen, not deleted.
   - Fan-out goes through one `Broadcast` interface: in-process for one local server now, Valkey pub/sub when there is more than one server (section 11). The chat code does not change at that swap.
   - Ledger Page text is blurred by default (section 7) once chat can quote an item; there is no item linking yet.
9. **Work Orders.** A new solo Work Order every 8 hours, each with a faction's seal that earns that faction's Favour (section 6). Gated like trading: total level 50 on an account at least 2 days old. Needs a draftsman work order for the order pool and its rewards, and the assayer's faucet figure, before it ships.
10. **Guilds.** Founding at 500,000 Crowns (a Crown sink, section 6), members, a contribution roster and a guild chat channel on milestone 8's code. Guild Contracts, the guild Workshop and charters follow later, after Calibrating; GDD section 10 cuts charters and Contracts first if time runs short.
11. **Real sign-in.** Cognito with Google, then Discord, replacing the dev login (sections 10 and 11). It comes with AWS rollout phase 0, since Cognito needs the deployed domain.

## Prerequisites on this machine

Not installed yet: Node.js 22 LTS and Docker. With Homebrew:

```
brew install node@22
brew install --cask docker
```

Then open Docker Desktop once so its engine is running.

## Not in this slice

AWS deployment (rollout phase 0 in section 11), Calibrating (parked on the `wip/calibration-model` branch), armour, Guild Contracts and charters, leaderboards and the agents' Step Functions pipeline. Guilds, chat, Work Orders and Cognito sign-in are milestones 7 to 11 above.
