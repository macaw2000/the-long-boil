# The Long Boil: Concept Art Brief

A steampunk idle game. This brief keeps every generated image looking like one game. Use the style block on every prompt, then add one subject from the list below.

## 1. Style guide

**Mood:** cozy, whimsical, and handmade. Think of a tinkerer's workshop on a sky island, not a grim industrial wasteland. Steam is warm, not toxic. Machines look lovingly repaired, with patches and rivets.

**Setting:** the Aethersea, a sky of floating islands linked by airships. The hub city is Kettleport, built around giant kettle-shaped boilers. The farther from Kettleport, the stormier and more dangerous the islands get.

**Shapes:** rounded boilers, pipes, gauges with needles, rivets, gears, and copper domes. Silhouettes should read clearly at small sizes.

**Palette** (use these hex values for the sprites and UI):

| Name | Hex | Use |
| --- | --- | --- |
| Brass | `#B5893B` | Primary metal, UI frames |
| Copper | `#B8673A` | Secondary metal, warm accents |
| Verdigris | `#4F8A7A` | Patina, highlights, success states |
| Soot | `#2B2522` | Outlines, shadows, dark UI background |
| Cream | `#EFE4CC` | Paper, text panels, steam highlights |
| Ember | `#E0702E` | Fire, furnaces, alerts (use sparingly) |
| Storm | `#5B6B8C` | Thunderhead Reach sky and lightning zones |

**Style block** (paste at the start of every prompt):

```
Steampunk idle game concept art for "The Long Boil." Floating sky-island world of brass and copper, verdigris patina, coal soot, warm steam haze. Palette: brass, copper, verdigris green, soot black, cream, small accents of ember orange. Cozy and whimsical, lovingly repaired machines, rivets and gauges. Not grimdark, no gore.
```

**Avoid** (add to negative prompts where the tool supports them): photorealism, modern technology, plastic, neon, cyberpunk, gore, text or lettering in the image, watermarks.

## 2. Two kinds of art

| Kind | Purpose | Format | Tools that suit it |
| --- | --- | --- | --- |
| Mood art | Lock the look; GDD and pitch deck | Painterly, 16:9, 1920×1080 or larger | ChatGPT image generation, Gemini, Midjourney, Adobe Firefly |
| Sprite concepts | Close to in-game assets | 48×48 pixel art for characters and monsters, 32×32 for item icons | PixelLab, Retro Diffusion, or an artist |

Do mood art first. Pick the 2 or 3 images that feel most like the game and use them as style references (image-to-image or "style reference") for everything after, so the look stays consistent.

## 3. Mood art subjects

Add one of these after the style block.

1. **Key art.** A young Tinker in goggles and a patched leather apron sits on a brass rooftop in Kettleport at golden hour, a pocket gauge in hand, while airships drift between floating islands and giant kettle boilers vent steam behind them. Wide cinematic shot.
2. **Kettleport.** Hub city of floating islands joined by copper bridges, kettle-shaped boiler towers, market stalls with brass awnings, airships docking at mooring masts. Bustling, warm, late afternoon.
3. **The Boiler.** Close-up of a Tinker's personal boiler with a large brass pressure gauge whose needle is slowly dropping, steam curling from a safety valve, a cup of tea beside it on a workbench. Quiet, cozy, night lighting.
4. **Rustmoor Scrapyards** (zone 1). A junkyard island of rusted machinery and broken airship hulls, scurrying rust-colored rats with gear-tooth backs, a giant mechanical crocodile skeleton (Scrapjaw) half-buried in scrap. Overcast morning.
5. **Cinderworks Foundry** (zone 2). An island-sized foundry glowing with molten metal, soot wraiths drifting through smoke, coal golems with furnace hearts, enormous bellows pumping. Ember orange against soot black.
6. **Thunderhead Reach** (zone 3). Jagged islands inside a permanent storm, lightning arcing between copper lightning rods, harpies with brass-feathered wings, electric eels swimming through the clouds. Storm blue palette.
7. **The Lightning Baron** (semester endgame boss). A towering aristocratic automaton in a tailcoat of copper plates, a tesla-coil staff crackling in one hand, a top hat with a lightning rod, standing on a storm-lashed platform.
8. **The Brass Exchange.** A grand trading hall with a giant mechanical order board of flipping brass tiles, pneumatic tubes carrying goods, traders in waistcoats. Busy, warm interior light.
9. **The Iron Dreadnought** (future dungeon boss). A colossal armored airship in a hangar, gun turrets and smokestacks, a five-person party of Tinkers silhouetted at its base for scale.

## 4. Sprite concepts

Add this sprite block instead of the style block for pixel art:

```
48x48 pixel art sprite for a steampunk idle game. Limited palette: brass #B5893B, copper #B8673A, verdigris #4F8A7A, soot #2B2522 outlines, cream #EFE4CC highlights. Side view, facing right, clean 1-pixel dark outline, transparent background, readable silhouette.
```

**The Tinker** (paper doll, so gear swaps on the sprite):
- Base Tinker in a work shirt, goggles pushed up, no gear
- Tier 1 gear: Brass Spanner (weapon), leather apron, copper goggles
- Tier 2 gear: Bellows Plate armor, riveted gauntlets
- Tier 3 gear: Baron's Coil Staff, storm-proof greatcoat
- Skilling poses: hammering at an anvil (Smithing), swinging a pick (Prospecting), pouring from a kettle (Tea Blending)

**Monsters** (each needs a 4-frame idle and a 6-frame attack):
- Rust Rat, Sprocket Mite, Boiler Slime (Rustmoor)
- Soot Wraith, Coal Golem, Slag Hound (Cinderworks)
- Storm Harpy, Tesla Eel, Gale Kite (Thunderhead)

**Bosses** (96×96, double size): Scrapjaw, Old Bellows, the Lightning Baron

**Item icons** (32×32): Copper Ore, Zinc Ore, Brass Ingot, Brass Spanner, Ration, a tea cup, Gilded Cog, Cog Crate, Safety Valve, Schematic scroll

## 5. UI concepts

These are good to mock up early because they define the game's feel more than any single sprite.

- **Boiler gauge:** a round brass pressure gauge with a needle, marked 0 to 12 hours, venting steam near empty
- **Action panel:** a progress bar styled as a glass tube filling with steam
- **While You Were Away ledger:** a cream paper receipt with a brass clip, listing items and level-ups
- **Brass Gazette:** a one-page Victorian newspaper front page

## 6. Workflow

1. Generate 4 to 8 variations of the key art and Kettleport. Pick the strongest as your style reference.
2. Generate the three zones and the Lightning Baron using that reference.
3. Move to sprites with a pixel-art tool, starting with the base Tinker and Rust Rat.
4. Keep every keeper in `art/concepts/` in this repo, with the prompt saved next to it as a `.txt` file of the same name, so any image can be regenerated or extended later.
