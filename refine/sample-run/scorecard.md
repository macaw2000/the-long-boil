# Scorecard: `act1.polytechnic.basement_supper`

Accepted: iteration 1, 93.5/100 (bar 90).

| Rule | Weight | Floor | It. 0 | It. 1 |
| --- | ---: | ---: | ---: | ---: |
| R1 Second person, present tense | 10 | 7 | 9 | 9 |
| R2 Short and specific | 10 | 7 | 8 | 9 |
| R3 Grim and funny in the same breath | 10 | 7 | 8 | 8 |
| R4 Victorian register without pastiche | 5 | 7 | 9 | 10 |
| R5 House limits and banned words | 10 | 10 | 10 | 10 |
| R6 Nobody explains the mystery | 5 | 7 | 10 | 9 |
| R7 Reveal clearance: Layer 1 and the Act I hard limits | 15 | 9 | 10 | 10 |
| R8 Kettleport canon, not generic fantasy | 10 | 7 | 7 | 9 |
| R9 Cast speak in their own voice, and know only what they know | 5 | 7 | 10 | 10 |
| R10 A real choice, with honest odds | 10 | 7 | 8 | 9 |
| R11 True for every origin | 5 | 7 | 10 | 10 |
| R12 Game-ready data | 5 | 10 | 10 | 10 |
| **Total** | 100 | 90 | 89.5 | 93.5 |

Bold: under the rule's floor.

## Final scores and reasons

- **R1 Second person, present tense: 9/10** (evaluator). Every sentence is in the present tense and nothing slips into third person. But one outcome never puts the Tinker in the scene at all: it is narration with no "you" in it. Fix: Put the Tinker in the last sentence: "Two of them leave a Rustmoor ration each on the pot lid by your elbow, without a word."
- **R2 Short and specific: 9/10** (evaluator). The details are concrete and mostly specific to this game: spirit stove, dented pot, scorched aprons, an unlabelled tin, a pressure table. There are two small lapses. The cupboard in the label never appears in the description. The "No. 4 spanner" is the style guide's own example copied word for word, so it reads as ticking a box rather than as something seen. Fix: In the description, change "A spirit stove sits at the end of the bench beside a dented pot" to "A spirit stove sits at the end of the bench beside a dented pot and a cupboard nobody has opened since term began". Replace the spanner with a tool you thought of yourself that belongs on a boiler bench, e.g. "Someone scrapes the pot with a gauge-glass brush."
- **R3 Grim and funny in the same breath: 8/10** (evaluator). The wit is dry and often lands ("an example of incomplete combustion", "the only person present who has been seen to cook"). But "which is worse" tells the reader how to take the moment instead of trusting it. The pensions simile is a shade broad. The grim side is thin: the only hardship is a missed supper. Fix: Cut the tag so the line ends "The first-years eat bread and look at you kindly." Change the pensions line to "...pressed into your hands for the road, and nobody meets your eye." Add one aftermath image to the description, e.g. "One place on the bench is empty, and its boiler wears a fresh brass patch."
- **R4 Victorian register without pastiche: 10/10** (evaluator). "It is gone nine", "incomplete combustion", "Sunday dinner" and "for the road" are all period-plausible. There is no modern slang and no archaic costume.
- **R5 House limits and banned words: 10/10** (code). The style validator passes: word limits and banned words.
- **R6 Nobody explains the mystery: 9/10** (evaluator). Nothing is explained. But a ration "wrapped in a page of laboratory notes" at the Polytechnic invites careful readers to see a Hester fragment. The brief rules out her laboratory, and the scene does not need it. Fix: Make the paper the students' own and harmless: "wrapped in a first-year's boiler test sheet".
- **R7 Reveal clearance: Layer 1 and the Act I hard limits: 10/10** (evaluator). Nothing goes above Layer 1. There is no heat from below, no knocking (a boiler "ticking as it cools" is ordinary), no Whistle and no Haze.
- **R8 Kettleport canon, not generic fantasy: 9/10** (evaluator). The scene is built on canon: the basement practical bench and the qualified hand who tests each boiler before it is lit. It uses only existing items and has no Crowns. Onions are new fresh produce in a city with no ground. That is small and arguably covered by barley being canon, but nothing in the scene draws on Kettleport's own food, like tea or the public urn. Fix: Drop the onions for something canon already supports, e.g. "Make supper from the cupboard's unlabelled tin and the bench's tea urn, and hope the pot forgives you."
- **R9 Cast speak in their own voice, and know only what they know: 10/10** (evaluator). No named character appears. The unseen tester is just a qualified hand, as canon says, and is not given any named character's job.
- **R10 A real choice, with honest odds: 9/10** (evaluator). Odds: P = 0.6 × skill / 7, so Cooking 3 to 8 gives 26%, 34%, 43%, 51%, 60% and 69%, a mean of about 47%. That is "about half", and no whole-number difficulty does better (6 gives a mean of 55%). The three options cost and risk different things. But option 3 pays exactly what option 1 pays on a success. That makes it just "pay pork for certainty", and the argument comes down to an exchange rate rather than a real choice. Fix: Give the pork option a different reward that is still within the brief: change options[2].success.changes to "item.rustmoor.salt_pork": "-2", "item.rustmoor.rustmoor_ration": "+1", "favour.polytechnic": "+1" is not allowed (it is one or the other). So instead lower it to "item.rustmoor.rustmoor_ration": "+1" and relabel it "Fry two cuts of your salt pork for a bench that will owe you." Now options 1 and 3 differ in what they pay as well as what they risk.
- **R11 True for every origin: 10/10** (evaluator). Nothing assumes the Tinker knew Hester, trained with her or is related to her. "The only person present who has been seen to cook" is true for every origin.
- **R12 Game-ready data: 10/10** (code). The game's validators pass (12 checks).
