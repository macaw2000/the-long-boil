# The Long Boil: Game Design Document, Extended Edition

Oct 19, 2026 · @Jeremy

## About this edition

This is the long version of The Long Boil's design. The five-page first draft (16 October 2026) is the summary for busy readers; this edition is the working design for me, the agents, and anyone who wants the whole picture. Where the two disagree, this edition wins.

It adds two things the draft lacked: a real story, told through storylets in the tradition of Failbetter Games' Fallen London and Sunless Skies, and a costed AWS rollout from first commit to public launch. Mechanics from the draft carry over unchanged unless a section says otherwise.

| Part | Sections | Read it if you want |
| --- | --- | --- |
| The game | Executive Summary, World and Setting, Factions and Characters, Storyline, Narrative Systems | What the player experiences and why it hangs together |
| The systems | Game Mechanics, Player Experience, Monetization | How the idle loop, the story, and the economy interlock |
| The build | AI Architecture, Technical Strategy, AWS Architecture and Rollout, Production Plan | Who and what builds it, on what, and for how much |
| Reference | Appendices | Sample storylets, glossary, cost detail, sources |

## 1. Executive Summary

**The Long Boil** is a steampunk idle MMO for web and phone with a story worth checking in for. Kettleport has ridden a column of steam above a boiling sea for 312 years, and nobody in charge will say why the sea is still boiling. You are a Tinker who inherits a cold workshop on Sprocket Row from Hester Vane, a Tinker who vanished with a notebook full of questions. Your work continues for 12 hours while you're away, and when you come back, the city has written to you.

**The core loop.** Every 3 to 5 minute check-in has two halves. The idle half is unchanged from the first draft: collect what your Tinker made, craft it up a chain or sell it on the Brass Exchange, gear up, and queue the next 12 hours. The story half is new: read the letters the Pneumatic Post delivered, then spend Nerve, a story-action budget that refills while you're gone, on storylets whose options open as your skills rise. A Tinker with Tinkering 30 can pick a lock that a Tinker with Tinkering 10 can only stare at.

- **Win condition:** an idle game never ends, so there is no single win. Players win in three layers: personal progress (levels, gear, leaderboard ranks), personal story (reaching the ending of the Ambition they chose), and city story (their guild's side carrying the season's Reckoning, which changes Kettleport for every player).
- **Loss states:** a knockout (60-second respawn, then the queue resumes), a lost boss fight (the attempt is spent), a failed calibration (gear falls to +0 unless protected), and, new in this edition, a redlined Needle. Push Scald, Arrears, Notice, or Haze to 8 and the story sends you somewhere unpleasant until you talk, pay, or think your way out. Story losses never touch your queue or your inventory.
- **Business:** free to play. Stripe-sold Gilded Cogs buy time savers and cosmetics. Nothing is exclusive to paying players, and no story is ever sold.

**Design pillars.**

1. **Progress while you're gone.** Every system, the story included, assumes the player is away for most of the day.
2. **Every skill opens a door.** The 16 skills double as the story's challenge stats, so grinding Smithing is how you earn the right to argue with a foundry.
3. **A city with a secret, told slowly.** The mystery comes apart in layers across acts and seasons. The answer to "why does the sea boil" is not in Act I, or Act II.
4. **A real economy.** Drops, fights, and trades stay deterministic and replayable. Story rewards are mostly bound to the player, so the narrative never floods the market.
5. **Fair to free players.** Anything Cogs buy can be bought from other players with Crowns.

| At a glance |  |
| --- | --- |
| Genre | Idle MMO with storylet narrative |
| Platform | Web (installable PWA) at launch; iOS and Android later from the same Expo codebase |
| Session | 3 to 5 minutes, 2 to 4 times a day |
| Capstone content | Prologue and Acts I to III, 3 zones up to level 70, 16 skills, 190 storylets |
| Audience | Adults who play idle games at a desk and on a phone, and narrative fans who like their stories in short, regular doses |
| Narrative touchstones | Fallen London and Sunless Skies: storylets, menaces, mysteries revealed over months |
| Built by | One developer (me), six Claude agents, and AWS |

## 2. World and Setting

Kettleport is a city of brick, brass, and short tempers riding a column of steam about a mile above the Scald, a white sea of boiling vapour that covers the world. Nobody alive has seen the ground. The city has been climbing for 312 years, and the official explanation fits on a commemorative teaspoon.

### The official story

In the Year of the Lift, the sea around the harbour town of Kettle's Reach began to boil. Seven engineers, remembered as the Seven Gauges, sank an iron shaft called the Downpipe into the seabed, built the Great Kettle on top of it, and rode the rising steam into the sky with the town bolted to their boilers. Their heirs sit on the Board of Gauges. Every morning they read the city's great pressure gauges and decide how high Kettleport flies.

The Brass Gazette prints the day's Gauge Reading on its front page. It is always reassuring.

### What everyone knows and nobody says

- **The Scald is rising.** Every year the vapour climbs a little, and every year the city climbs to stay ahead of it. Old Stokers swear the Scald used to sit further down, and that it used to be quieter.
- **Ballast Day.** When the Kettle can lift no more, the Board declares a Ballast Day: a district is emptied, unbolted, and dropped into the Scald so the rest of the city can rise. The last one was 41 years ago. The Lowvents, the lowest and poorest ring, has never been ballast, but everyone there knows which way gravity works.
- **Steam is rationed.** Every workshop draws steam from the Kettle's mains through a metered Boiler, and the Board licenses the hours. That is why a Tinker's work stops when the Boiler runs dry, and why Boiler licenses are worth paying for. It is also the in-world reason for the 12-hour offline cap.
- **The dead go up the flue.** There is no ground to bury anyone in. Kettleport's dead are carried to the Cinderworks and given to the furnaces with a short service and a long whistle. Helping keep the city aloft is the highest honour a citizen can earn. Asking about the soot is considered rude.

The Storyline section holds the truth and the schedule for revealing it. The short version, for the team only: the city did not escape the Boil. The city is the Boil.

### Daily life

Kettleport runs on tea. Water is the one thing the city has too much of, every corner has a public urn, and a good Tea Blender is treated like a minor saint. Time is kept by the Great Whistle, which sounds the hours from the Kettle-heart; nobody admits that it sometimes sounds a note that is not on the hour.

The money is the Crown, a heavy brass coin stamped with a gauge needle. Gilded Cogs are Counting-House certificates that most citizens hold and few understand. Weather arrives from two directions: fog rises from the Scald, and storms roll down from the Thunderhead, where the sky is full of lightning and people who want to sell it to you.

The city is stacked like an upturned wedding cake. Gaugehill sits on top, the Kettle-heart burns at the core, the working districts ring the middle, and the Lowvents hang off the bottom rim, close enough to the Scald that the windows sweat.

### Places

| Place | Kind | Act | What happens there |
| --- | --- | --- | --- |
| Sprocket Row | Home district | Prologue onward | Your inherited workshop at No. 9, the Pneumatic Post terminal, neighbours with opinions |
| The Polytechnic | District | Prologue, I | Professor Brassbuckle's lecture halls and Hester Vane's sealed laboratory |
| The Brass Exchange | District | All | The trading floor and the Counting-House, where Silas Tallow keeps the books and collects Arrears |
| The Lowvents | District | I, II | Stokers' tenements on the bottom rim, hot fog, the Stokers' Fellowship hall |
| Chapel of the Steady Flame | District | II | Whistled hymns, Deacon Hale, and an archive of very old whistle notation |
| Gaugehill | District | II, III | The Board's chamber, the Great Gauges, Gauger headquarters, the Valve Gaol |
| Rustmoor Scrapyards | Combat zone, levels 1 to 20 | I | The city's tip, slung on chains off the outer rim; Rust Rats and Scrapjaw |
| Cinderworks Foundry | Combat zone, levels 20 to 45 | II | The furnaces around the Kettle-heart; Soot Wraiths and Old Bellows |
| Thunderhead Reach | Combat zone, levels 45 to 70 | III | The storm layer above the city; Storm Harpies and the Lightning Baron's aerie |
| Dreadnought Hangar | 5-player dungeon, 70+ | IV, after the capstone | Beneath Gaugehill, where the Board is building something it calls a precaution |
| The Downpipe | Expedition | V, after the capstone | The iron shaft from the Kettle-heart to the seabed |

### Tone and voice

Kettleport is grim and funny in the same breath. The rules below live in the style guide that both the Scrivener and the Inspector read, so they are enforced on every storylet.

- Second person, present tense: "you", never "the player".
- Short and specific: a storylet's description runs 120 words at most, each option 25, each outcome 150. A "No. 4 spanner" beats "an old tool".
- Dry wit over gore. Terrible things happen offstage and are described by their aftermath.
- Victorian register without pastiche: no "forsooth", no modern slang, no real-world politics.
- Nobody explains the mystery. Truth arrives in fragments: a ledger page, a whistle note, two gauges that disagree.
- Banned outright: "tapestry", "testament to", "delve", "a sense of", "little did you know", and any sentence that explains its own joke.

### Visual language

The draft's 48×48 pixel sprites in brass, copper, and verdigris stay. The story adds 40 reusable 96×96 vignettes, one per character and location, rather than unique art per storylet, which would not fit a semester. The Needles show on screen as well as on the character sheet: Scald reddens the frame's edges, Haze adds a slow shimmer to the UI as it climbs, Notice puts a Gauger's whistle in the corner, and Arrears tarnishes the Crown icon.

## 3. Factions and Characters

Eight factions want something from Kettleport's Tinkers, and every one of them is partly right. Players earn Favour with a faction (0 to 7) through its Work Orders, its storylets, and its guild contracts. Favour opens that faction's storyline, titles, and cosmetics; it never buys power on the Exchange.

### Factions

| Faction | Leader | Base | Wants | Fears | Favour opens |
| --- | --- | --- | --- | --- | --- |
| The Board of Gauges | Lord Septimus Gauntlett, First Gauge | Gaugehill | A calm city that keeps rising | Panic, and anyone who reads a gauge for themselves | Gaugehill storylets, the Board's Ballast deliberations, formal dress |
| The Stokers' Fellowship | Mother Agatha Ash | The Lowvents | Safe vents, fair steam, no Ballast Day for the Lowvents | Being next | Fellowship hall, the Stokers' oral history, soot-black work coats |
| The Counting-House | Silas Tallow | The Brass Exchange | Your business, your debts, stable prices | Anything it cannot put a price on | Private ledgers, debt-forgiveness storylets, a gilded monocle |
| The Chapel of the Steady Flame | Deacon Prosper Hale | The Chapel | The flame kept and the faithful calm | The Great Whistle falling silent | The hymnal archive, the first whistle notations |
| The Gaugers | Inspector Mabel Rook | Gaugehill | Order, and quietly, the truth | What the city will do once it knows | Case files, ways to lower Notice, a Gauger's whistle |
| The Polytechnic | Professor Ottoline Brassbuckle | The Polytechnic | Answers and funding, in that order | Hester's research falling into the Board's hands | Hester's sealed laboratory, research storylets |
| The Vapourists | The Diver (masked) | Nowhere you can find | To go down the Downpipe and see | The Board, and being right | Illegal diving gear schematics (story items), the Fathom Ambition's later chapters |
| The Thunderhead | Baron Corvin Strake, the Lightning Baron | His aerie in Thunderhead Reach | A city free of steam, run on lightning, run by him | Being dull | Storm-tapping storylets, the Baron's flight jackets |

A ninth people, the Steeped, are absent from this table on purpose. Players first hear of them in Act III, as knocking from inside the Downpipe.

&#91;embedded content: faction map · 8 factions on 2 questions\]

The three filled dots are the sides in Season 1's Reckoning, and a guild's charter puts it behind one of them. The others pull players toward a side through their storylines and Work Orders.

### Characters

| Character | Who they are | What they want from you | What they are hiding |
| --- | --- | --- | --- |
| Professor Ottoline Brassbuckle | Polytechnic engineer, your tutor in the Prologue, Hester's oldest colleague | To keep you safe and busy | She reported Hester to the Gaugers to stop her going down the Downpipe. Hester went anyway. |
| Hester Vane | The Tinker who held No. 9 Sprocket Row before you; heard only through Ledger Pages until Act V | Someone to finish her work | She found the Steeped, and she is not dead |
| Pip Tumbler | A Lowvents courier of uncertain age who runs the Pneumatic Post on Sprocket Row | Wages, tea, gossip | Pip's family is first on the Ballast list |
| Mother Agatha Ash | Head of the Stokers' Fellowship | Tinkers who can fix the Lowvents vents | Stokers have heard words in the Whistle for generations and kept it from the Chapel |
| Lord Septimus Gauntlett | First Gauge of the Board | Calm, obedience, a clever Tinker in his pocket | The Board has known for two centuries that the Kettle boils the sea, and keeps two sets of gauges |
| Silas Tallow | Master of the Counting-House | Your custom and your debts | The Counting-House trades futures on which district goes over the side next |
| Inspector Mabel Rook | The Gaugers' most honest officer | The truth, filed properly | She found Hester's last letter and never filed it |
| Deacon Prosper Hale | Chapel of the Steady Flame | Your soul, kept warm | The oldest hymns are transcriptions of the Whistle, and they are a warning |
| Mrs. Evangeline Inkwell | Editor of the Brass Gazette | A story nobody else has | She prints the Board's Gauge Reading under protest and keeps the real one in a drawer |
| Scrapjaw | Act I boss: a king the Rust Rats built from the city's rubbish | More rubbish | Hester hid the first Ledger Page inside its chest |
| Old Bellows | Act II boss: the Foundry's first bellows-engine, three centuries old and half awake | To stop | It speaks the Whistle's language, and its last breath is the first sentence a player can translate |
| Baron Corvin Strake | Act III boss: the Lightning Baron | An audience, then a partner | His storm-taps drag lightning down into the Scald, onto people he did not know were there |

**Locked for the team, never for players:** the Diver is Mrs. Inkwell. The reveal belongs to Season 2, and no agent may write a storylet that implies it.

### How the cast is used

Every recurring character has a vignette, a voice note in the style guide (Gauntlett never raises his voice; Tallow speaks in prices; Pip never finishes a sentence when a better one is available), and a list of facts they know and do not know. The Scrivener writes a character's lines only from that list, so a minor storylet can never make Brassbuckle confess in Act I.

## 4. Storyline

The story is a mystery with a slow fuse: a Tinker follows a missing woman's notebook and learns, one act at a time, that Kettleport is not fleeing the boiling sea but causing it. Each act is bound to one combat zone and ends on that zone's boss, so the story and the grind arrive together. The capstone ships the Prologue and Acts I to III; Acts IV and V and the season finales follow.

&#91;embedded content: story roadmap · 6 acts, 3 gates, 4 reveal layers\]

The bottom row is the reveal schedule from the table below, set against the acts. Layer 5 is held back for Season 3 or later.

### The truth, and when players learn it

This table is for the team. Players get it in fragments, and the Inspector rejects any storylet that reveals a layer before its act.

| Layer | The truth | Revealed in | Through |
| --- | --- | --- | --- |
| 1 | The Board posts false Gauge Readings. The Scald has risen 70 fathoms in 11 years, not the 6 the Gazette admits. | Act I | Ledger Page 1, from Scrapjaw's chest |
| 2 | The Great Kettle draws heat up the Downpipe from an engine on the seabed, the Hearth. Drawing on it is what boils the sea. The city is the Boil. | Act II | Old Bellows' last breath and Ledger Page 9 |
| 3 | People live down in the Scald: the Steeped, descendants of those left behind at the Lift. | Act III | Brass capsules knocking up the Downpipe |
| 4 | The Hearth was built, long before the Lift, to keep a freezing sea from icing over. The Seven Gauges took it and ran it far too hot to lift their town. "The fire was lent. The loan is due." | Act V, Season 2 | Hester, in person |
| 5 | Who built the Hearth, and what it was really for | Season 3 or later | Deliberately unwritten until the community has its theories |

### Prologue: No. 9 Sprocket Row (levels 1 to 5, the first session)

You arrive with a solicitor's letter: the tenancy of No. 9 Sprocket Row, "contents included", is yours. The workshop is cold and the Boiler is sealed with Gauger tape. Professor Brassbuckle appears, by what she insists is coincidence, unseals it with a Board licence for 12 hours of steam, and walks you through the draft's copper-to-spanner chain.

Pip Tumbler delivers your first pneumatic letter, which is a bill. The Rust Rats of Rustmoor have been stealing from Sprocket Row, so your first fight pays for itself, and your first sale, at the Counting-House's buying window, settles the bill. The Prologue ends when you find a brass plate under the workbench, scratched with a gauge reading that does not match today's Gazette. Brassbuckle sees it and changes the subject. Ten storylets, all written by me.

### Act I: The Gauge Lies (Rustmoor Scrapyards, levels 1 to 20)

*Someone is lying about how high the city flies, and Hester Vane found out.*

1. **The Altitude Review.** The Gazette announces a routine review of the city's altitude. In the Lowvents, everyone knows "review" means Ballast. Pip's family is on a list that does not officially exist.
2. **The sealed laboratory.** Hester's lab at the Polytechnic is locked and Brassbuckle will not discuss it. A Tinkering check opens a drawer; inside, an index card reads "R.S. The Rats have it."
3. **Rubbish with signatures.** Everything thrown off Gaugehill lands in Rustmoor, Board paperwork included. Scavenging checks turn up torn gauge charts in the Rust Rats' nests.
4. **A vent in the Lowvents.** Mother Ash wants a broken vent fixed (Smithing or Tinkering). From the bottom rim you take your own reading of the Scald. It disagrees with the Gazette by 40 fathoms.
5. **Notice.** Inspector Rook starts appearing wherever you have just been. Cooperate and she becomes an ally with questions; evade and Notice climbs.
6. **Scrapjaw.** The Rust Rats' king is built from three centuries of the city's rubbish. Defeating it drops Scrapjaw's Cleaver, as in the draft, and Ledger Page 1, bound to the player.
7. **The page.** Hester kept two columns: the Board's posted readings and her own. The Scald has risen 70 fathoms in 11 years. The Gazette says 6.
8. **What you do with it.** Give it to Mrs. Inkwell, Inspector Rook, or Lord Gauntlett (who thanks you warmly and offers a Boiler licence), or keep it. Each choice raises one faction's Favour and colours later scenes. None of them locks content.

Entering the Cinderworks needs a Foundry Pass, and Act I hands you one along whichever road you chose: a Stokers' token, a Board pass, or a pass bought from Silas Tallow. Act I closes with your Ambition.

### Act II: What the Furnace Eats (Cinderworks Foundry, levels 20 to 45)

*The Kettle does not ride the steam. It pulls it up from somewhere, and the furnaces want more than coal.*

1. **Shift work.** You take a Stokers' shift in the Cinderworks. The Soot Wraiths are shapes in the smoke that are mostly harmless, until they are not. The Chapel calls them the faithful dead, rising. The Stokers call them the furnace's breath.
2. **The wrong note.** You hear the Great Whistle sound off the hour. Haze enters the game here: every storylet that listens to the Whistle raises it.
3. **The hymnal.** Deacon Hale opens the Chapel archive to Tinkers with enough Favour or a fine enough tea. The oldest hymn's notation matches the off-hour note exactly.
4. **What the Stokers know.** Mother Ash admits the Stokers have always heard words in the Whistle. The commonest one is "enough".
5. **Below the Kettle-heart.** A maintenance hatch leads to the top of the Downpipe. The heat is coming up, not going down. Something is burning on the seabed.
6. **Old Bellows.** The Foundry's first bellows-engine fights like a cornered animal. When it falls, its last breath runs through every pipe in the Foundry. Players who have gathered 3 or more Whistle notations can translate it: "The fire was lent. The loan is due."
7. **The page.** Ledger Page 9 is one line in Hester's hand: "The Kettle isn't lifting us off a boiling sea. The Kettle is boiling the sea."
8. **Ballast Day is called.** The Board names the Lowvents. Guilds begin choosing sides for the season's Reckoning, and Hester's last page in the act says she went down the Downpipe in a gondola she borrowed from the only man who builds storm-proof ones.

### Act III: Lightning Down (Thunderhead Reach, levels 45 to 70)

*The Lightning Baron offers the city a new fire, and you need his gondola to follow Hester down.*

1. **The kite-lift.** Thunderhead Reach is reached by kite. The Baron's invitation arrives before you do.
2. **The pitch.** Baron Strake taps storms and wants to run Kettleport on lightning, with himself in the Board's chairs. He is charming, half right, and offers you a partnership.
3. **Storm Harpies.** The taps breed them. Every tap you help build makes the zone a little more crowded.
4. **Knocking.** When lightning is drawn down through the Scald, something in the Downpipe starts knocking. Brass capsules come up the shaft carrying letters in an old dialect. The Steeped exist, and the storms are falling on them.
5. **The Baron's answer.** Told about the Steeped, the Baron reacts according to your earlier choices: guilt if you partnered with him, contempt if you did not.
6. **The Lightning Baron.** The semester's final boss. He drops the draft's Coil Staff and a bound Gondola Schematic.
7. **The last capsule.** It is in Hester's handwriting: "They're alive down here. Don't let the Board finish the Dreadnought." On the same day, the Gazette's front page shows the Iron Dreadnought, built to go down the Downpipe and "seal it from below". The capstone ends here.

### After the capstone

- **Act IV: Precaution (Dreadnought Hangar, 70+).** The 5-player dungeon from the draft, now a guild story: get aboard the Board's ship before it launches.
- **Act V: The Downpipe.** A new expedition system in the spirit of a long voyage: multi-day descents with supplies, Haze, and ports built in the Scald by the Steeped. Hester is waiting at the bottom, and so is Layer 4.

### Ambitions

At the end of Act I every player picks one of four Ambitions: a long personal storyline that runs beside the acts and ends in Act V. Switching later costs a long, Nerve-hungry storylet, so the choice matters but never traps anyone.

| Ambition | The question | Leans on | Ending |
| --- | --- | --- | --- |
| The Gauge | Can you change the city from inside? | Exchange net worth, Calibrating, Board Favour | You take a new Eighth Seat on the Board and cast a deciding vote |
| The Lantern | Where did Hester go? | Combat, Scavenging, Ledger Pages | You find her at the bottom of the Downpipe |
| The Ember | Who should own the fire? | Smithing, Guild Contracts, Stokers' Favour | The Fellowship takes the Kettle-heart, and you read its first honest gauge |
| The Fathom | What is down there? | Tinkering, Aetherics, Vapourist Favour | You build the first diving bell and bring a Steeped envoy up |

### Seasons and the Reckoning

The city's story moves in seasons of about 10 weeks. Each season poses one question that the whole server answers in a Reckoning. Guilds pledge to a side by completing that faction's Guild Contracts, and solo players pledge through Work Orders. Each player's pledge is capped, so whales and bot farms cannot buy an outcome.

The result is permanent. The Brass Gazette prints it, the affected district changes, and some characters live or leave. No combat zone, item, or player asset is ever destroyed by a Reckoning; outcomes change story districts and the people in them.

Season 1's Reckoning, the Altitude Review, runs from the end of Act II through public beta. It has three sides:

- **The Board:** ballast the Lowvents and the city rises 400 feet. The Lowvents storylets move to a wreck hanging on chains below the rim.
- **The Stokers:** strike. The Kettle runs cooler, the city holds its height and starts, very slowly, to sink.
- **The Thunderhead:** accept the Baron's lightning. The city rises without ballast, and the storms fall on the Steeped.

Whichever side wins, Season 2 opens with its consequences, and the losing sides' factions do not forget.

## 5. Narrative Systems

The story runs on the same rhythm as the idle game: it refills while you are away and is spent in a few minutes when you return. Three systems carry it. Nerve limits how much story you can play per check-in, the Pneumatic Post deals you short letters between check-ins, and qualities (numbers attached to your Tinker) decide which storylets you can see and how likely you are to succeed.

### Qualities: one model for everything

Every fact the story can check is a quality, a named integer on the player's record. Skills, items, Favour, Needles, and story progress all use the same model, so a single requirement language covers them.

| Quality type | Examples | Range | Where it comes from |
| --- | --- | --- | --- |
| Skills | Tinkering, Tea Blending, Aetherics | 1 to 100 | The idle loop, unchanged from the draft |
| Items | Brass Ingot, Safety Valve, Ledger Page 1 | 0 to any | Drops, crafting, storylets |
| Favour | Stokers' Fellowship, the Board | 0 to 7 | Work Orders, storylets, Guild Contracts |
| Needles | Scald, Arrears, Notice, Haze | 0 to 8 | Failed or risky storylets |
| Progress | Act I progress, Ambition: the Lantern | 0 to 100 | Storylets |
| Lore | Whistle notations, Ledger Pages collected | 0 to 24 | Storylets, boss first-kills, rare drops |
| Flags | Gave Page 1 to Inkwell, Partnered with the Baron | 0 or 1 | Choices |

### Storylets

A storylet is one small scene: a location, requirements, a description of 120 words or fewer, and 2 to 4 options. Each option is either certain or a challenge, and each outcome changes qualities. Storylets are data, not code. They ship in the same versioned config store as items and monsters, so a new chapter goes live without a deploy.

```json
{
  "id": "act1.lowvents.vent",
  "location": "lowvents",
  "requires": { "act1.progress": ">=30", "favour.stokers": ">=1" },
  "nerve": 1,
  "options": [
    { "label": "Patch the vent with brass plate",
      "challenge": { "quality": "smithing", "difficulty": 15 },
      "success": { "favour.stokers": "+1", "act1.progress": "+10" },
      "failure": { "needle.scald": "+2" } },
    { "label": "Read the Scald on your own gauge",
      "requires": { "item.pressure_gauge": ">=1" },
      "success": { "flag.own_reading": 1, "act1.progress": "+10" } }
  ]
}
```

Challenge odds use one formula everywhere, and the button shows the odds before you commit, just as Calibrating does.

```latex
P(\text{success}) = \min\left(1,\ \max\left(0.1,\ 0.6 \times \frac{\text{skill}}{\text{difficulty}}\right)\right)
```

A Tinker with Smithing 15 facing difficulty 15 has a 60% chance; at Smithing 25 the vent is certain. Rolls use the same seeded RNG as combat and are written to the player's event log, so every story result is replayable and auditable.

### Nerve

Nerve is the story's action budget. It caps at 10, refills by 1 every 36 minutes (full in 6 hours), and keeps refilling while you are offline. Most storylets cost 1 Nerve; the big act climaxes cost 2 or 3. A player who checks in three times a day gets roughly 25 to 30 story actions, about one act's worth of scenes in five days.

Cogs can buy a Night Lamp that raises the cap to 14, which helps players who can only check in twice a day. Cogs never buy Nerve itself and never unlock a storylet.

### The Pneumatic Post

Between check-ins, letters arrive by pneumatic tube. You hold up to 3, and a new one arrives every 2 hours, so 6 hours away fills your hand. Each letter is a short storylet, usually one or two actions: a neighbour's request, a summons, a rumour, a bill. Letters are drawn from a deck weighted by where you are and what you have done. Discarding one is free.

The Post is also where the idle game talks to the story. If your queue smelted 400 Brass Ingots overnight, a Stoker may write asking for 20 of them, at a price and with a favour attached.

### The Four Needles

The Needles are the story's risks, drawn as four small dials on the character sheet. Each runs from 0 to 8, falls by 1 every 24 hours on its own, and falls faster through storylets. At 8, the Needle is redlined and the story sends you somewhere you would rather not be.

| Needle | Rises when you | Lowered by | Redline sends you to | How you get out |
| --- | --- | --- | --- | --- |
| Scald | Fail physical risks: vents, furnaces, rooftops | Rest, Cooking rations used in story | The Infirmary of St. Pinion | Recover over several storylets, or charm the night nurse |
| Arrears | Borrow, bribe, or lose a deal | Paying Crowns at the Counting-House | The Debtors' Gallery | Pay, work it off, or find Tallow a secret worth more than your debt |
| Notice | Break locks, meet Vapourists, ask the wrong questions | Inspector Rook's goodwill, lying low | The Valve Gaol | Talk, bribe (raising Arrears), or break out with Tinkering |
| Haze | Listen to the Whistle, read Downpipe capsules, translate | Calming teas from Tea Blending, Chapel services | The Quiet Rooms, a sanatorium in Gaugehill | Recover, or stay and learn notations taught nowhere else |

Two rules keep Needles fair in an idle game. First, they only touch the story: a redlined Tinker keeps smelting, fighting, and trading as normal. Second, curiosity has a price but is never a trap. Some Whistle notations can only be learned in the Quiet Rooms, so a few players will redline Haze on purpose.

Paying off Arrears in Crowns is also a new Crown sink, and the Assayer tracks it alongside Calibrating and Exchange tax.

### Ledger Pages and the Commonplace Book

Hester's notebook is the spine players can hold. The capstone holds 24 Ledger Pages: 3 from boss first-kills, 9 from storylets, and 12 as rare zone drops (4 per zone). Each zone drop has a pity timer that guarantees the next page within 500 kills, so nobody grinds forever for a story beat. Pages are bound to the player and read in Hester's Ledger, a screen styled as her notebook. Every lore fact a player uncovers is written into the Commonplace Book, a re-readable codex.

### Story rewards and the economy

Story is a faucet like any other, so its rewards are sorted by how much they can move prices.

| Reward | Tradable | Examples | Economic guardrail |
| --- | --- | --- | --- |
| Keepsakes | No | Ledger Pages, Hester's spanner, titles | None needed |
| Cosmetics | No | Soot-black work coat, gilded monocle | None needed |
| Curios | Yes | A Board memo in a rat's nest, a hymn sheet | Low volume; NPC collectors buy them for Crowns, capped per player per week |
| Story schematics | Bound recipes | Gondola fittings, Chapel incense | Make cosmetic gear or consumables, never stat upgrades over Exchange gear |

### Guild charters

At the start of each season a guild may take one faction's charter. The charter gives the guild a shared storyline whose progress bar fills from Guild Contracts, a changed guild-hall vignette, and that faction's side in the Reckoning. A guild can change its charter once per season, with a storyline explaining why its members suddenly feel differently about the Board.

### The Brass Gazette

The Gazette is the story's public face, written daily by the Chronicler agent from game data and the canon. Each edition carries the official Gauge Reading (which becomes a running joke once players know Layer 1), Exchange movers, player feats from opt-in names, Reckoning standings, and letters to the editor from the cast. Mrs. Inkwell's editorials hint at things she is not supposed to know.

## 6. Game Mechanics

The idle game is the draft's, unchanged in its numbers; what is new is that every system now feeds the story or is explained by it. You queue an action and a count, and the server works through it online or off: queue, collect the haul, craft it up a chain or sell it, equip or calibrate gear, unlock a harder zone, queue again. A first chain: smith brass, tinker a Brass Spanner, fight Rust Rats.

### Skills

Sixteen skills, each levelled 1 to 100, feed the loop. Each one is also a story stat, so the table's last column is what the Scrivener may check a skill for.

| Skill | Group | Produces | Story uses it for |
| --- | --- | --- | --- |
| Prospecting | Gathering | Ore and gems | Reading metal and stone, finding seams in Rustmoor |
| Lumbering | Gathering | Timber from the rim's Hanging Groves | Climbing, rigging, anything at height |
| Scavenging | Gathering | Wreck salvage | Searching, finding what was thrown away |
| Smithing | Production | Plate and blades | Repairs, forcing things open, Stoker work |
| Tinkering | Production | Tools, rifles, keys | Locks, machines, the Polytechnic |
| Tailoring | Production | Coats and goggles | Disguise, dress, getting into Gaugehill |
| Cooking | Production | Healing rations | Hospitality, lowering Scald |
| Tea Blending | Production | Buff teas and tonics | Persuasion, the Chapel, lowering Haze |
| Calibrating | Special | Gear +1 to +20 | Reading gauges, catching lies in numbers |
| Vitality | Combat | Hit points | Enduring heat and hard nights |
| Pressure | Combat | Steam-driven force | Pushing people and valves |
| Precision | Combat | Accuracy and crits | Fine work under stress |
| Melee | Combat | Close damage | Intimidation, brawls |
| Fortitude | Combat | Defence | Holding your nerve at the Board |
| Marksmanship | Combat | Ranged damage | Rooftop chases, the kite-lift |
| Aetherics | Combat | Storm and steam magic | The Whistle, the storms, the Downpipe |

Alchemy arrives after the capstone as the seventeenth skill.

All sixteen skills share one XP curve; no skill is cheaper to level than another. The curve is logarithmic in feel: each level costs more than the last, so early levels come quickly and late ones do not. The first few levels are cheaper still, so a new Tinker's total level passes 50 within two days. Offline progress counts exactly as time at the keyboard does, so a zone's two weeks are two weeks of a player's life, not of their attention. Harder actions pay more XP per hour than early ones, which is what keeps each zone's level band near two weeks even as levels grow dearer. Combat XP goes mostly to the main combat skill a loadout is built around, and a zone's level band refers to that skill. The curve runs unchanged to level 100, past anything the capstone needs. Two weeks per zone is the pace of a balanced player who splits the queue between combat and crafting; a player who fights around the clock moves about twice as fast, and that is fine. Within a zone, later actions pay a little more XP per hour than early ones while the zone's average holds: in Rustmoor, the first actions pay slightly under a Brass Ingot's rate and the later ones slightly over.

### Offline play: the Boiler

Logging off leaves 12 hours of steam, shown as a pressure gauge; at zero your Tinker stops until you return. The queue holds two actions ("smelt 400 ingots, then tinker 50 spanners"), and a While You Were Away ledger greets you on return. In the story, the Boiler is a Board steam licence, which is why its hours can be upgraded and why the Board can, in Season 2, threaten to revoke them.

### Combat

Combat is automatic: pick a zone, a loadout, and triggers ("eat a Ration below 40% HP"), then watch or walk away. Monsters are weak to Melee, Marksmanship, or Aetherics, so loadouts matter. A knockout respawns in 60 seconds and resumes the queue, so offline hours are never wasted. Bosses are fought on purpose: a boss attempt is a separate queue item, and a lost fight spends the attempt.

| Zone | Levels | Monsters | Boss and drop | Act | Ledger Pages |
| --- | --- | --- | --- | --- | --- |
| Rustmoor Scrapyards | 1 to 20 | Rust Rats | Scrapjaw: Scrapjaw's Cleaver, Ledger Page 1 | I | 1 boss, 4 drops |
| Cinderworks Foundry | 20 to 45 | Soot Wraiths | Old Bellows: Bellows Plate, a Whistle notation | II | 1 boss, 4 drops |
| Thunderhead Reach | 45 to 70 | Storm Harpies | The Lightning Baron: Coil Staff, Gondola Schematic | III | 1 boss, 4 drops |
| Dreadnought Hangar | 70+, 5 players | The Board's marines | The Iron Dreadnought: its armour set | IV, after the capstone | Not in the capstone |

Entering a new zone needs the level and a pass from the previous act, and every road through the act provides one. Act beats are gated to the zone's level band, so an act's roughly five days of Nerve stretch across the zone's two weeks, with Ambition and district storylets filling the gaps.

### Treasure and Calibrating

Monsters drop Crowns, materials, and ability Schematics. Gear has fixed stats per calibration level, so a +5 Brass Spanner is identical everywhere and fits an order book. Each calibration attempt costs Crowns and materials, with its odds shown up front. Failure resets gear to +0 unless a crafted Safety Valve, consumed on use, limits the loss to one level. Calibrating is the main Crown sink.

### The Brass Exchange

An order book: sellers list, buyers post standing bids, and matches fill at once, even offline, which suits idle play. Prices move in 2 to 5% steps, a 2% sales tax removes Crowns, and orders expire after 30 days. At launch, NPC sell orders at a price ceiling keep a thin market moving while also removing Crowns. The Exchange is also a story location: Silas Tallow's office is upstairs, and Arrears are paid at the Counting-House window.

### Guilds, Work Orders, and Favour

A guild costs 500,000 Crowns and gets chat, a contribution roster, a Workshop, and 5 weekly Guild Contracts such as "Smelt 50,000 Brass Ingots", whose tiers pay upgrades and tokens. Solo players get a new Work Order every 8 hours. Work Orders and trading unlock at total level 50 on an account at least two days old, so throwaway alt accounts cannot farm them. The cheap early levels make total level 50 a matter of hours, so the account's age does the real gating.

This edition adds one thing: every Work Order and Guild Contract carries a faction's seal. Completing it earns that faction Favour, and during a Reckoning it counts as a pledge to that faction's side. Players choose which seals to take, so the daily grind becomes a quiet vote on the city's future.

### Leaderboards

Total level, each skill, net worth, and guilds, as in the draft, plus a per-guild Reckoning contribution board during each season's finale. There is no story leaderboard: a race to finish an act would turn reading into speed-clicking and spoil the mystery for everyone else.

### The Crown budget

The draft named this as its open gap: the overall Crown faucet and sink budget needed an owner. The Assayer now models it before every patch and reports weekly; I own the decisions. The target is that sinks remove at least 90% of what faucets add each week once the economy is steady.

| Faucets (Crowns in) | Sinks (Crowns out) |
| --- | --- |
| Monster drops | Calibrating attempts |
| Work Order and Guild Contract rewards | Exchange sales tax (2%) |
| NPC collectors buying Curios, capped weekly | Tax on Cog Crate sales (15%) |
| Story rewards, small and capped | Paying off Arrears |
|  | Guild founding (500,000 Crowns) and Workshop upgrades |
|  | NPC sell orders at the price ceiling |

## 7. Player Experience

A player should be able to describe The Long Boil after one evening: "I run a workshop in a flying city, it keeps working while I'm away, and there's a missing woman's notebook I'm trying to finish." This section follows one player, Ada, from her first session to her third month.

### What the screen shows

Desktop puts skills on the left, your Tinker at work in the centre, and chat on the right, as in the draft. Two gauges sit on the top bar: the Boiler (hours of steam left) and Nerve (story actions left). The four Needles sit under your Tinker's portrait as small dials.

Phones use a bottom tab bar with five tabs: Workshop, Story, Exchange, Guild, and Tinker. The Story tab carries a badge when letters are waiting. A storylet is a card: a 96×96 vignette, the description, and up to four option buttons, each showing its Nerve cost and, for challenges, its odds.

### The first session (about 20 minutes)

1. Ada signs in with Discord. The first screen is a solicitor's letter on Sprocket Row: No. 9 is hers, contents included.
2. Professor Brassbuckle peels the Gauger tape off the Boiler. The Boiler gauge fills to 12 hours, and a one-line tip explains that this is how long her Tinker works without her.
3. Brassbuckle walks her through Prospecting copper, smelting brass, and tinkering a Brass Spanner. Ada queues 50 more and watches the first few land.
4. Pip Tumbler's first letter arrives: a bill for the workshop's back rent. The Arrears dial twitches to life, at 0, with a tip.
5. Rust Rats have been raiding the Row. Ada equips the spanner, sets one trigger ("eat a Ration below 40% HP"), and wins her first fight in Rustmoor.
6. She sells the rats' scrap at the Counting-House window and pays the bill.
7. Clearing out the workbench, she finds a brass plate scratched with a gauge reading that does not match today's Gazette. Brassbuckle changes the subject.
8. The game asks her to queue 12 hours of work and come back. Her Nerve sits at 10 and a letter is already on its way.

### A normal check-in (about 4 minutes)

1. **0:00** The While You Were Away ledger: 400 Brass Ingots smelted, 2 Rust Rat kills short of a level, one Exchange order filled.
2. **0:30** She sells the ingots she will not use and requeues: Smithing, then Rustmoor.
3. **1:00** Three letters wait. One is a Stoker asking for 20 of those ingots, with a favour attached. She agrees.
4. **1:45** She spends 6 Nerve on Act I: two scenes in the Lowvents, one failed Smithing check (Scald rises to 2), one success.
5. **3:30** She skims the Gazette: copper up 12%, the Iron Owls guild has beaten Old Bellows.
6. **4:00** She closes the tab. Nothing in the game needs her for 6 hours.

### The first week

By day 2 Ada's total level passes 50, which opens Exchange trading and Work Orders. She starts taking Stokers' seals because she likes Mother Ash. Inspector Rook turns up twice in Act I scenes, and Ada decides to cooperate, which keeps Notice low and gives Rook a reason to trust her later. A guild invites her; she joins one that has not yet chosen a charter.

By the end of the week she is about level 12 in Rustmoor, halfway through Act I, and has collected one rare-drop Ledger Page. It is about the Lowvents vents, and it makes the Stoker letters feel different.

### The first month

Around day 14 she beats Scrapjaw on her second attempt and reads Ledger Page 1. She gives it to Mrs. Inkwell rather than Lord Gauntlett, takes the Lantern Ambition, and walks into the Cinderworks on a Stokers' token. Act II's Whistle storylets push her Haze to 6, and she learns to keep a calming tea in her loadout. She is in the Foundry when her guild takes the Stokers' charter for Season 1.

### Month three

Ada beat the Lightning Baron around week six and has read the last capsule. Her day now has three kinds of goals. Calibrating her Coil Staff toward +10 is a long Crown sink and a leaderboard. The Lantern Ambition's middle chapters ask for Scavenging levels she has neglected, and she has deliberately redlined Haze once to learn a notation in the Quiet Rooms. Her guild is fighting for the Stokers' side in the Reckoning, and the Gazette prints the standings every morning.

She is waiting for Act IV the way Fallen London players wait for a new season: impatiently, but still logging in.

### Comfort and access

- System text scaling applies to all story text, and every storylet works with a screen reader.
- Reduced-motion settings turn off the Haze shimmer and the Scald vignette.
- Needle dials use shape and position as well as colour.
- Ledger Page text is blurred in chat by default, so nobody is spoiled by a guildmate.
- Every storylet shows its Nerve cost and odds before you commit, with no hidden rolls.

## 8. Monetization and Fairness

The game is free, Gilded Cogs pay for time and looks, and the story is never for sale. Cogs come in Cog Crates of 10, bought through Stripe. A crate can be opened or sold on the Exchange (15% tax), so free players can buy Cogs with Crowns. Crates lock for 72 hours after purchase to blunt card fraud.

| Cogs buy | Starting price | Why it is fair |
| --- | --- | --- |
| An extra queue slot | 30 Cogs | Saves check-ins, adds no power |
| Boiler upgrade, +2 offline hours, up to 24 | 20 Cogs each | Helps players who sleep or work long shifts |
| Night Lamp: Nerve cap from 10 to 14 | 40 Cogs | Helps twice-a-day players keep pace; buys no Nerve |
| Boiler Boost: +20% action speed for 24 hours | 5 Cogs | A time saver, and a steady Cog sink |
| Cosmetics: coats, goggles, workshop signs | 5 to 30 Cogs | Looks only |

A crate of 10 Cogs starts at $4.99. Every price here is a starting point the Assayer models before launch.

**Lines that never move.** Cogs never buy Nerve, storylets, Needle resets, Ledger Pages, Favour, Reckoning pledges, or gear with stats. A player who never pays can own everything a paying player owns by trading Crowns for crates.

**Payments path.** Stripe Checkout runs in test mode for the capstone. Its webhook reaches a Lambda that grants crates exactly once per Stripe event ID. Live payments, and the app-store builds whose billing rules differ outside the US, come after the capstone.

## 9. AI Architecture

Six Claude agents build and tune content between patches, and each is built around one job it does exceptionally well. The draft had five; the story adds a sixth, the Scrivener, which drafts storylets. None of them sits in a player's moment-to-moment loop. Drops, combat, trades, and story rolls stay in deterministic server code, because idle play runs offline and a traded economy needs repeatable outcomes.

| Agent | Its one job, in one sentence | Model | What players notice |
| --- | --- | --- | --- |
| Foreman | Turns my one-page patch brief into a complete, correctly ordered set of work orders for the other agents. | Sonnet 5.5 | A new zone slice, gear tier, or story chapter every two weeks |
| Draftsman | Writes new items, recipes, and monsters as game-ready JSON that fits each tier's stat budget. | Sonnet 5.5 | Thunderhead Reach's monsters and gear |
| Scrivener | Drafts storylets and Pneumatic Post letters as game-ready JSON in the house voice, using only the canon it is handed. | Opus 5.5 | Fresh letters every patch, and act scenes that remember what you chose |
| Inspector | Reviews tone, lore, names, and reveal timing after code has already checked every stat budget and story graph. | Haiku 5.5 | No off-tone items, no overpowered swords, and no character blurting out Act II's secret in Act I |
| Assayer | Predicts how a patch will move pacing, prices, and story pace before players touch it. | Sonnet 5.5 | About two weeks per zone, stable prices, and acts that end with the zone's boss |
| Chronicler | Writes the Brass Gazette and patch notes around facts and opt-in names taken straight from game data. | Haiku 5.5 daily, Sonnet 5.5 for patch notes | "Copper up 12%; Iron Owls fell the Baron", beside the Board's cheerful Gauge Reading |

&#91;embedded content: patch pipeline · 6 agents, 1 code gate, 1 human gate\]

A draft that fails a code check or the Inspector goes back to the agent that wrote it, and a patch I reject goes back to the Foreman. Nothing reaches players without my sign-off.

### Humans write the spine, agents write the ribs

A story told mostly by an agent drifts into generic fantasy within a week. So the parts of the story that carry the mystery are mine, and the agents fill in around them.

| Written by me | Drafted by agents, edited by me |
| --- | --- |
| The canon bible and the reveal schedule | District texture storylets |
| The Prologue and every act climax (32 of the 190 capstone storylets) | Pneumatic Post letters |
| The first storylet of each Ambition | Repeatable progress scenes inside each act |
| Each character's voice note and list of known facts | Needle consequence chapters, edited heavily |
| Final approval of every storylet before it ships | Daily Gazette editions, auto-published after the Inspector passes them, sampled weekly |

### Agents cannot leak what they were never told

The canon bible lives in git as Markdown and JSON: world facts, each character's known facts, the reveal layers, and the quality registry. Each agent receives only the slice its work order needs. A Scrivener drafting Act I scenes gets Layers 0 and 1 and nothing deeper, so it cannot hint at the Hearth even by accident. The locked facts (the Diver's identity, Layers 4 and 5) are never sent to any agent.

### Code checks first, agents second

Deterministic validators run before any agent reviews anything, because they are cheap, fast, and never tired:

- **Stat budgets:** every item's stats fit its tier, as in the draft.
- **Story graph:** every quality a storylet reads exists, every storylet is reachable, no branch dead-ends, and every requirement can be met.
- **Reward budgets:** Crowns and Curios per storylet stay under their caps.
- **Reveal guard:** a storylet tagged with a reveal layer cannot be placed in an earlier act.
- **House rules:** word limits per field and the banned-word list from the style guide.

Only material that passes reaches the Inspector, and only material the Inspector passes reaches the Assayer and then me.

### One patch, start to finish (illustrative)

Patch 0.4, "Ballast Day Approaches", adds the end of Act II. The Foreman turns my brief into 14 work orders: 6 for the Draftsman (Foundry gear) and 8 for the Scrivener (16 Lowvents storylets). The graph validator rejects the first batch because two storylets read a quality, act2.ballast\_named, that no storylet sets yet; the Foreman reorders the work so the setting scene is drafted first.

The Inspector bounces a Deacon Hale line that calls the Whistle "a voice from below", which belongs to Act III, and the Scrivener rewrites it. The Assayer finds the new Curio rewards would add 6% more Crowns per week than the sink target allows and proposes cutting the collectors' price by 20%. I approve, merge, and the data ships through the config store with no code change. The Chronicler writes the patch notes and that evening's Gazette leads with the Board's announcement.

**Pipeline in one sentence.** In my game, the Scrivener takes the Foreman's work orders and produces storylet JSON that the player sees as new letters in the Pneumatic Post and a new chapter of Kettleport's mystery.

### Where agents never go

- No agent generates text for a single player at runtime. Every player reads the same approved storylets.
- No agent decides a roll, a drop, a trade, or a Reckoning result.
- No agent sees personal data. The Chronicler gets only opt-in display names, passed as data.
- No agent writes server code that ships without my review.

## 10. Technical Strategy

One TypeScript codebase on Expo (React Native plus React Native Web) ships the web game now and phone apps later; menus, timers, sprite sheets, and storylet cards need no game engine. The biggest change from the draft is where the agents' tokens come from: they now call Claude through Amazon Bedrock rather than the Claude API directly, at the same prices, so AWS credits pay for them.

### Stack

- **Client:** Expo, TypeScript, Reanimated sprites; an installable PWA on S3 and CloudFront.
- **Server:** authoritative Node.js on ECS Fargate (Graviton), WebSockets through an Application Load Balancer; EventBridge and SQS for scheduled jobs.
- **Offline:** the server never stops. Each Tinker's state changes through one ordered event log: solo queues resolve on demand, Exchange fills and boss fights write events as they happen, and seeded RNG plus versioned config make every result, story rolls included, replayable.
- **Story engine:** a pure TypeScript module that evaluates requirements, rolls challenges, and applies outcomes. The server runs it authoritatively; the admin console runs the same module to preview a storylet before it ships.
- **Data:** Aurora PostgreSQL for inventory, orders, qualities, and the event log; Valkey for sessions, chat, and ranks.
- **Content and config:** items, monsters, storylets, and tuning values live in git, are validated in CI, and deploy through AWS AppConfig, which versions every change and can roll one back.
- **Sign-in:** Cognito with Google and Discord; 3 Tinkers per account, 1 trading.
- **Payments:** a Stripe Checkout webhook reaches a Lambda that grants crates once per event ID.
- **Agents:** Step Functions runs each agent as a Lambda calling Claude on Bedrock; my approval is a Step Functions task token that the admin console completes.
- **Admin console:** an MFA-gated web app to tune drop rates, XP curves, costs, taxes, and the Boiler cap through the config store, preview storylets, watch economy dashboards, manage players, and approve agent patches, all audit-logged.

### Model prices used in this plan

| Model | Input per million tokens | Output per million tokens | Cache read per million tokens | Used by |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | $4.00 | $20.00 | $0.20 | Scrivener |
| Claude Sonnet 5.5 | $2.00 | $10.00 | $0.10 | Foreman, Draftsman, Assayer, patch notes |
| Claude Haiku 5.5 (prompts up to 100K tokens) | $0.10 | $0.50 | $0.01 | Inspector, daily Gazette |

Prices are from [Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing), checked 19 October 2026; Bedrock's global endpoints charge the same rates, and regional endpoints add 10%. Output includes thinking tokens.

### Token budget

Each player game action costs 0 tokens, because no agent runs per player. The only daily cost is the Gazette: about 14K tokens, or roughly $0.002 a day, for any number of players. Content patches every two weeks cost about 2 million tokens, or $6.23:

| Agent | Model | Calls | Input | Output | Cost |
| --- | --- | --- | --- | --- | --- |
| Foreman | Sonnet 5.5 | 12 | 120K | 40K | $0.64 |
| Draftsman | Sonnet 5.5 | 9 | 225K | 120K | $1.65 |
| Scrivener | Opus 5.5 | 13 | 507K (351K cached) | 78K | $2.38 |
| Inspector | Haiku 5.5 | 25 | 350K | 75K | $0.07 |
| Assayer | Sonnet 5.5 | 6 | 180K | 60K | $0.96 |
| Chronicler (patch notes) | Sonnet 5.5 | 6 | 48K | 40K | $0.50 |
| Chronicler (14 Gazettes) | Haiku 5.5 | 14 | 168K | 28K | $0.03 |
| **Total** |  | **85** | **1.6M** | **441K** | **$6.23** |

The Scrivener drafts two storylets per call. Each call carries a 27K-token cached prefix (style guide, canon slice, quality registry) plus about 12K tokens of work order and neighbouring scenes, and the count includes a 30% resend rate for drafts the validators or the Inspector bounce. Its cost is mostly output, so effort is a lever: medium effort roughly halves its thinking.

The semester costs more than steady patching, because the capstone's 158 agent-drafted storylets are written up front:

| Semester line | Tokens | Cost |
| --- | --- | --- |
| Development and prompt tuning, Sonnet 5.5 (8M in, 2M out) | 10M | $36 |
| Scrivener prompt tuning, Opus 5.5 (1.5M in, 0.5M out) | 2M | $16 |
| Capstone narrative: 158 storylets drafted, checked, and ordered | 8.9M | $22 |
| Four content patches | 8.2M | $25 |
| **Total** | **29.1M** | **$99** |

An AWS Budgets alarm fires at $75 and a hard cap stops the agent pipeline at $150. After the capstone, two patches a month plus my own usage come to about $30 a month.

### Constraints

My biggest constraint is still output reliability, because one bad number in a traded economy (an overpowered sword) crashes prices players spent real time on. The story adds a second: narrative consistency, because one character who knows too much spoils a mystery for every player at once. Both are why validators, the Inspector, need-to-know canon, and my approval gate every patch.

- **Rate limits:** a new account's Bedrock quotas are low, so I request increases in week 1, and Draftsman and Scrivener batches run in sequence with backoff.
- **Context window:** Opus 5.5 and Sonnet 5.5 hold 1M tokens at the standard price, but prompts stay near 40K, because smaller prompts stay sharper. Haiku 5.5 charges 5 times more above 100K tokens, so Inspector prompts are capped at 60K.
- **Tokenizer:** Claude 4.7 and later models produce about 30% more tokens for the same text than older ones. The estimates above are measured in the new tokens.
- **Bedrock lag:** a new API feature can reach the first-party API before Bedrock. The agents use plain Messages calls with tool use, and the same prompts run on the first-party API if I ever need to switch.
- **Latency:** barely matters; no agent runs while a player waits.
- **Identity and stores:** Discord's Cognito OIDC exchange gets tested in week 1, with a Lambda shim as the fallback; non-US store billing rules delay app-store builds.

### Scope

This semester: 16 skills, 3 zones up to level 70, the Exchange, guilds, leaderboards, Work Orders, the admin console, a test-mode Cog Shop on web, and the story's Prologue and Acts I to III (190 storylets) with Nerve, the Post, the Needles, and Hester's Ledger, built with six agents.

If time runs short, cuts happen in this order: the Cog Shop's Stripe path, guild charters, Guild Contracts, Discord sign-in, then the Post deck from 36 letters to 20 and each Needle's consequence chapter from 4 storylets to 2. The acts themselves are never cut; they are the game.

It passes the 48-hour test: two developers could build a rough playable version (one skill chain, the offline timer, one zone, a basic Exchange, and five storylets with Nerve) in a weekend. Every skill runs on one generic action engine and every storylet on one story engine, so the rest is mostly data.

**Known logic gaps.** With a small player base the Exchange may stay too thin; NPC sell orders are a start. Story pace could outrun zone pace for players who check in often, which is why act beats are level-gated and the Assayer reports story pace. The Reckoning could be gamed by alt accounts, which the total-level-50 gate and the per-player pledge cap are there to stop. The future dungeon's offline rule is decided: each run snapshots every member's gear and consumables at launch and resolves to the end.

## 11. AWS Architecture and Rollout

The Long Boil runs on about 25 AWS services in us-west-2 (Oregon), split across a production account and a non-production account. It costs about $106 a month to build, $266 in closed alpha, $429 in open beta, and about $1,012 a month at launch scale (10,000 daily players). The $1,200 in credits I can claim today covers everything until the first month of open beta; a Portfolio-tier Activate grant of about $6,000 carries it through October 2027.

### Accounts and environments

| Account | Holds | Why |
| --- | --- | --- |
| Management | Billing, AWS Organizations, IAM Identity Center, credits | Credits applied here are shared with member accounts by default, and nothing runs here to attack |
| Non-production | dev (always), staging (deployed per release, then torn down) | Experiments cannot touch players or their data |
| Production | prod | Least privilege, MFA-only access, its own budget alarms |

The management account is opened on AWS's Paid plan, not the Free plan. Both plans get up to $200 in new-customer credits, but Free plan accounts cannot receive other promotional credits such as Activate, and cannot use CloudFront's flat-rate plans. Every resource is defined in AWS CDK (TypeScript, like the game), and GitHub Actions deploys through OIDC, so no long-lived AWS keys exist anywhere.

### Services

&#91;embedded content: production architecture · us-west-2\]

Players enter through one CloudFront domain. The database sits in private subnets that only game servers and scheduled jobs reach, and the agent pipeline touches the live game only through approved content in AppConfig.

| Layer | Service | What it does for The Long Boil |
| --- | --- | --- |
| Edge | Route 53 | DNS for the game's domain |
| Edge | CloudFront (flat-rate Pro plan) | One domain for the PWA, the API, and WebSockets; includes AWS WAF, DDoS protection, and TLS |
| Edge | AWS Certificate Manager | TLS certificates |
| Client | S3 | The PWA bundle, sprite sheets, and the 40 story vignettes |
| Game | Application Load Balancer | Holds players' WebSocket connections and spreads them across game servers |
| Game | ECS on Fargate (Graviton) | The authoritative Node.js game server; Fargate Spot for background job workers |
| Game | ECR | Container images |
| Data | Aurora PostgreSQL Serverless v2 | Inventory, Exchange orders, qualities, the event log; pauses to zero in dev |
| Data | ElastiCache Serverless for Valkey | Sessions, chat, leaderboards |
| Data | DynamoDB | Stripe event IDs, so a webhook never grants a crate twice |
| Data | S3 and Athena | Monthly event-log archive and ad-hoc economy queries |
| Jobs | EventBridge Scheduler and SQS | Work Orders every 8 hours, weekly Guild Contracts, the daily Gazette, Reckoning tallies |
| Jobs | Lambda | Job handlers, the Stripe webhook (via a function URL), Cognito triggers, the Discord sign-in shim |
| Identity | Cognito | Sign-in with Google and Discord |
| Agents | Step Functions | Runs the six-agent pipeline, with my approval as a task token |
| Agents | Amazon Bedrock | Claude Opus 5.5, Sonnet 5.5, and Haiku 5.5 for the agents |
| Config | AWS AppConfig | Versioned items, monsters, storylets, and tuning, with validators and rollback |
| Config | Secrets Manager | Stripe and Discord secrets |
| Email | SES | Account and receipt emails |
| Operations | CloudWatch | Logs, metrics, alarms, dashboards |
| Security | IAM Identity Center, KMS, CloudTrail, GuardDuty | My MFA sign-in, encryption keys, an audit trail, threat detection |
| Cost | AWS Budgets and Cost Anomaly Detection | Monthly budget per phase with alarms; alerts on unusual spend |

### Seven decisions that keep the bill honest

1. **No NAT gateway until launch.** Until then, game servers run in public subnets with public IPs, and their security group accepts traffic only from the load balancer. Aurora and Valkey sit in private subnets with no internet route at all. The agent Lambdas run outside the VPC, because they never touch the database. A NAT gateway costs $0.045 an hour plus $0.045 per GB, about $33 a month before any traffic, per environment. At launch, game servers move to private subnets behind one NAT gateway.
2. **CloudFront's flat-rate Pro plan, $15 a month.** It bundles the CDN, AWS WAF, DDoS protection, Route 53 DNS, and log ingestion for 10M requests and 50 TB a month with no overage charges. The PWA's service worker caches assets, and game traffic rides one WebSocket per session, so request counts stay low. Dev uses the Free plan. Week 1 confirms WebSockets and the load-balancer origin behave on the plan; if launch traffic passes 10M requests, the next tier is Business at $200.
3. **Aurora pauses in dev and stays awake in prod.** Dev and staging set the minimum to 0 ACU, so the database pauses when idle and costs only storage. Prod keeps a 0.5 ACU floor, because resuming from zero takes about 15 seconds and a player should never wait for it.
4. **Valkey Serverless, not a cache node.** Its floor is about $6 a month (100 MB minimum at $0.084 per GB-hour).
5. **Graviton everywhere.** Fargate on ARM costs about 20% less than x86.
6. **Discord sign-in through a shim at scale.** Cognito gives 10,000 free monthly users for direct and social sign-in, but OIDC-federated users (Discord) get only 50 free, then cost $0.015 each. Once Discord players number in the thousands, a Lambda shim that signs them in as native Cognito users is cheaper; at launch it saves about $95 a month.
7. **Claude through Bedrock.** Global-endpoint prices match Anthropic's, Activate credits explicitly cover third-party models on Bedrock, and IAM replaces an API key. Anthropic's other AWS option, Claude Platform on AWS, bills through AWS Marketplace, which promotional credits do not cover.

### Rollout

| Phase | When | Players | Environments | Exit gate |
| --- | --- | --- | --- | --- |
| 0. Foundations | Week 1, late October 2026 | None | Accounts, CDK, pipeline, dev | A commit deploys to dev with no hands; budget alarms live; Bedrock quotas raised; Discord sign-in tested; Activate Founders applied for |
| 1. Build | Weeks 2 to 9, November to mid-December | Me | dev | Act I playable end to end, offline resolution matches replay |
| 2. Capstone demo | Week 10, late December | Classmates and instructors | dev, prod | Demo delivered; restore-from-backup drill passed |
| 3. Closed alpha | January to February 2027 | Up to 100 invited | dev, prod | 7-day retention at or above 30%; no economy-breaking bug for 2 weeks |
| 4. Open beta | March to May 2027 | About 1,000 a day | dev, staging, prod | Load test at 3,000 connections (twice launch peak) with p95 action latency under 200 ms; Stripe live |
| 5. Launch | June 2027 onward | About 10,000 a day | dev, staging, prod | Private subnets and NAT, an Aurora reader for failover, cost per daily player under $0.12 a month |

The week numbers assume a 10-week semester from 20 October 2026; if the capstone date differs, every later phase shifts with it.

### Monthly cost by phase

Production sizing grows with each phase: 2 small game servers (0.5 vCPU, 1 GB) in alpha, 2 medium ones (1 vCPU, 2 GB) in beta, and about 4 medium ones plus 2 Spot workers at launch. Aurora averages 0.6, 1, and 3.5 ACU (a writer plus a reader), and Valkey holds 0.1, 0.3, and 1 GB.

| Line item (USD per month) | Build | Closed alpha | Open beta | Launch |
| --- | --- | --- | --- | --- |
| Fargate game servers and workers | 5 | 34 | 63 | 129 |
| Load balancer | 17 | 39 | 51 | 68 |
| NAT gateway | 0 | 0 | 0 | 35 |
| Public IPv4 addresses | 9 | 24 | 24 | 20 |
| Aurora PostgreSQL Serverless v2 | 16 | 72 | 126 | 388 |
| ElastiCache Serverless for Valkey | 6 | 13 | 25 | 70 |
| CloudFront flat-rate plan | 0 | 15 | 15 | 15 |
| Cognito | 0 | 1 | 14 | 83 |
| Lambda, Step Functions, SQS, EventBridge, DynamoDB, SES | 2 | 5 | 10 | 22 |
| AppConfig and Secrets Manager | 2 | 5 | 5 | 6 |
| CloudWatch | 4 | 16 | 29 | 64 |
| GuardDuty, KMS, CloudTrail, backups | 1 | 9 | 17 | 51 |
| S3, ECR, Athena | 1 | 3 | 5 | 16 |
| Staging (per-release) | 0 | 0 | 15 | 15 |
| Claude on Bedrock (agents) | 43 | 30 | 30 | 30 |
| **Total** | **106** | **266** | **429** | **1,012** |

Each column includes the dev environment (about $63 a month, scaled down at night and on weekends) plus the agents; production starts in December for the capstone demo. Rates are us-west-2 list prices as of October 2026, before credits or Savings Plans.

### Credits

| Program | Amount | Who qualifies | Covers | Action |
| --- | --- | --- | --- | --- |
| AWS Free Tier, Paid plan | Up to $200 | New AWS customers: $100 at sign-up, $100 more for exploring services | Eligible services for up to 12 months | Open the management account on the Paid plan |
| AWS Activate Founders | $1,000, plus $350 in Developer Support credits | Self-funded startups that have not had Activate credits before | Eligible services, including Claude on Bedrock | Apply in week 1 |
| AWS Activate Portfolio | Up to $200,000 | Startups referred by an Activate Provider (VC, accelerator, or incubator); Stripe Atlas reportedly includes $5,000 | Same as Founders | Pursue before open beta |

Credits do not cover the domain registration (about $15 a year), AWS Marketplace purchases, upfront Savings Plan fees, Stripe's fees, or app-store developer fees. They do cover the hourly charges of no-upfront Savings Plans, so a 1-year Compute Savings Plan on Fargate can stack on top of credits from launch day.

**The ask.** The 12 months from November 2026 to October 2027 cost about $7,200. The $1,200 I can claim today runs out in March 2027, the first month of open beta. A further $6,000 from a Portfolio-tier provider covers the year with nothing to spare, so the target is $6,000 to $10,000.

&#91;embedded content: modelled from the phase costs above · November 2026 to October 2027\]

Most of the year's spend comes after launch, so the levers below matter more than any saving during the build: together they take about $770 off the last five months.

**If credits fall short,** four levers cut launch spend to about $860 a month: drop the Aurora reader (about $88), commit to a 1-year Compute Savings Plan on Fargate (about $25), keep logs for 14 days and sample traces (about $24), and skip the NAT gateway by keeping game servers in public subnets (about $17 once their own addresses are counted).

**Break-even.** A $4.99 Cog Crate nets about $4.55 after Stripe's 2.9% plus 30 cents. At launch, about 223 crates a month, or roughly 2% of daily players buying one crate a month, pays the AWS bill.

## 12. Production Plan and Risks

The semester runs on three parallel lanes, systems, story, and agents with infrastructure, and the rule is that each act's systems land a week before its story, so every storylet is played in a working game before it ships. Act I is playable by week 5, Act II by week 7, and Act III by week 9, leaving week 10 for load testing, the backup drill, and the capstone demo.

&#91;embedded content: semester plan · 10 weeks, 3 lanes, 4 milestones\]

Week 10 holds no new content: only the load test, the backup drill, and the demo.

### Story content

| Content | Storylets | By me | By the agents | Ready by |
| --- | --- | --- | --- | --- |
| Prologue | 10 | 10 | 0 | Week 2 |
| Act I: The Gauge Lies | 28 | 6 | 22 | Week 5 |
| Ambition openers | 20 | 4 | 16 | Week 6 |
| Needle consequence chapters | 16 | 0 | 16 | Week 6 |
| Act II: What the Furnace Eats | 28 | 6 | 22 | Week 7 |
| Act III: Lightning Down | 28 | 6 | 22 | Week 9 |
| District texture | 24 | 0 | 24 | Week 9 |
| Pneumatic Post letters | 36 | 0 | 36 | Week 9 |
| **Total** | **190** | **32** | **158** |  |

At about 400 words a storylet, that is roughly 76,000 words. I write about 13,000 of them and edit the rest, at a pace of about 8,000 words of agent drafts a week.

### Risks

| Risk | Likelihood | Impact | Mitigation | Fallback |
| --- | --- | --- | --- | --- |
| One developer runs out of time | High | High | Generic action and story engines; a cut order agreed in advance | Cut in the order in Technical Strategy; the acts stay |
| Agent prose reads as generic | Medium | High | I write the spine; style guide and banned words; the Inspector; I read every storylet | Shrink the Post deck to 20 letters and write more by hand |
| The Exchange stays thin and prices swing | High | High | NPC sell orders, the Crown budget, the Assayer's weekly report | Raise NPC liquidity and lower the trading unlock |
| Credits run out before launch | Medium | High | Founders in week 1, a Portfolio provider before beta | The four cost levers, then delay launch |
| Story pace outruns zone pace | Medium | Medium | Level-gated act beats; the Assayer reports story pace | Add repeatable district scenes between beats |
| An agent leaks a secret early | Low | High | Need-to-know canon, the reveal guard, the Inspector | Roll the storylet back through AppConfig within minutes |
| Alt accounts swing a Reckoning | Medium | Medium | Total level 50 and two-day account age gate, per-player pledge cap | Weight pledges by account age |
| Discord sign-in through Cognito fails | Medium | Low | Test in week 1 | Lambda shim, or Google only for the capstone |
| Bedrock quotas or features lag | Low | Medium | Request quota increases in week 1 | Point the same prompts at the first-party Claude API |
| CloudFront's flat-rate plan does not suit the WebSocket origin | Low | Medium | Test in week 1 | Pay-as-you-go CloudFront with a separate WAF web ACL |

## 13. Appendices

### A. Sample storylets

These three are written to the house style and show the formats the Scrivener must match. The first is the full version of the JSON excerpt in Narrative Systems.

#### A.1 The Vent on Cistern Lane

*Act I · the Lowvents · 1 Nerve · requires Act I progress 30 and Stokers' Favour 1*

Mother Ash meets you where Cistern Lane gives up and becomes railing. Below the railing is the Scald, white and patient. Above it, bolted to the rim, a vent the size of a wardrobe is coughing steam into the tenements instead of away from them.

"Fourth one this month," she says. "The Board sends a man with a clipboard. The man with the clipboard sends his regrets." She hands you a hammer that has clearly been handed to people before.

A child on a balcony watches you with the frank interest of someone expecting a show.

1. **Patch the vent with brass plate.** *Smithing, difficulty 15.*
   - *Success:* The plate goes on with a sound like a dropped tray, and the vent, offended, starts breathing the right way. Somewhere above you a window opens for the first time in a week. Mother Ash nods once, which in the Lowvents counts as a parade. *(Stokers' Favour +1, Act I progress +10)*
   - *Failure:* The vent objects. You spend the next minute learning exactly how hot steam is, and the child on the balcony applauds. Mother Ash wraps your wrist in a rag that smells of tea and lamp oil. *(Scald +2)*
2. **Read the Scald on your own gauge.** *Requires a Pressure Gauge. Certain.*
   - You lower the gauge over the railing on a length of chain and count to sixty. The needle settles. You check it against this morning's Gazette, then check the Gazette again, because it is a long way down and you would like to be wrong. You are 40 fathoms closer to the Scald than the Board says you are. *(Own Reading, Act I progress +10)*
3. **Promise to file a complaint with the Board.** *Certain.*
   - Mother Ash laughs for longer than is polite, then takes her hammer back. *(Board Favour +1, Stokers' Favour −1)*

#### A.2 A Letter That Smells of Soot

*Pneumatic Post · requires 20 Brass Ingots in your workshop · 1 Nerve*

> Tinker. Heard your Boiler ran all night. Heard you've 400 brass ingots sitting about doing nothing useful. The Number Six furnace door has a crack in it you could post a cat through. Twenty ingots would see it right. I can pay in Crowns, or in the kind of thing Crowns can't buy. A.A.

Pip, delivering it, adds: "She means gossip."

1. **Send the ingots and take the gossip.** *(−20 Brass Ingots, Stokers' Favour +1, a Rumour from the Fellowship Hall)*
2. **Send the ingots and ask for Crowns.** *(−20 Brass Ingots, +600 Crowns)*
3. **Keep your ingots.** The letter goes in the stove. Nobody mentions it again, which is how you know they noticed. *(No change)*

#### A.3 The Off-Hour Note

*Act II · Sprocket Row · 1 Nerve · requires Act II progress 10*

It comes at seventeen minutes past two in the morning, when no clock in Kettleport has any business saying anything: one note from the Great Whistle, held a beat too long, then gone. Your tools rattle on their hooks. Across the street every window on Sprocket Row is suddenly lit, and every face in them is pretending to have been awake anyway.

1. **Write the note down.** *Aetherics, difficulty 25.*
   - *Success:* On paper it is an ordinary B flat. In your memory it is nothing of the kind. *(Whistle notations +1, Haze +1)*
   - *Failure:* You write it six different ways and none is right. You hum it until dawn. You would like to stop humming it. *(Haze +2)*
2. **Brew something calming and go back to bed.** *Requires a Chamomile Tonic.*
   - You sleep, and dream of nothing, which is exactly what you paid for. *(Haze −1)*
3. **Ask the Chapel what it was.** *Requires Chapel Favour 1.*
   - Deacon Hale says it was a pressure fault, very common, nothing to worry about, and closes the door slightly faster than a man with nothing to worry about. *(Unlocks "The Hymnal")*

### B. A Brass Gazette front page

The Chronicler writes this from game data and the canon. Only the Board's Gauge Reading is fixed text.

> **THE BRASS GAZETTE** · Gauge Reading: 5,280 feet and steady
>
> **COPPER CLIMBS 12%.** Copper ingots closed the week up twelve per cent on the Brass Exchange, which Mr. Tallow of the Counting-House describes as "weather".
>
> **IRON OWLS FELL THE BARON.** The Iron Owls guild brought down the Lightning Baron's aerie defences on Thursday. The Baron has asked us to print that he was not trying very hard.
>
> **LETTERS.** A reader in the Lowvents asks why the Gauge Reading has not changed in eleven years. The Board thanks her for her interest.

### C. Glossary

| Term | Meaning |
| --- | --- |
| Ambition | One of four long personal storylines chosen at the end of Act I |
| Ballast Day | The Board's custom of dropping a district into the Scald so the city can rise |
| Boiler | Your workshop's licensed steam supply; 12 hours of offline work, upgradable to 24 |
| Crowns | The city's brass coin and the game's main currency |
| Curio | A tradable story item that NPC collectors buy, in capped amounts |
| Favour | Standing with one of eight factions, 0 to 7 |
| Gilded Cogs | The premium currency, sold in tradable Cog Crates |
| Keepsake | A story item bound to the player |
| Ledger Pages | Pages of Hester Vane's notebook; 24 in the capstone |
| Needles | Scald, Arrears, Notice, and Haze: the story's four risks, 0 to 8 each |
| Nerve | The story's action budget: 10, refilling 1 every 36 minutes |
| Pneumatic Post | Short storylet letters, up to 3 held, 1 arriving every 2 hours |
| Quality | Any named number on a player's record that the story can check |
| Reckoning | A season's server-wide decision, settled by pledged Work Orders and Guild Contracts |
| Scald | The sea of boiling vapour below the city, and the Needle for burns |
| Steeped | The people who live in the Scald |
| Storylet | One small scene with requirements, options, and outcomes |
| Whistle notation | A transcribed note of the Great Whistle; enough of them let you translate it |

### D. Sources

Prices and program terms were checked on 19 October 2026 and will change; recheck in the AWS Pricing Calculator before each phase.

- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Amazon Bedrock pricing summary with Claude Sonnet 5.5 and Haiku 5.5](https://omidsaffari.com/blog/amazon-bedrock-pricing)
- [Applying for AWS Activate credits](https://aws.amazon.com/aws-startups/learn/applying-for-aws-activate-credits-a-step-by-step-guide/) and [Activate benefits, including Bedrock models](https://startups.aws.com/lp/activate-benefits-overview)
- [AWS Free Tier](https://aws.amazon.com/free) and [Free plan versus Paid plan credit eligibility](https://www.i-programmer.info/news/141-cloud-computing/18176-understanding-aws-free-tier-for-new-subscribers.html)
- [AWS Promotional Credit terms](https://aws.amazon.com/cn/awscredits/) and [credits on no-upfront Savings Plans](https://www.usage.ai/blogs/aws/guides/free-credits-where-to-find-them/)
- [Credit sharing in AWS Organizations](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html)
- [Stripe Atlas credits](https://northflank.com/blog/how-to-get-free-aws-credits-for-your-startup)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) and [Fargate ARM and Spot rates](https://cloudchipr.com/blog/aws-fargate-pricing)
- [Aurora Serverless v2 pricing](https://www.usage.ai/blogs/aws/rds/aurora-serverless-v2/) and [scaling to zero](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-aurora-serverless-v2-scaling-zero-capacity)
- [ElastiCache Serverless for Valkey pricing](https://upstash.com/blog/aws-elasticache-pricing-explained-2026-full-cost-breakdown)
- [CloudFront flat-rate plans](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-flat-rate-pricing-plans-new-features-and-expanded-capabilities) and [plan allowances](https://docs.aws.amazon.com/de_de/PricingPlanManager/latest/UserGuide/plans.html)
- [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [NAT gateway and public IPv4 pricing](https://cloudburn.io/blog/amazon-vpc-pricing) and [load balancer pricing](https://cloudburn.io/blog/aws-elastic-load-balancing-pricing)
- [Stripe US card pricing](https://devtoollab.com/blog/stripe-alternatives)
