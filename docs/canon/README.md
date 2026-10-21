# The canon bible

Everything an agent is allowed to know about Kettleport, split so that no agent is handed more than its work needs.

Source: `docs/gdd.md`, Extended Edition, 19 October 2026. Nothing in this folder is a new design decision. Where a fact is missing, it is listed as an open question rather than filled in.

## Files

| File | Holds | Who may receive it |
| --- | --- | --- |
| `world.md` | The city as any citizen knows it. Layer 0. | Any agent |
| `characters.md` | The cast, what each one knows, what each one hides. | Any agent, filtered to its act |
| `style.md` | House voice, limits, banned words. | scrivener, inspector |
| `reveals.md` | The reveal schedule, Layers 1 to 3. | Filtered by act, never whole |
| `qualities.json` | The quality registry: every name the story may read or set. | draftsman, scrivener, toolwright |
| `slices/act1.md`, `act2.md`, `act3.md` | The exact bundle for a work order in that act. | The agent working that act |
| `locked.md` | Layers 4 and 5, and the Diver. | **No agent, ever. Jeremy only.** |

## The clearance rule

A work order names one act. The agent gets that act's slice and nothing above it.

An agent cleared for Act I may not be told a Layer 2 fact, may not ask for one, and may not write a line that leans toward one. Hinting counts as leaking. If a scene seems to need an uncleared fact, the agent writes the scene without it and raises an open question.

`locked.md` is never pasted into a prompt, never summarized into a slice, and never cited in a work order.

## Changing canon

Only Jeremy adds canon. An agent that needs a fact that is not here marks it `invented: true` in its report and lists it as an open question. If Jeremy canonises it, it is added here first, then the content is redrafted against it.
