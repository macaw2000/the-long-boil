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

The splash now drifts, steams and sparks, but it is one flat picture, so nothing in it moves against anything else. Cut into layers, the airships can sail across, and the sky, rooftops and Tinker can shift by different amounts as the mouse moves.

Every layer has to line up with the others, so **each prompt is an edit of `art/splash.jpg`, not a new painting**: attach it to every request, and if a result moves anything, say "keep everything exactly where it is in the attached image" in a follow-up. Painted edges key out of magenta worse than pixel art, so every cutout asks for crisp edges with no glow or haze on the magenta. Ask for the same 16:9 shape as the original every time (it is 1376 by 768).

1. **`splash-sky`** (back): "Edit the attached image. Remove the Tinker, the title plaque and its subtitle, all the airships, and all the rooftops, domes, boilers, chimneys and planks. Keep only the sky, the clouds, the sun and the distant floating islands, and paint in the sky behind everything you removed so it continues naturally. Keep the same painterly style, colours and lighting, and the same 16:9 shape. No text, no people, no airships."
2. **`splash-roofs`** (middle): "Edit the attached image. Keep the rooftops, the copper domes, the boiler tanks, the chimneys and the brass plank roof exactly where they are, and paint in the planks behind where the Tinker sat. Remove the Tinker, the title plaque and its subtitle, and the airships. Replace the whole sky, clouds and floating islands with one flat solid pure magenta #FF00FF, edge to edge: crisp edges where the roofs meet the magenta, no glow, no haze, no steam over the magenta. Same 16:9 shape, no text."
3. **`splash-tinker`** (front): "Edit the attached image. Keep only the Tinker, exactly as drawn and exactly where they sit, including the goggles, the pocket watch and its chain. Replace everything else, the roof they sit on included, with one flat solid pure magenta #FF00FF, edge to edge: crisp edges, no shadow, no glow, no outline halo. Same 16:9 shape, no text."
4. **`splash-title`** (front): "Edit the attached image. Keep only the title plaque, "The Long Boil", and the "A Steampunk Idle Game" plaque under it, exactly as drawn and exactly where they are, with their lettering unchanged. Replace everything else with one flat solid pure magenta #FF00FF, edge to edge: crisp edges, no shadow, no glow. Same 16:9 shape."
5. **`splash-airships`** (sheet): "Painterly style matching the attached image. Three small steampunk airships, like the ones in the attached image's sky: (1) a long cigar-shaped airship with sails and a gondola, (2) a small round balloon with a basket and a propeller, (3) a squat cargo airship with a boxy gondola. Each one is whole, side view facing right, centred in its own cell of a 2 by 2 grid; the fourth cell is empty. Background: one flat solid pure magenta #FF00FF in every cell, edge to edge: crisp edges, no clouds, no steam, no shadow, no gridlines, no text. 1:1 aspect ratio."

Save them as JPEGs in `~/Downloads` with those names. I'll check that the four full-frame layers line up with the original by overlaying each one on it, key out the magenta, and wire the layers into the splash. The current animated splash stays as the fallback until they're in.

## Order of work

Backgrounds and skill icons change the look most for the least work, so start there. Then Sheets A and B (every tile and the stores grid use them), the Rust Rats and Scrapjaw, the Tinker, and the vignettes.
