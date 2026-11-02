# Three storylets for The Long Boil

The pipeline is [`crew/crew.py`](../crew.py), described in [`crew/README.md`](../README.md). The Scrivener agent drafts a storylet, the game's own validators check it, the Inspector agent (the critic) reviews it, and anything either one rejects goes back to the Scrivener for at most three rounds. Before drafting, the agents read the game's design: `docs/gdd.md` (Tone and voice, the Act I storyline, and the Storylet rules with the odds formula) and the canon bible built from it (world, characters, house style, the Act I slice and the quality registry). They see only up to the brief's reveal layer.

## What I generated, and why the game needs it

Work order 032 opened **Tailoring** from the first day of play, but no Act I storylet challenged the skill: until then it was locked behind the Foundry Pass. These three scenes give the new skill a place in the story, in three districts, and give the new material, umbrella silk, a source and a sink.

| Storylet | Where | What you do | Brief |
| --- | --- | --- | --- |
| [`act1.rustmoor.silk_line`](act1.rustmoor.silk_line/act1.rustmoor.silk_line.json) | Rustmoor Scrapyards | Pickers dry salvaged umbrella silk on a line, and the Rust Rats steal it for their nests. Quilt what's left (Tailoring), raid a nest for it (Scavenging), or guard the line. | [brief](../briefs/rustmoor-silk-storylet.md) |
| [`act1.sprocket_row.mending_basket`](act1.sprocket_row.mending_basket/act1.sprocket_row.mending_basket.json) | Sprocket Row, home | Word gets round that you can sew, and Pip brings the street's mending to No. 9. Take the whole basket (Tailoring), only the urgent trousers, or send it back and finish the clock you owe. | [brief](../briefs/sprocket-row-mending-storylet.md) |
| [`act1.lowvents.wet_coats`](act1.lowvents.wet_coats/act1.lowvents.wet_coats.json) | The Lowvents | Nothing ever dries this close to the Scald. Line a Stoker's coat with your umbrella silk (Tailoring, spends 3 silk), leave 5 silk for the Stokers to sew themselves, or dry their coats by the stove for coal. | [brief](../briefs/lowvents-oilcloth-storylet.md) |

Each folder holds the storylet as the game loads it (`storylet/1` JSON), `run.log`, and `report.json`. The report holds what the Scrivener invented and flagged, its open questions, the Inspector's full verdict, the provenance row, and every step of the run. All three passed the game's 12 content checks and the Inspector's review, and the register's own schema accepts their rows.

## Does it sound like the game?

Yes. The GDD's voice rules are: second person, present tense, short and specific, dry wit over gore, Victorian register without pastiche, nobody explains the mystery. The scenes keep them:

- "Umbrella silk is made to keep rain off a gentleman, not to be sewn by lamplight, and it slides under the needle like something with somewhere better to be."
- "The rats are out, which is the best thing anyone can say about a rat."
- "Pip regards the pea coat's elbows with some sympathy and carries the rest back up the Row, explaining as Pip goes that the Tinker is very particular about... well, about trousers." (Pip never finishes a sentence, per `characters.md`.)
- "Each as heavy as a wet dog and rather more fragrant."

They are built from the game's own world, not generic fantasy. Gaugehill throws its rubbish down to Rustmoor. The Row pays in kind, wrapped in the Gazette. Mother Ash's slate lists the Lowvents' split pipes, and the stair pays a Tinker in coal. Every reward is a real item or quality the engine already knows, sized to the brief.

What they invent, they flag rather than state as canon. Among the Scrivener's open questions: whether the pickers' silk line should become canon, and whether `needle.scald` covers ordinary burns or only the Scald itself.

## What the critic caught

**The game's validators** run before the Inspector. They catch what code can decide: schema, word limits, banned phrases, unknown qualities, unreachable scenes and reveal-layer timing. The offline dry run (`crew.py --dry-run`) plants a banned phrase in the first draft to show the gate catching it and sending it back:

```
[gate]   FAIL style/banned content/storylets/act1.rustmoor.silk_line.json id=act1.rustmoor.silk_line : /description contains 'a sense of' (banned: 'a sense of')
```

**The Inspector, in these three final runs**, passed all three "with notes" that go to the designer. These are judgment calls no validator can make. From the run logs:

- **Choices that stop being choices.** Using the GDD's odds formula, it worked out that the Lowvents Tailoring challenge (difficulty 10) becomes a sure thing at Tailoring 17. From then on, lining the coat yourself for 3 silk always beats leaving 5 silk, for the same Favour. `style.md` says "If one option is obviously correct, it is not a choice", and these scenes repeat all through Act I. It found the same pattern in the Rustmoor scene.
- **Facts the canon never settled.** "Sunday trousers" and "by Sunday" assume a weekly calendar that neither the GDD nor `world.md` states. A crossword in the Brass Gazette is a design fact nobody has made, and arguably post-Victorian.
- **Craft.** The Rustmoor scene uses "like something with somewhere better to be" twice, so a repeat player reads it in both outcomes. Its night scene also mentions "the crane's shadow".
- **An open rule.** All three use `needle.scald` for an ordinary burn or bite. The GDD's only example ties it to a vent near the Scald, so it asked the designer to rule on what the needle measures.

**The Inspector, in earlier real runs of the same pipeline the same day**, failed drafts outright. The logs of those runs weren't kept, because each rerun cleared the folder, but the findings were printed in the session and are quoted here word for word:

- **Fail: a contradiction with the world.** "'black silk and whalebone' describes umbrellas Gaugehill discards today. That implies whales are still caught, which contradicts `world.md`: '...a white sea of boiling vapour that covers the world. Nobody alive has seen the ground.' It also brushes the Layer 3 limit on anything living below." The Scrivener changed it to "black silk and steel".
- **Fail: tense.** "'Nothing bit you' breaks present tense." It became "Nothing has bitten you, which on the tip counts for something."
- **A reveal hint.** In a failure outcome, the bottom of an ash sack was still burning and a picker "remarks that the sack was warm, in the tone of someone who could have mentioned it sooner". The Inspector flagged this: "That is heat at the bottom that someone knew about and kept quiet... reveals.md says 'Hinting counts'." Hidden heat that someone knows about and keeps quiet is the shape of the Act II reveal. But it passed the scene "with notes".

**That last catch changed the pipeline.** A reveal hint is the most expensive mistake this game's story can make, and the loop let one through because only an outright fail sent a draft back. The Inspector now also returns `reveal_clear` (true/false), and the orchestrator sends back any draft that isn't clear, whatever the verdict. The three outputs above were generated after that change, and all three came back clear.
