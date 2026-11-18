# Work order 042: looks, and a profile to show them on

**Agents:** the lead session for the art scripts, the looks file, its schema and checks, the rules, the server and the client. Jeremy drew the second Tinker's three sheets with Gemini (`docs/art-requests.md`, section 18). Still to come: `inspector` on the looks' names and descriptions; `assayer` on the prices and Favour levels; `educator` on the pick as a newcomer meets it; Jeremy to play it.
**Status:** built and validated (15 November 2026). Not reviewed, not approved. The second Tinker's sheets are in (15 November 2026), so the pick shows.
**Blocks:** nothing in the build plan.

## Why this one

Jeremy, 15 November 2026: "Right now the main character is male and young and my playtesters are both male and female. I'd like them to be able to pick avatars. I'd like the female and male avatars to be free picks but to get more fancier looks, you'd buy from the cog shop. Like new clothes and avatar backgrounds." And: "you should be able to look up and view a profile and that should show the background, avatar, clothes etc."

His answers before the build: outfits are recolours of the drawn Tinker, not new art; the profile shows the look and the basics (name, guild, skill levels, the weapon held); two free bodies, one male and one female; some looks are earned through Favour and the rest are bought with Cogs.

## What changed

Nothing in the rules of play, the economy or the tuning. A look changes the picture and no number.

### The looks (content)

`content/looks/looks.json` (schema `looks/1`, one register row) holds everything a Tinker can look like.

- **Two bodies**, both free: the Tinker as drawn, and a second whose frames are named `tinkerf_*`. Neither is named on screen; the pick shows two pictures.
- **Four outfits.** Each is a dye of the leathers (the apron and gloves). Soot-Black Leathers, 15 Cogs (the GDD's "soot-black work coat"); Oxblood Leathers, 10 Cogs; Gauger's Green, at Gaugers Favour 2; Board Blue, at Board Favour 2.
- **Six backdrops**, the paintings the game already has, behind the portrait. No. 9 is free. Sprocket Row and The Heaps are 5 Cogs each, Open Sky 10. The Cinderworks opens at Stokers Favour 2 and The Exchange Floor at Counting-House Favour 2.

A look has a price in Cogs, or a Favour that opens it, or neither; never both. Cogs never buy a Favour look, and Favour never discounts a Cog look.

### Outfits without new art (scripts)

- `scripts/art/dye_outfits.py` repaints the leathers on every frame of every body, once for each outfit, and writes them to `assets/art/looks/`. It finds the leathers as the brown below the chin and within reach of the body, and finds the chin from the goggles. Every frame of both Tinkers was checked by eye in the dyes.
- A wooden stock or handle held across the apron takes some of the dye (the Iron Rifle's stock, the Garnet Rod's haft). It reads as part of the outfit. The bench in the Tinkering pose is left alone by a listed box for each body.
- `scripts/art/import_art.py` cuts any body's sheets, not only the first Tinker's, and `scripts/art/build_sprites.py` indexes every body in every outfit that has been drawn.
- The dyed frames add about 6 MB for the two Tinkers. The client fetches a frame only when it is shown.

### Keeping and changing a look (rules and server)

- Migration 024 adds `body`, `outfit`, `backdrop` and `looks` (what was bought) to a Tinker.
- `GET /tinkers/:id/wardrobe` lists every outfit and backdrop and whether this Tinker may wear it. `POST /tinkers/:id/wardrobe/buy` buys one with Cogs, puts it on, and logs `look_bought` with its Cogs. `PUT /tinkers/:id/look` changes the body, outfit or backdrop; a look not held is refused.
- A Favour look is not kept as bought: the Favour itself says it may be worn. Starting over keeps the body and anything bought, and takes off a look that Favour had opened.
- `GET /tinkers/:id/find?name=` finds up to ten Tinkers whose names start with the letters given. Inspecting a Tinker now returns their look.

### On screen (client)

- **The pick.** A Tinker who has not picked sees "Which Tinker are you?" over the workshop: two pictures, one tap, and a line saying it can be changed for nothing. It shows only once a second body is drawn, to new players and to playtesters already in the game.
- **The wardrobe** sits at the foot of the Cog Shop and opens from "Change look" under the Loadout's portrait. It shows the Tinker as they are seen, the bodies, the outfits and the backdrops. Each tile says "Wearing", or offers Wear, or the price in Cogs, or the Favour it needs and where yours stands. Nothing in it badges or glows.
- **The Tinker in the workshop and in fights** wears the outfit. The Loadout's portrait stands before the backdrop.
- **The profile** is the card that already opened from a name in chat, a guild or a leaderboard. It now shows the Tinker in their body, outfit and backdrop.
- **Looking a Tinker up.** The Leaderboards page has a box: type the start of a name, tap a result, and their profile opens.

## Not done, on purpose

- **The second Tinker's Smithing pose** was redrawn alone (`tinkerf-smithing.jpeg`, 18 November 2026) and now holds one hammer.

- **Fully redrawn outfits and goggles.** Jeremy chose recolours. A redrawn outfit is another full set of frames for each body, and can follow.
- **A picture beside each name** on the boards, in chat and in the guild. The profile is where a look is seen.
- **Workshop signs** (GDD section 8 lists them with coats and goggles).
- **The pick at sign-in.** The server takes a body when a Tinker is made, but the client asks in the workshop, so players already in the game are asked the same way.

## For the crew

- `inspector`: the four outfits' and six backdrops' names and descriptions, read at the Prologue's clearance, since any player can meet them on a first-day profile. Invented here: that the Gaugers wear a copper green, and that a Board clerk's ledger cloth is blue. Also whether a Cinderworks or Exchange backdrop on another Tinker's profile shows a newcomer a place before the story does.
- `assayer`: 5 to 15 Cogs against the GDD's 5 to 30, and Favour 2 for every Favour look. How many visits is Favour 2?
- `educator`: the pick lands before the valve. Does a newcomer take it in their stride, and do they find "Change look" later?
- For Jeremy: the GDD's section 8 says cosmetics are "coats, goggles, workshop signs" and section 5 lets Favour open a faction's cosmetics. Bodies, backdrops and a search by name are new to it and want a line each.
