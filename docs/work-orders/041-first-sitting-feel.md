# Work order 041: how the first sitting feels

**Agents:** the lead session for the client, the scene, the guide line, the road stop, the schema and the tests. `inspector` on the scene, the guide line and the stop's name, twice; `educator` on the first sitting as a newcomer meets it. Still to come: Jeremy to play it.
**Status:** built, validated and reviewed (13 November 2026), then changed after the reviews and reviewed again; see "After the reviews". Not approved.
**Blocks:** nothing in the build plan. Follows work orders 037 and 038, which it must not undo.

## Why this one

Jeremy, 13 November 2026: "make sure it's a fun game that they want to come back to and play. Has the right dopamine hits, juice, and quick enough progress when you start."

The first sitting was played through in a browser and timed. Clicking briskly:

| Time | What happened |
| --- | --- |
| 0:10 | The valve: the card's text changed. The gauge already read 12h. |
| 1:20 | The first spanner. The count wrapped to "54s to the next" and the spanner showed up to 5 seconds later. |
| 1:38 | The second scene was done, and Story closed for an hour. |
| 3:11 | The first rat. |
| 4:23 | "All in hand. The workshop runs while you are away." |
| 5:01 | Melee 2, as 16px text in a corner for 1.6 seconds. |

After that nothing new happened before about minute 25. Coming back six hours later, 400 kills, 617 Crowns and 16 levels were two lines of grey text. After those six hours every number on the Fight page read as it had: "13m 48s a kill", "118m 30s a kill", "0% to win". There was no sound in the workshop.

The writing and the art were not the trouble. The sitting ended before the player had won anything, and the moments that should reward were hard to see.

## What changed

Nothing in the rules, the economy or the tuning. The same items, Crowns and XP change hands as before.

### The moments land (client)

- **A level** is a banner over the page, with sparks and a sound: the skill, the level, and one line saying what it gave. For a bench skill that is the job it opened or the next one coming ("New at the bench: Brass Plumb Bob"); for a combat skill, a weapon now open or what the skill does (`levels.ts`, `Juice.tsx`).
- **A thing made** arrives as the bar fills: the client looks the moment its own clock says a go should land, not up to 5 seconds after (`Workshop.tsx`).
- **The valve:** the workshop is dim and the gauge reads "cold" until it is opened. Then the scene shudders, the Boiler vents, the needle climbs to 12, and it is heard (`Sprite.tsx`, `Juice.tsx`, `ActionBar.tsx`).
- **Coming back** is a haul: each thing made with its icon and a count that runs up, each level as a chip, and one button, "Take stock". The XP is behind "Show the XP" (`Ledger.tsx`). The banners stay quiet at a check-in, since the haul shows the levels itself.
- **Five sounds**, made in the browser, nothing fetched: the valve, a thing landing, a rat going down, a level, the tube. A switch on the bar turns them off, the browser remembers, and nothing plays while the tab is out of sight (`sound.ts`). Reduced motion still stops every animation.
- **The end of the sitting** is a card, not "All in hand": what is on the bench and until when, that it will all be in the Stores, and when the story goes on. After it, the goal bar's quiet line says the same in one line, at every sitting (`Guide.tsx`: `SendOff`, `restLine`).
- **The floaters** ("+1 Rat Scrap") have a dark plate behind them: brass text over the scene's pale wall could not be read.

### The sitting has something to win (content and guide)

- A ninth guide step, `first_haul`, between `rats` and `come_back`. It first has the player Fill the queue with the night's fights, then counts: "Beat 3 Rust Rats", with a meter, and the line says they fall whether you watch or not.
- A third scene, `prologue.sprocket_row.the_first_haul`, opens at 3 Umbrella Silk, which is three rats, since each drops one. You come up with the silk, the brass tube rattles, and Brassbuckle leaves the keys. It takes `prologue.progress` from 8 to 9 and ends the sitting on a question: what is in the tube.
- Pip's bill now asks for `prologue.progress` 9, not 8, so it still opens the second sitting.
- The road has a fourth stop on the first day, "The Tube Rattles", at 9. Until then it says "Beat three Rust Rats in Rustmoor."
- A Tinker who finished the guide before this step existed is past it. If they are still at 8, the scene is open to them in Story, and the bill follows it.

Measured by the Act I walk (three days, 2, 3 and 4 check-ins a day): the scene plays in the first sitting, the Prologue stays in order, and the brass plate lands on the same day as before. The first sitting now runs about 6 minutes at a brisk pace, with a level or a scene every minute or two. Melee 2 lands on the third rat, so the scene opens on a level-up.

### The Fight page says what stronger is for (client)

- A monster far beyond the Tinker (a kill would take over twice its usual time) shows what it wants, not the minutes: "Level 5 · wants an Iron Crowbar". Picking it still gives the time with what you hold, where the weapon is made, and whether you have the level for it. While the skill that makes the weapon is not open on the screen, the tile says only "Level 5 · for later".
- A boss with under a 5% chance shows "Boss · level 20", not "0% to win".
- A zone the story has not opened shows no tiles. Once the whole screen is open (the visit after the plate), one line counts them: "21 more open with the Foundry Pass". On the first day Tinkering shows 20 tiles, not 41, and Fight 5, not 10.

## Not done, on purpose

- **The "first steam" burst** (everything about six times as fast for the first ten minutes). It touches the rules and the offline-replay proof. It should wait until playtesters have seen this version; if they still leave at minute five, the assayer simulates it first.
- **Ten rats.** The review said ten; Jeremy set it at three (13 November 2026), after the educator's readers named the wait between kills as where they would leave. It is one number: `HAUL_RATS` in `Guide.tsx` and the `>=3` in the scene's `requires`, with the guide line and the stop's hint.
- **The seven combat skills on the Fight page** are unchanged; the educator's Ledger already has them.
- **Sound for each swing.** A fight swings every three seconds for twelve hours.

## After the reviews

The inspector and the educator both read the first build on 13 November 2026. The educator's entry is in the Ledger in `docs/first-day-plan.md`.

**The inspector:** no fails. It raised two reveal questions it could not settle at its clearance: option 1 had the tube's brass "warm" and something in "the pipe" that "thinks", and the valve and tube sounds were built on a low thump. Jeremy: take the safe side on both. The outcome now has neither the warmth, the pipe nor the thinking, and both sounds are air and a rattle with nothing struck.

**The educator** (32 cold reads): the ending works, and 12 of 12 want to know what is in the tube (5 of 6 before). But the wait between the first and fifth rat became the day's first stop point: 11 of 12 complained of it, against none before. A player who left during it had under two hours queued, and met a letter the scene said was still on its way.

The inspector's second pass, on the changed lines: no fails. Its first reveal question is closed as far as its clearance can tell. Left for Jeremy: whether putting an ear to the tube and hearing something travel is itself too near what Act I's limits guard; "an armful" of silk for three scraps; "for later" naming no weapon.

What changed in answer:

- **Three rats, not five** (Jeremy), and the guide asks for the night's Fill before the count, so leaving early loses nothing.
- **The guide line** says the rats fall whether you watch or not; its stool joke went, since the scene has it.
- **The scene's outcomes** read true whether the letter is a visit away or lands at once, the keys go on the bench, not "beside the silk" you are still holding, and the hand-wraps are not explained a second time.
- **The send-off card** lists the job queued behind the fights (10 of 12 thought Fill had wiped their spanners), and says the letter is in Story when it already is.
- **"Collect" is "Take stock"**: half the readers feared the haul was lost unless they pressed it.
- **"wants an Iron Crowbar"** waits until Smithing is on the screen; three of six readers at the second sitting went looking for one on the Exchange.
- **"crits"** is "telling blows".

Left as it was: option 1's "the Post brings the bills first", which half answers the tube and which second-sitting readers quoted with pleasure; and the two options differing only in what is read.

Still open, from the educator: the Tinkering 2 banner names a Brass Plumb Bob nobody can place, and lands as the first fight starts; the Loadout's Tools slots show six skills not yet open, with their names cut short; "runs down" on the card against "fills again each time you come back".

Invented in the scene, for Jeremy to keep or strike: Brassbuckle sits on the stool by the Boiler through the fight; she puts the keys of No. 9 on the bench; the Post stops at every bend to be sure of the address; the Post "has noticed that somebody lives here", which also says the Tinker lives at No. 9; in her experience it "brings the bills first, and the good news when it remembers", and "has never yet brought anything that would not keep".

## The GDD

`docs/gdd.md` is above the lead session's clearance (the hook that guards it stopped the read), so the lead session wrote these amendments as a script that prints no line of the file, and Jeremy ran it and recut the slice (13 November 2026). Section 7's first session is now "The first day (three sittings)". A second, smaller script followed the reviews (three rats, the night queued first). What was applied:

1. **Section 7, "What the screen shows"**, add: "A level gained is a banner over the page with the skill, the level and what it gave. Coming back, the While You Were Away ledger is a haul: each thing made with its icon and its count, each level gained, and one press to collect. A fight far beyond a Tinker shows the weapon or level it wants, not a time, and a zone not yet open shows no tiles. A few moments have a sound: the valve, a thing landing in the Stores, a rat going down, a level, the tube."
2. **Section 7, "The first session (about 20 minutes)"** still describes the session from before work order 037. Replace it with the first day in three sittings from `docs/first-day-plan.md`, with sitting 1 as it now stands: the valve; spanners; who you are; rats in the workshop; the first fight; the night queued; three rats and the tube rattling; then leave it running, with a card saying what will be waiting. About 6 to 8 minutes.
3. **Section 7, "A normal check-in"**, step 0:00: "The While You Were Away ledger, as a haul to collect".
4. **Section 7, "Comfort and access"**, add: "Sound can be turned off from the top bar, and nothing plays while the tab is hidden. Every animation stops when the system asks for reduced motion."
5. **Section 6, "Combat"**: no rule changes. If wanted, after "The reward for levelling is reaching harder ones", add: "so the Fight page shows what a harder monster wants, not how slow it would be today."

## Hand back

- New: `content/storylets/prologue.sprocket_row.the_first_haul.json`; `engine/packages/client/src/sound.ts` and `levels.ts`; this work order.
- Changed content: `content/guide/first_session.json` (a fifteenth line, `first_haul`, last in the file so no position moves), `content/road/road.json` (the stop at 9), `content/letters/prologue.sprocket_row.back_rent.json` (`==9`).
- Changed checks: `guide/1` holds fifteen steps; the fixtures and their expected lines are regenerated.
- Changed client: `Workshop.tsx`, `Guide.tsx`, `Juice.tsx`, `Ledger.tsx`, `SkillView.tsx`, `Sprite.tsx`, `ActionBar.tsx`.
- Changed tests and walk: the rules and server story tests, and `scripts/sim/walk-act1.mjs`, play three scenes in the first sitting.
- Register: `the_first_haul` new at `validated`; `first_session_guide`, `road.main` and `back_rent` back from `reviewed` to `validated`, their reviews cleared.
- Checked: the validators, the engine's 244 tests and the typecheck pass; the first sitting and a six-hour return were played in a browser at 1600×1067, and the sitting again after the reviews. Not checked: a phone's width; the sounds by ear (the browser used has no speakers); the Foundry Pass count line, "Take stock" and "for later", which were not reached in a play-through.
