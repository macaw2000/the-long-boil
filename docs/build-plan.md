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

## Prerequisites on this machine

Not installed yet: Node.js 22 LTS and Docker. With Homebrew:

```
brew install node@22
brew install --cask docker
```

Then open Docker Desktop once so its engine is running.

## Not in this slice

AWS deployment (rollout phase 0 in section 11), Cognito sign-in, Calibrating (parked on the `wip/calibration-model` branch), armour, guilds, leaderboards and the agents' Step Functions pipeline.
