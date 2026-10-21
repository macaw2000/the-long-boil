# The Long Boil

*A steampunk idle game.*

Capstone project for ELVTR's Multi-Agent AI for Game Development course.

## Contents

- `docs/gdd.md`: the game design document, Extended Edition. The design authority. Where it and anything else disagree, this wins.
- `docs/The-Long-Boil-GDD-First-Draft.pdf`: Assignment 1, the five-page first draft as submitted.
- `docs/canon/`: the canon bible. World, cast, house style, reveal layers, quality registry, and the per-act slices handed to agents. `docs/canon/locked.md` is never shown to an agent.
- `docs/targets.md`: the numbers the assayer measures a build against, each sourced from the GDD, with the gaps listed.
- `docs/art-brief.md`: concept art style guide, palette, and image prompts.
- `art/concepts/`: generated concept art, each saved with its prompt.
- `content/`: game content as data. `content/provenance.json` is the register: one row per item, written only by the registrar agent.
- `.claude/agents/`: the build crew. Six subagents, each owning files nobody else writes.

## The crew

| Agent | Job |
| --- | --- |
| `registrar` | Owns the provenance register. Every content item gets a row, and only this agent writes it. |
| `draftsman` | Drafts monsters, drops, items, recipes and tuning as JSON. |
| `scrivener` | Drafts storylets and Post letters in the house voice, cleared one act at a time. |
| `toolwright` | Writes the deterministic validators and schemas. |
| `inspector` | Reviews drafted content on what code cannot check. Never edits, never approves. |
| `assayer` | Builds, walks the step, reports what is playable and what to decide. |

Approval is Jeremy's alone, after playing the build. No agent can take that step.

## Status

Design phase. Game code will live alongside the docs as development starts.
