# The Long Boil

*A steampunk idle MMO with a story worth checking in for.*

Kettleport has ridden a column of steam above a boiling sea for 312 years, and nobody in charge will say why the sea is still boiling. You are a Tinker who inherits a cold workshop on Sprocket Row from Hester Vane, a Tinker who vanished with a notebook full of questions. Your work goes on for 12 hours while you're away, and when you come back, the city has written to you.

Each check-in has two halves. In the idle half you collect what your Tinker made, craft it up a chain or sell it on the Brass Exchange, gear up, and queue the next 12 hours. In the story half you read the letters the Pneumatic Post delivered, then spend Nerve on storylets: short scenes whose options open as your skills rise.

**Play the dev build:** https://thelongboil.com (sign in with Google or Discord).

This is my capstone project for ELVTR's Multi-Agent AI for Game Development course. One developer, six Claude agents, and AWS.

## Status

The Prologue and Act I are playable end to end. A new Tinker trains skills, fights the Rust Rats of the Rustmoor Scrapyards, gears up, beats their king Scrapjaw, finds Ledger Page 1, and earns the Foundry Pass to the Cinderworks.

| Built | |
| --- | --- |
| The idle loop | 16 skills, an action queue, and the Boiler, which runs your queue for 12 hours offline. Offline resolution is proven equal to step-by-step replay. |
| Combat | Automatic fights with three attack styles and weaknesses, Rations, knockouts, and Scrapjaw as a boss attempt |
| Gear and tools | Seven gear slots and a tool for each gathering and crafting skill. Smithing's metal ladder and, since work order 032, Tailoring's cloth ladder from day one. |
| Story | 51 storylets, 8 Pneumatic Post letters and 5 Ledger Pages across the Prologue and Act I. Nerve, the four Needles, Favour with eight factions, and an Ambition chosen at the end of Act I. |
| The city | The Brass Exchange (an order book, collectors and the grocer), live updates over WebSocket, chat, guilds, and Work Orders |
| Money | The Cog Shop: Gilded Cogs, Cog Crates and four time savers, with Stripe Checkout in test mode |
| Admin | A console for running the playtest: sign-ups, who's active and online, revenue, a story funnel, every player and purchase, chat removal, and chat or full bans |
| Infrastructure | Cognito sign-in, and AWS through CDK: ECS on Fargate, RDS PostgreSQL, CloudFront. Pushing to `main` deploys dev. |

**Next:** the rest of milestone 13 (the Cinderworks' own gear and tool ladder), then Act II. The plan is [`docs/build-plan.md`](docs/build-plan.md).

## How it's built

The game is designed in a GDD and built as **data plus an engine**. Every monster, item, recipe, storylet and tuning number lives as JSON under `content/`. The TypeScript engine reads that data, so new content ships without engine changes.

The content is made by **a crew of six Claude agents**, each with one job and its own files:

| Agent | Job |
| --- | --- |
| `draftsman` | Drafts monsters, drops, items, gear, recipes and tuning as JSON, deriving every number from the GDD or raising it as a question |
| `scrivener` | Drafts storylets and letters in the house voice, cleared one act at a time |
| `toolwright` | Writes the deterministic validators and schemas |
| `inspector` | Reviews what code cannot check: voice, lore, reveal hints, whether a number is defensible. Never edits, never approves. |
| `registrar` | Owns the provenance register: one row for every content item, saying who drafted it and what state it is in |
| `assayer` | Builds the game, plays it through a simulator, and reports what is playable and what needs deciding |

Work moves through **work orders** ([`docs/work-orders/`](docs/work-orders/), 001 to 032 so far). Each one is a bounded brief that names the agents, inputs, limits and what to hand back. Every draft must pass the validators before a model reviews it. Nothing ships without a row in the register, and **approval is mine alone**, after playing the build. No agent can take that step.

Two rules protect the story. The canon bible (`docs/canon/`) splits the world by act, so an agent writing Act I never sees what Act II reveals. And `docs/canon/locked.md`, the ending, is never shown to any agent.

## Course assignments

| Assignment | Where |
| --- | --- |
| GDD first draft | [`docs/The-Long-Boil-GDD-First-Draft.pdf`](docs/The-Long-Boil-GDD-First-Draft.pdf); the full design is [`docs/gdd.md`](docs/gdd.md) |
| A crew of 3+ agents producing game-ready output | [`crew/`](crew/README.md): the Scrivener, Inspector and Registrar as standalone Python, with the validators as a gate |
| A content pipeline that reads the GDD, with a critic | [`crew/outputs/`](crew/outputs/README.md): three Tailoring storylets, now in the game, and what the critic caught |

## Repository

| Path | What it is |
| --- | --- |
| [`docs/gdd.md`](docs/gdd.md) | The game design document. The design authority: where it and anything else disagree, it wins. |
| [`docs/build-plan.md`](docs/build-plan.md) | Milestones, in order, with what each one settled |
| [`docs/work-orders/`](docs/work-orders/) | Every work order the crew has run, each with what was settled |
| [`docs/canon/`](docs/canon/README.md) | The canon bible: world, cast, house style, reveal layers, the quality registry, and the per-act slices handed to agents |
| [`docs/targets.md`](docs/targets.md) | The numbers a build is measured against, each sourced from the GDD |
| [`docs/art-brief.md`](docs/art-brief.md), [`docs/art-requests.md`](docs/art-requests.md) | The art style guide, and every image prompt used, with notes on what came back |
| [`docs/presentation/`](docs/presentation/) | Architecture diagrams |
| `art/` | Concept art and the sprite sheets the game's icons are cut from |
| [`content/`](content/) | The game as data: actions, items, gear, monsters, drops, storylets, letters, Ledger Pages, Work Orders and tuning. `content/provenance.json` is the register. |
| `engine/packages/rules` | The game rules: pure TypeScript, deterministic, no I/O |
| `engine/packages/server` | The server: HTTP and WebSocket on Node, with an event log in Postgres |
| `engine/packages/client` | The client: Expo (React Native) for the web, and later phones |
| [`infra/`](infra/README.md) | The AWS CDK app for the dev environment |
| `scripts/validate/` | The validators: 13 checks, each with fixtures that must pass and fail |
| `scripts/sim/` | The assayer's simulators, which play a Tinker through Act I at 2, 3 and 4 check-ins a day |
| `scripts/art/` | Cuts Gemini sprite sheets into the game's icons |
| [`.claude/agents/`](.claude/agents/) | The six agent definitions |
| [`crew/`](crew/README.md) | The storylet crew as standalone code |

## Running it locally

You need Node.js 22, Python 3, and PostgreSQL.

```bash
python3 scripts/validate/run.py      # every content check
cd engine && npm install
npm test                             # the engine's tests (the server's need Postgres)
createdb long_boil_dev               # once
LONG_BOIL_DEV=1 npm start            # the server on :3000, with a dev clock you can skip forward
npm run client                       # the web client, in a second terminal
```

Without Cognito settings the server uses a dev login. `infra/README.md` covers the AWS setup, and [`crew/README.md`](crew/README.md) covers running the agent crew.
