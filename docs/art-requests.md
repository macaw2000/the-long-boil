# Art requests for Gemini

What the game needs drawn next, in priority order, with a prompt for each. Written 25 October 2026, after the workshop moved to the Milky Way Idle-style layout. Style follows `docs/art-brief.md`; this file adds the format rules that make a sheet usable in the game.

## Format rules for every sprite sheet

The first Gemini sheets (October 16) look right but cannot go in the game as they are, for two reasons: the "transparent" background is a grey checkerboard painted into a JPEG, and the cells are not an exact grid, so animation frames would jitter. Add this block to the end of **every sprite prompt**:

```
FORMAT: one square image (1:1 aspect ratio), divided into an exact grid of equal cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

- **Gemini picks the pixel size itself**, so prompts give an aspect ratio and a grid; I measure the cells from the image. What matters is that the cells are equal and nothing crosses a cell's edge.
- **Magenta** is a colour no sprite uses, so it can be removed cleanly. If Gemini still paints a checkerboard, say "the background must be flat #FF00FF magenta, not a checkerboard" in a follow-up turn.
- **Attach a reference** to every request: `art/splash.jpg`, plus the best earlier sheet for the subject (for example the Oct 16 Tinker sheet for Tinker poses). This keeps the look consistent.
- **Save** each result in `~/Downloads` and tell me its file name. I'll key out the magenta, cut the grid, scale it to game size, and wire it in.

The pixel-art block from the art brief, used in every sprite prompt below:

```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore.
```

## 1. Backgrounds (5 paintings), first

These sit far back behind the interface, darkened, to give each place atmosphere. They are paintings, not pixel art, and should be quiet: no characters, low contrast, nothing busy in the middle where the interface sits. Save each as JPEG. I'll put them in `art/bg/`, where the game already looks for them.

Start each with the art brief's mood style block, then:

1. **`workshop`**: "The inside of a small inherited tinker's workshop at No. 9 Sprocket Row: a workbench, shelves of jars and tools, a big riveted brass boiler with a pressure gauge in the corner, warm lamplight, steam. Wide 16:9, 1920 by 1080, painterly, soft focus, low contrast, muted, no people, no text."
2. **`rustmoor`**: "The Rustmoor Scrapyards: a junkyard island of rusted machinery and broken airship hulls under an overcast sky, rat-sized tunnels in the scrap heaps. Wide 16:9, 1920 by 1080, painterly, soft focus, low contrast, muted, no creatures, no people, no text."
3. **`sprocket_row`**: "Sprocket Row, a crowded steampunk street of narrow workshops and pneumatic tubes running along the brick fronts, evening lamplight, steam. Wide 16:9, 1920 by 1080, painterly, soft focus, low contrast, muted, no people, no text."
4. **`brass_exchange`**: "The Brass Exchange trading floor: a grand hall with a giant mechanical order board of brass tiles, pneumatic tubes, warm interior light, empty of people. Wide 16:9, 1920 by 1080, painterly, soft focus, low contrast, muted, no text on the board."
5. **`guildhall`**: "A guild meeting hall in Kettleport: long oak table, brass chandeliers, banners without symbols, a charter in a glass case. Wide 16:9, 1920 by 1080, painterly, soft focus, low contrast, muted, no people, no text."

## 2. Skill icons (1 sheet, 3 by 2)

These replace the stand-ins in the left column. Each is one object that says the skill.

```
[pixel-art block] A 3 by 2 sheet of six 64 by 64 icons, each drawn as an object on its own, no character: (1) Prospecting: a brass-banded pickaxe crossed over a lump of copper ore; (2) Smithing: a small anvil with a glowing ingot on it; (3) Tinkering: a brass spanner crossed with a small cog; (4) Cooking: a riveted cooking pot with steam; (5) Scavenging: a magnet on a hook pulling up bent nails; (6) Fight: two crossed spanners over a small rat skull. [format block, but say "a 3 by 2 grid" and "3:2 aspect ratio"]
```

## 3. Item icons (3 sheets, 4 by 4)

Every item in the game today (Rustmoor), 41 items, needing 37 icons because the five Ledger Pages share one. 32 by 32 icons, drawn at 64 by 64.

**Sheet A, materials and food:**
```
[pixel-art block] A 4 by 4 sheet of sixteen 64 by 64 item icons, each an object on its own: Copper ore; Iron Ore; Coal; a cut red Garnet; a Brass Ingot; an Iron Ingot; a Steel Ingot; Rat Scrap (a small pile of chewed metal bits); Barley Meal (a small sack); Salt Pork (a wrapped joint); a Rustmoor Ration (a riveted tin of food); Bent Nails (a handful); Umbrella Ribs (broken umbrella spokes); Odd Spoons (three mismatched spoons); a Clock Movement (exposed gears); Cracked Gauge Glass (a round gauge face with a crack). [format block]
```

**Sheet B, weapons and tools:**
```
[pixel-art block] A 4 by 4 sheet of sixteen 64 by 64 item icons, each an object on its own, drawn diagonally: a Steel Blade (short sword); a Brass Spanner; an Iron Crowbar; a Riveting Hammer; Scrapjaw's Cleaver (a huge jagged cleaver made of scrap); a Brass Catapult (slingshot); an Iron Rifle; a Steel Carbine; a Garnet Rifle (rifle with a red gem in the stock); a Copper Coil (coiled wire wand); a Spark Rod (a rod with a spark at the tip); a Brass Sparker (a pistol-shaped spark thrower); a Garnet Rod (a rod tipped with a red gem); a Brass Key; an Iron Lock (padlock); a Garnet Sight (a rifle scope with a red lens). [format block]
```

**Sheet C, papers, curios and the interface's own icons:**
```
[pixel-art block] A 4 by 4 sheet of sixteen 64 by 64 icons, each an object on its own: a Ledger Page (a torn notebook page in faded handwriting); a Foundry Pass (a stamped brass token); a Board Memo (an official folded paper with a wax seal); a Ballast Day Ribbon (a rosette ribbon); a Misstruck Crown (a coin struck off-centre); a Crown coin (a clean brass coin with a kettle on it); Nerve (a small glowing heart-shaped valve); Scald (a red burn mark on a bandage); Arrears (an open ledger with red ink); Notice (a Gauger's brass whistle); the Boiler (a tiny round boiler with a gauge); a Pneumatic Post canister (a brass message capsule); the Exchange (a brass balance scale); a Guild crest (a blank riveted shield); a Chat bubble shaped like a steam puff; a padlock in verdigris (locked). [format block]
```

## 4. Rustmoor monsters (2 sheets)

The game's Rustmoor monsters are four kinds of Rust Rat and Scrapjaw. The Oct 16 monster sheet drew other zones' monsters, which wait for later acts. Five frames each, matching how the game animates them: two idle, two attack, one defeated. Side view, facing left (they face the Tinker).

**Sheet D, the Rust Rats, a 5-column by 4-row grid:**
```
[pixel-art block] Four kinds of Rust Rat, one per row, side view facing left, each row five frames left to right: idle 1, idle 2 (breathing), attack 1 (lunging), attack 2 (biting), defeated (lying on its side). Row 1: Rust Rat Runt, a small scrawny rust-coloured rat with a gear-tooth back. Row 2: Rust Rat Scrounger, a bigger rat carrying a sack of scrap. Row 3: Rust Rat Tinplate, a rat wearing dented tin-can armour. Row 4: Rust Rat Gaffer, an old grey rat boss with a monocle and a bent-nail staff. [format block, but say "a 5 by 4 grid" and "5:4 aspect ratio"]
```

**Sheet E, Scrapjaw, a 3 by 2 grid, double size:**
```
[pixel-art block] Scrapjaw, the boss of the Rustmoor Scrapyards: a mechanical crocodile king the Rust Rats built out of the city's rubbish, rusted plates, gears and an anchor for a tail, side view facing left. Five frames, read left to right then top to bottom: idle 1, idle 2, attack 1 (jaws open), attack 2 (snapping), defeated (collapsed into scrap); the sixth cell is empty magenta. Drawn larger than the rats, at 128 by 128 pixels. [format block, but say "a 3 by 2 grid" and "3:2 aspect ratio"]
```

## 5. The Tinker at work (1 sheet, 4 by 4)

The Tinker in the centre scene, for every skill. Use the Oct 16 Tinker sheet as the reference so it is the same person.

```
[pixel-art block] The same young Tinker in goggles and a patched leather apron, side view facing right, 16 frames in a 4 by 4 grid, read left to right, top to bottom, two frames per pose: idle (standing, breathing) x2; Prospecting (swinging a pick at an ore rock) x2; Smithing (hammering at an anvil) x2; Tinkering (turning a spanner on a small machine on a bench) x2; Cooking (stirring a steaming pot) x2; Scavenging (digging through a scrap pile with a hook) x2; fighting bare-handed (fists up, then punching) x2; front-facing portrait for the Loadout (standing, then a slight bob) x2. [format block]
```

The Tinker holding each of the 13 weapons is section 8.

## 6. Story vignettes (1 sheet, 3 by 2)

The square picture on each Story card, which today is a plain brass box with the place's name. 96 by 96 each.

```
[pixel-art block] A 3 by 2 sheet of six small square scenes, each a framed vignette of a place in Kettleport, no people: (1) Sprocket Row, a narrow workshop street with pneumatic tubes; (2) the Rustmoor Scrapyards, scrap heaps under grey sky; (3) the Lowvents, a steep iron stair down to steaming vents; (4) the Polytechnic, a brass-domed lecture hall; (5) the Brass Exchange, the big brass order board; (6) the Infirmary of St. Pinion, a quiet ward with iron beds. [format block, but say "a 3 by 2 grid" and "3:2 aspect ratio"]
```

## Done, 25 October 2026

Every sheet above was drawn and is in the game. The originals are kept in `art/concepts/sheets/`, out of the public sync. `scripts/art/import_art.py` cuts them into `engine/packages/client/assets/art/` and `art/bg/`, and `scripts/art/build_sprites.py` points the client at the real art wherever it exists. Notes for the next round:

- **Rust Rats:** Gemini painted labels into the sheet; the import finds each rat by shape, so a relabelled or uneven sheet still works, but small smoke puffs are dropped with the labels.
- **Scrapjaw:** the second attack frame runs off the left of its cell, so its tail is clipped.
- **The Tinker, redrawn 27 October:** sheet W1 (section 8) drew a better Tinker, with a face, so the Tinker at work was redrawn to match it and replaces both the first sheet and the 25 October scavenging redraw. Its second idle frame stood about 30 pixels right of the first; the import moves it back by the feet.

## 7. The Cog Shop (1 sheet, 2 by 2), 27 October 2026

Done: `cog-shop.jpeg` is in the game, as the Cog Crate's item icon and the interface icons `cogs`, `shop` and `boost`.

The Cog Shop shows a fallback box for the Cog Crate, and nothing for the shop's own icon or the Cogs on the top bar. One small sheet, 64 by 64 each, matching the interface icons (Crowns, Nerve, the Post).

```
[pixel-art block] A 2 by 2 sheet of four small icons, each centred in its cell: (1) a Cog Crate, a small sealed wooden crate banded in brass, stencilled with a gear, its lid nailed shut; (2) a single Gilded Cog, a gold gear wheel with a bright rim, for the Cogs count beside Crowns; (3) the Cog Shop, a brass shop bell over a gear, for the places list beside Story, Exchange and Guild; (4) the Boiler Boost, a pressure gauge with its needle pushed into the red and a small flame under it. [format block, but say "a 2 by 2 grid" and "1:1 aspect ratio"]
```

## 8. The Tinker armed (2 sheets), 27 October 2026

Done: `tinker-armed-w1.jpeg` and `tinker-armed-w2.jpeg` are in the game. The first W2 drew the old Tinker, so it was redrawn with W1 attached as the reference. Both sheets came with thin gridlines and feet touching the cell edges; the import clears the lines and barely trims the cells. Every weapon idles on its ready frame and attacks from ready to strike, and the Loadout shows the ready frame.

The Tinker is drawn bare-handed, so every weapon in `content/gear/rustmoor.json` shows the bare-handed Tinker in fights and in the Loadout. These two sheets give each of the 13 weapons two frames: a ready stance, then the attack. Attach the Tinker at work sheet (`tinker-at-work.jpeg`) so it is the same person.

**Sheet W1, melee and the first guns, 4 by 4:**
```
[pixel-art block] The same young Tinker in goggles and a patched leather apron, side view facing right, holding a weapon. 16 frames in a 4 by 4 grid, read left to right, top to bottom, two frames per weapon: (a) ready stance holding it, (b) attacking with it. Weapons in order: Brass Spanner; Steel Blade (short sword); Iron Crowbar; Riveting Hammer; Scrapjaw's Cleaver (a huge jagged cleaver made of scrap); Brass Catapult (slingshot, drawn back on frame b); Iron Rifle (firing, small muzzle flash); Steel Carbine (firing). [format block, but say "a 4 by 4 grid"]
```

**Sheet W2, the Garnet Rifle and the aetherics, 4 by 3:**
```
[pixel-art block] The same Tinker, same pose rules, 12 cells in a 4 by 3 grid, read left to right, top to bottom, two frames per weapon (ready, then attacking); the last two cells are empty magenta: Garnet Rifle (a rifle with a red gem in the stock, firing); Copper Coil (a coiled wire wand, a crackling arc on frame b); Spark Rod (a spark at the tip); Brass Sparker (a pistol-shaped spark thrower); Garnet Rod (a rod tipped with a red gem, glowing on frame b). [format block, but say "a 4 by 3 grid" and "4:3 aspect ratio"]
```

## 9. The splash in layers, for parallax, 27 October 2026

Done: the sky, the rooftops, the front (Gemini drew the title and the Tinker as one layer, which is kept) and the airships are in `art/splash/`, cut by `scripts/art/import_art.py`. The rooftops took two redraws: the first kept the Tinker's body and the empty plaques, the second the title plaque. The first prompt asked for `splash.jpg` to be attached; the fix for a plaque left in was to attach the bad result and ask for only that removed.

The splash now drifts, steams and sparks, but it is one flat picture, so nothing in it moves against anything else. Cut into layers, the airships can sail across, and the sky, rooftops and Tinker can shift by different amounts as the mouse moves.

Every layer has to line up with the others, so **each prompt is an edit of `art/splash.jpg`, not a new painting**: attach it to every request, and if a result moves anything, say "keep everything exactly where it is in the attached image" in a follow-up. Painted edges key out of magenta worse than pixel art, so every cutout asks for crisp edges with no glow or haze on the magenta. Ask for the same 16:9 shape as the original every time (it is 1376 by 768).

1. **`splash-sky`** (back): "Edit the attached image. Remove the Tinker, the title plaque and its subtitle, all the airships, and all the rooftops, domes, boilers, chimneys and planks. Keep only the sky, the clouds, the sun and the distant floating islands, and paint in the sky behind everything you removed so it continues naturally. Keep the same painterly style, colours and lighting, and the same 16:9 shape. No text, no people, no airships."
2. **`splash-roofs`** (middle): "Edit the attached image. Keep the rooftops, the copper domes, the boiler tanks, the chimneys and the brass plank roof exactly where they are, and paint in the planks behind where the Tinker sat. Remove the Tinker, the title plaque and its subtitle, and the airships. Replace the whole sky, clouds and floating islands with one flat solid pure magenta #FF00FF, edge to edge: crisp edges where the roofs meet the magenta, no glow, no haze, no steam over the magenta. Same 16:9 shape, no text."
3. **`splash-tinker`** (front): "Edit the attached image. Keep only the Tinker, exactly as drawn and exactly where they sit, including the goggles, the pocket watch and its chain. Replace everything else, the roof they sit on included, with one flat solid pure magenta #FF00FF, edge to edge: crisp edges, no shadow, no glow, no outline halo. Same 16:9 shape, no text."
4. **`splash-title`** (front): "Edit the attached image. Keep only the title plaque, "The Long Boil", and the "A Steampunk Idle Game" plaque under it, exactly as drawn and exactly where they are, with their lettering unchanged. Replace everything else with one flat solid pure magenta #FF00FF, edge to edge: crisp edges, no shadow, no glow. Same 16:9 shape."
5. **`splash-airships`** (sheet): "Painterly style matching the attached image. Three small steampunk airships, like the ones in the attached image's sky: (1) a long cigar-shaped airship with sails and a gondola, (2) a small round balloon with a basket and a propeller, (3) a squat cargo airship with a boxy gondola. Each one is whole, side view facing right, centred in its own cell of a 2 by 2 grid; the fourth cell is empty. Background: one flat solid pure magenta #FF00FF in every cell, edge to edge: crisp edges, no clouds, no steam, no shadow, no gridlines, no text. 1:1 aspect ratio."

Save them as JPEGs in `~/Downloads` with those names. I'll check that the four full-frame layers line up with the original by overlaying each one on it, key out the magenta, and wire the layers into the splash. The current animated splash stays as the fallback until they're in.

## 10. The solicitor's letter, 27 October 2026

Done: all four are in `art/letter/`, cut by `scripts/art/import_art.py`, and the sign-in opens as the letter. Gemini folded the open flap back as a band rather than standing it up; it lines up with the closed one, so the switch reads as the flap opening. The seal's broken halves came apart cleanly and are cut as separate pieces.

The sign-in box becomes the letter the game opens with (`docs/gdd.md`: "You arrive with a solicitor's letter"). It arrives sealed in front of the painting. One tap cracks the wax seal, the flap lifts, and the letter rises out of the envelope with the sign-in buttons written on it. Four pictures, each a separate request so nothing has to line up across a grid. Painted, not pixel art: **attach `art/splash.jpg` to every request** so the style and light match.

Animation needs the closed and open envelopes to line up exactly, so the open one is an edit of the closed one: attach the closed result (as well as `splash.jpg`) to request 2. The seal is drawn on its own, so the code can crack it and drop the halves, and the paper is blank, because the words on it are the game's own text, set over it.

1. **`letter-closed`**: "Painted in the same style, palette and warm light as the attached image. One sealed envelope, seen from the back, flat and square to the viewer: thick cream laid paper, a little worn and soot-smudged at the corners, its triangular flap folded down and closed. No wax seal and no writing on it: leave the point of the flap plain. The envelope is centred and fills about four fifths of the width. Background: one flat solid pure magenta #FF00FF, edge to edge. Crisp edges, no shadow on the background, no text. 4:3 aspect ratio."
2. **`letter-open`** (attach the result of 1 too): "Edit the second attached image. The same envelope, at exactly the same size and position, with its flap now opened upward and standing above the envelope, showing the darker inside of the envelope and the top edge of a folded cream letter tucked in it. Change nothing else. The background stays flat solid pure magenta #FF00FF, edge to edge. Crisp edges, no shadow, no text. 4:3 aspect ratio."
3. **`letter-seal`**: "Painted in the same style and light as the attached image. Two wax seals side by side, well apart, on one image. Left: one round blob of deep red sealing wax, pressed with a brass seal showing a gear wheel with a key laid across it, glossy, with soft melted edges. Right: the same seal broken, cracked into two halves that have just begun to come apart, with a jagged crack between them. The two seals are the same size. Background: one flat solid pure magenta #FF00FF, edge to edge. Crisp edges, no shadow, no letters, no text. 16:9 aspect ratio."
4. **`letter-paper`**: "Painted in the same style and light as the attached image. One unfolded sheet of thick cream letter paper, flat and square to the viewer, wider than it is tall, with two faint fold creases across it, slightly foxed and soot-smudged at the edges, and a fine engraved brass-ink border with small gears in the corners. The middle of the sheet is blank and calm, with no writing, no letterhead text and no stamps, because words will be set over it. The sheet is centred and fills about nine tenths of the width. Background: one flat solid pure magenta #FF00FF, edge to edge. Crisp edges, no shadow on the background, no text. 4:3 aspect ratio."

Save them as JPEGs in `~/Downloads` (any names; say which is which). I'll check that 1 and 2 line up, key out the magenta, and build the opening into the sign-in.

## 11. Professor Brassbuckle, for the guide card, 28 October 2026

One bust portrait for the first-session guide's card, which had a plain "B" disc. Jeremy generated it from: "Bust portrait of Professor Brassbuckle, an elderly steampunk engineer and university professor: grey hair pinned up, round brass spectacles, a soot-marked leather apron over a tweed waistcoat, a pencil behind one ear, a kind but no-nonsense expression. Same painted pixel-art style as the attached Tinker portrait. Square 512x512, head and shoulders, facing slightly left, on a flat magenta (#FF00FF) background." (attached: `tinker_brass_spanner_portrait_0.png`). Saved as `art/concepts/sheets/brassbuckle.jpeg`; `import_art.py`'s `brassbuckle()` keys it and writes `brassbuckle_portrait.png` at 128 by 128.

## 12. The Brass Slingshot's icon, 28 October 2026

Sheet B's "Brass Catapult (slingshot)" cell came back as a wheeled siege catapult, while the Tinker holds a slingshot; the item is now named Brass Slingshot. One icon, redrawn alone: "A single 64 by 64 pixel-art item icon in the same style, outline and palette as the attached icon: a hand-held brass slingshot (a Y-shaped brass fork with a short leather-wrapped handle and a strip of dark rubber gasket stretched between the prongs, a small hex nut in the pouch), drawn diagonally, centred, filling most of the square, on a flat magenta (#FF00FF) background. No wheels, no frame, no text." (attached: `icon_brass_spanner.png`). Save as `art/concepts/sheets/icon-brass-slingshot.jpeg`; `import_art.py` uses it in place of the sheet's cell.

## 13. The Cinderworks and Tailoring (2 sheets, 4 by 4), 29 October 2026

Work orders 027 and 028 added 29 items with no icon, so each shows a plain crate in the stores, the Loadout and the job tiles, and Tailoring's skill icon is a stand-in too. Two sheets cover them, with the two empty Loadout slots (now a dash) filling the last cells so no cell is blank. Attach `art/splash.jpg` and the Oct 25 item Sheet A (materials) to both, so the ores and ingots match Rustmoor's. Save as `art/concepts/sheets/cinderworks-d.jpeg` and `cinderworks-e.jpeg`.

**Sheet D, Cinderworks materials:**
```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore. A 4 by 4 sheet of sixteen 64 by 64 item icons, each an object on its own, read left to right, top to bottom: (1) Tin Ore, a grey lump of dull ore; (2) Nickel Ore, a greenish-grey lump of ore; (3) Steam Coal, a few glossy black coal lumps; (4) Manganese Ore, a jagged black lump with a dull purple sheen; (5) Fire Opal, a cut orange opal glowing faintly; (6) Cinders, a small heap of half-burnt grey-black coke with a few ember specks; (7) Slag Iron, a rough rust-brown blob of iron picked from slag; (8) Slag Glass, a chunk of dark green glassy slag; (9) Burnt Tuyere, a scorched copper nozzle cone, blackened at the tip; (10) Spoiled Casting, a small iron cog casting with a visible flaw; (11) Bronze Ingot, a dark bronze bar, browner than brass; (12) Nickel Steel Ingot, a pale silvery steel bar; (13) Boiler Plate, a rolled steel sheet drilled with rivet holes; (14) Manganese Steel Ingot, a dark grey steel bar; (15) Clinker Bar, a long steel poker bar with a hooked end; (16) Slag Wool, a fluffy tuft of grey mineral fibre. FORMAT: one square image (1:1 aspect ratio), divided into an exact grid of equal cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

**Sheet E, Cinderworks goods, armour and Tailoring:**
```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore. A 4 by 4 sheet of sixteen 64 by 64 icons, each an object on its own, read left to right, top to bottom: (1) Bronze Valve, a bronze hand-wheel valve; (2) Valve Key, a square-headed steel valve key, T-shaped; (3) Pressure Gauge, a round brass pressure gauge with a needle; (4) Steam Injector, a brass injector of pipes and a cone; (5) Opal Pyrometer, a cast instrument with an orange opal window; (6) Gauze Goggles, wire-gauze eyecups on a leather strap, brass rims; (7) Slag Wool Coat, a long grey wool work coat; (8) Smoked Lens, a single round blackened glass lens; (9) Furnace Goggles, goggles with dark smoked lenses in brass rims; (10) Slag Felt, a folded stiff grey felt sheet; (11) Studded Felt Coat, a grey felt work coat studded with iron rivets; (12) Bronze Eyecups, a pair of empty bronze goggle cups; (13) Founder's Goggles, heavy goggles with smoked lenses in bronze eyecups and a thick strap; (14) the Tailoring skill icon, a needle and thread crossed over a folded grey coat; (15) an empty armour slot, a bare iron coat hook on a small plate, drawn faint; (16) an empty weapon slot, two bare iron pegs of a tool rack, drawn faint. FORMAT: one square image (1:1 aspect ratio), divided into an exact grid of equal cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

## 14. Rustmoor's gear and tools (3 sheets), 30 October 2026

Work order 030 adds 44 pieces and tools with no icon: four tiers in each of six slots and five tools. Each sheet runs one item to a row: brass, iron, steel, then the special fourth tier, so a row reads as a ladder and the tiers stay consistent. Brass is warm yellow, iron is dull dark grey, steel is bright blue-grey, and the fourth tier is steel with its extra part shown clearly. Attach `art/splash.jpg`, `sheet-b-weapons-and-tools.jpeg` and `cinderworks-e.jpeg` to each, so the metals match the weapons and the armour matches the Cinderworks coats and goggles. Save as `art/concepts/sheets/gear-f.jpeg`, `gear-g.jpeg` and `gear-h.jpeg`.

Drawn 30 October and in the game. F and G match the earlier sheets. H came out softer and less pixelled than F and G. It also painted the iron ladle and the iron hook verdigris green, and left green blotches on the brass ladle and hook, so iron reads as old copper. The redraw below fixed the metals and replaced it. It came back as a 4 by 4 grid with the ladle row drawn twice, so the import skips the third row.

**Sheet H redraw** (attach `gear-g.jpeg` and the first `gear-h.jpeg`):
```
Redraw the attached sheet of twelve tools in exactly the style of the other attached sheet (the shields, picks and tongs): crisp hard-edged pixel art, a clean 1-pixel soot outline, no soft shading. Keep the same twelve objects in the same places and the same 4 by 3 grid, and fix the metals so each row reads brass, iron, steel, special steel, matching the picks and tongs: (1) the brass items are clean warm yellow brass with no green patina; (2) the iron items are dull dark grey iron, like the iron pick and the iron tongs, with no green or teal anywhere; (3) the steel items are bright blue-grey steel; (4) the fourth items are steel with their brass or silver extras. Thin dark gridlines between the cells, as on the other sheet. The background is flat #FF00FF magenta, not a checkerboard. No labels, no text.
```

**Sheet F, body, head, hands and feet (4 by 4):**
```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore. A 4 by 4 sheet of sixteen 64 by 64 armour icons, each an object on its own with no one wearing it, read left to right, top to bottom. Each row is one piece in four metals: warm yellow brass, then dull dark grey iron, then bright blue-grey steel, then a special steel version. Row 1, body armour: (1) Brass Breastplate, a thin brass chest plate hammered from one sheet; (2) Iron Cuirass, front and back grey iron plates buckled at the sides; (3) Steel Cuirass, a smooth blued steel cuirass; (4) Ribbed Cuirass, a steel cuirass with thin curved umbrella ribs riveted across it. Row 2, helmets: (5) Brass Skullcap, a plain round brass cap; (6) Iron Pot Helm, an iron helm shaped like a cooking pot, with a small handle; (7) Steel Sallet, a steel helmet with a long tail sweeping down at the back; (8) Visored Sallet, the steel sallet with a visor made of flattened silver spoons, their crests showing. Row 3, gauntlets, shown as a single gauntlet: (9) Brass Knuckle-Guards, brass plates strapped across the knuckles of a leather glove; (10) Iron Gauntlets, an iron gauntlet with jointed fingers; (11) Steel Gauntlets, a slim steel gauntlet with fine finger plates; (12) Geared Gauntlets, a steel gauntlet with small brass clock gears set into the knuckles. Row 4, footwear, shown as a single boot from the side: (13) Brass Toecaps, a leather boot with a brass cap riveted over the toe; (14) Iron Sabatons, an iron foot plate strapped over a boot; (15) Steel Sabatons, a jointed steel sabaton; (16) Hobnailed Sabatons, a steel sabaton whose sole bristles with nail heads. FORMAT: one square image (1:1 aspect ratio), divided into an exact grid of equal cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

**Sheet G, shields, trinkets, picks and tongs (4 by 4):**
```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore. A 4 by 4 sheet of sixteen 64 by 64 item icons, each an object on its own, read left to right, top to bottom. Each row is one item in four metals: warm yellow brass, then dull dark grey iron, then bright blue-grey steel, then a special steel version. Row 1, shields, seen from the front: (1) Brass Buckler, a small round brass buckler the size of a saucepan lid; (2) Iron Targe, a round iron targe with a dent in it; (3) Steel Shield, a larger riveted steel shield; (4) Garnet-Boss Shield, the steel shield with a red garnet set in its central boss. Row 2, measuring instruments: (5) Brass Plumb Bob, a pointed brass plumb bob hanging on a cord; (6) Iron Dividers, a pair of iron dividers, legs open; (7) Steel Vernier, a steel sliding vernier caliper; (8) Garnet Pendulum, a clock pendulum rod with a red garnet as its bob. Row 3, picks, drawn diagonally with the head at top right: (9) Brass Pick, a brass pickaxe on a wooden handle; (10) Iron Pick, an iron pickaxe; (11) Steel Pick, a bright steel pickaxe; (12) Garnet-Tipped Pick, a steel pickaxe with red crushed garnet glittering on its point. Row 4, forge tongs, drawn diagonally with the jaws at top right: (13) Brass Tongs, short brass tongs; (14) Iron Tongs, long-handled iron tongs; (15) Steel Tongs, steel tongs with flat square jaws; (16) Spring Tongs, steel tongs with a curved umbrella-rib spring between the handles. FORMAT: one square image (1:1 aspect ratio), divided into an exact grid of equal cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

**Sheet H, driver rolls, ladles and salvage hooks (4 by 3):**
```
Pixel art sprite for a steampunk idle game, "The Long Boil". Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights, small ember #E0702E accents. Clean 1-pixel dark outline, hard pixel edges, no anti-aliasing, readable silhouette at small size. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore. A 4 by 3 sheet of twelve 64 by 64 item icons, four across and three down, each an object on its own, read left to right, top to bottom. Each row is one tool in four metals: warm yellow brass, then dull dark grey iron, then bright blue-grey steel, then a special steel version. Row 1, tool rolls, each an open brown leather roll with handles poking out of its pockets: (1) Brass Driver Roll, holding three brass screwdrivers; (2) Iron Driver Roll, iron screwdrivers and a fan of feeler gauges; (3) Steel Driver Roll, bright steel screwdrivers and gauges; (4) Watchmaker's Roll, a row of tiny pin-thin steel drivers. Row 2, ladles, drawn diagonally with the bowl at bottom left: (5) Brass Ladle, a deep brass ladle; (6) Iron Ladle, an iron ladle with a hooked handle end; (7) Steel Ladle, a steel ladle with a pouring lip; (8) Crested Ladle, a steel ladle with a fancy silver spoon riveted on as its lip, a small crest on the spoon. Row 3, salvage hooks, drawn diagonally with the hook at top right: (9) Brass Salvage Hook, a brass hook on a wooden broom handle; (10) Iron Salvage Hook, an iron hook with a barb; (11) Steel Salvage Hook, a long steel hook on a steel pole; (12) Clockwork Grapnel, a steel three-pronged grapnel with brass clock gears at its hub. FORMAT: one image in a 4:3 aspect ratio, divided into an exact grid of equal square cells (the grid size is given above). One sprite per cell, centred, the same size and the same baseline in every cell. The background is one flat solid colour, pure magenta #FF00FF, filling every cell edge to edge: no checkerboard, no transparency pattern, no gradient, no shadow on the background, no gridlines, no borders, no labels, no text, no numbers.
```

## Order of work

Backgrounds and skill icons change the look most for the least work, so start there. Then Sheets A and B (every tile and the stores grid use them), the Rust Rats and Scrapjaw, the Tinker, and the vignettes.
