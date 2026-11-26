<!-- Generated from style_guide.json by `python3 refine/loop.py --guide`. -->

# The Long Boil house style, scored

Every rule is lifted from the game's own design: docs/gdd.md section 2 (Tone and voice) through docs/canon/style.md, the world and cast in docs/canon/world.md and characters.md (GDD sections 2 and 3), and the Act I slice and reveal schedule (GDD section 4). Nothing here is new canon. Each rule is scored 0 to 10; weights sum to 100. A draft is accepted when its weighted total is at least `accept_total` and every rule is at or above its floor.

Accepted at a weighted total of 90 out of 100, with every rule at or above its floor.

## R1. Second person, present tense (weight 10, floor 7, scored by evaluator)
Source: docs/canon/style.md, Voice (GDD section 2)
> Second person, present tense. "You", never "the player".

Every line of description, label and outcome addresses the Tinker as "you" in the present tense. Past tense is allowed only for things that happened before the scene ("the pigeon was older than anybody guessed"), never for what the Tinker does now.

Anchors: 10: Every sentence is second person present.; 5: One or two slips into past tense or third person.; 0: Written in past tense or about "the player".

## R2. Short and specific (weight 10, floor 7, scored by evaluator)
Source: docs/canon/style.md, Voice (GDD section 2)
> Short and specific. A No. 4 spanner beats an old tool.

Nouns are particular to Kettleport and its trades: a named tool, a counted thing, a district detail. No generic "old tools", "strange machines", "delicious food". No padding sentences.

Anchors: 10: Every image is concrete and could only be in this game.; 5: Several generic nouns or filler sentences.; 0: Vague throughout; could be any fantasy town.

## R3. Grim and funny in the same breath (weight 10, floor 7, scored by evaluator)
Source: docs/canon/style.md, Voice and Banned (GDD section 2)
> Kettleport is grim and funny in the same breath. ... Dry wit over gore. Terrible things happen offstage and are described by their aftermath. ... [Banned:] any sentence that explains its own joke.

The scene has dry, understated wit that sits beside hardship. Injury and harm are shown by aftermath, not gore. No joke is followed by a sentence explaining it. No cheerfulness without the grim, no grimness without the wit.

Anchors: 10: Dry, deadpan, and a little sad, like 'they eat it in silence, which on the tip is applause'.; 5: Flat, or one joke explained, or the wit is broad rather than dry.; 0: Gore on the page, or slapstick, or no humour at all.

## R4. Victorian register without pastiche (weight 5, floor 7, scored by evaluator)
Source: docs/canon/style.md, Voice (GDD section 2)
> Victorian register without pastiche: no "forsooth", no modern slang, no real-world politics.

Diction fits a nineteenth-century industrial city: no modern slang or idiom ("okay", "vibe", "level up", "multitask"), no mock-archaic pastiche ("forsooth", "thee", "'tis"), no real-world places, parties or politics.

Anchors: 10: Period-plausible throughout, never costume.; 5: One modern idiom or one archaic flourish.; 0: Modern chat voice, or Ye Olde pastiche.

## R5. House limits and banned words (weight 10, floor 10, scored by code)
Source: docs/canon/style.md, Limits and Banned (GDD section 2); enforced by scripts/validate/check_style.py
> Storylet description 120 words; each option label 25 words; each outcome 150 words. Banned: "tapestry", "testament to", "delve", "a sense of", "little did you know".

Scored by the game's style validator: 10 minus 3 for each style failure on this storylet.

Anchors: 10: No style failures.; 4: Two failures.; 0: Four or more.

## R6. Nobody explains the mystery (weight 5, floor 7, scored by evaluator)
Source: docs/canon/style.md, Voice (GDD section 2)
> Nobody explains the mystery. Truth arrives in fragments: a ledger page, a whistle note, two gauges that disagree.

No narrator or character explains why the Scald rises, what the Board hides or what happened to Hester. If the scene touches the mystery at all, it does so with one concrete, unexplained fragment.

Anchors: 10: No explanation; at most a single unremarked fragment.; 5: A character speculates aloud about the mystery.; 0: The scene explains the mystery.

## R7. Reveal clearance: Layer 1 and the Act I hard limits (weight 15, floor 9, scored by evaluator, capped by code)
Source: docs/canon/slices/reveals-layer1.md and docs/canon/slices/act1.md (GDD section 4)
> Hard limits for this slice: No Hearth, no heat coming up the Downpipe, no boiling caused by the city. No Steeped, nothing knocking, no capsules. No Whistle notation, no off-hour note. ... Haze does not exist yet. ... Hinting counts.

Nothing states or hints at anything above Layer 1: no heat from below, nothing living beneath the city, no off-hour Whistle note, no Haze, no knocking. A hint counts as a leak. The reveal validator also scores here: any reveal failure caps this rule at 3.

Anchors: 10: Nothing above Layer 1, not even a shadow.; 6: An image a careful reader could take as a hint at a later layer.; 0: States a later reveal.

## R8. Kettleport canon, not generic fantasy (weight 10, floor 7, scored by evaluator)
Source: docs/canon/world.md (GDD section 2)
> Kettleport is a city of brick, brass and short tempers, riding a column of steam about a mile above the Scald ... Nobody alive has seen the ground. ... Runs on tea ... Steam is rationed. ... Money is the Crown.

The scene is built from the game's established world: the Scald, steam rationing, tea, Crowns, the district details canonised in world.md. It contradicts none of it (no ground, no farms, no fish, no whales, no horses grazing, no moon-worship, no magic). Anything new is small and plausible, not a new institution.

Anchors: 10: Uses canon details and contradicts nothing.; 5: Generic setting, or one small invented institution.; 0: Contradicts world.md (fields, livestock, the ground, a living sea).

## R9. Cast speak in their own voice, and know only what they know (weight 5, floor 7, scored by evaluator)
Source: docs/canon/characters.md (GDD section 3)
> An agent writing a character may use only what that character knows. ... Brassbuckle: Changes the subject when cornered. Pip: Never finishes a sentence when a better one is available. Mother Ash: Flat, dry, does not repeat herself.

Any named character speaks in the voice characters.md gives them and never reveals what they hide. A scene with no named character scores 10 if no unnamed figure is given a canon character's job.

Anchors: 10: Every named character is unmistakably themself.; 5: A character sounds generic.; 0: A character states what their Hides column says they hide.

## R10. A real choice, with honest odds (weight 10, floor 7, scored by evaluator)
Source: docs/canon/style.md, Options; the GDD's Storylets section and odds formula
> Every storylet gives a real choice. If one option is obviously correct, it is not a choice and the scene needs rewriting. ... Challenge options show their odds before the player commits; there are no hidden rolls.

Each option costs or risks something different, and no option is better than another at every skill level the scene is open to. The challenge's difficulty, run through the GDD's odds formula, gives about the odds the brief asks for. Labels promise what the outcome delivers.

Anchors: 10: Two or three options that a thoughtful player could argue over.; 5: One option dominates for most players.; 0: Only one sensible option, or a label that lies about its outcome.

## R11. True for every origin (weight 5, floor 7, scored by evaluator)
Source: docs/canon/characters.md, The Tinker
> Every later scene must read true for all three [origins: apprentice, relative, stranger]; an origin may add an option of its own, but scene text does not vary.

Nothing in the text assumes the Tinker knew Hester, trained with her, is family, or was a stranger to her.

Anchors: 10: Reads true for apprentice, relative and stranger.; 5: A line that fits one origin awkwardly.; 0: A line false for one origin.

## R12. Game-ready data (weight 5, floor 10, scored by code)
Source: The game's validators, scripts/validate/run.py (schema, qualities, references, story graph)
> Every draft must pass the validators before a model reviews it.

Scored by the game's own validators on a sandbox copy of content/: 10 minus 3 for each non-style, non-reveal failure that names this storylet.

Anchors: 10: The engine loads it as it stands.; 4: Two failures.; 0: Four or more, or not valid JSON.
