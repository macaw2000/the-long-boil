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

Holding each of the 14 weapons in the Loadout portrait is a later sheet. Ask me for that prompt when this one is in.

## 6. Story vignettes (1 sheet, 3 by 2)

The square picture on each Story card, which today is a plain brass box with the place's name. 96 by 96 each.

```
[pixel-art block] A 3 by 2 sheet of six small square scenes, each a framed vignette of a place in Kettleport, no people: (1) Sprocket Row, a narrow workshop street with pneumatic tubes; (2) the Rustmoor Scrapyards, scrap heaps under grey sky; (3) the Lowvents, a steep iron stair down to steaming vents; (4) the Polytechnic, a brass-domed lecture hall; (5) the Brass Exchange, the big brass order board; (6) the Infirmary of St. Pinion, a quiet ward with iron beds. [format block, but say "a 3 by 2 grid" and "3:2 aspect ratio"]
```

## Order of work

Backgrounds and skill icons change the look most for the least work, so start there. Then Sheets A and B (every tile and the stores grid use them), the Rust Rats and Scrapjaw, the Tinker, and the vignettes.
