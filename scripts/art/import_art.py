"""Cuts the Gemini art sheets into the game's sprites, icons and backgrounds.

The sheets were drawn to docs/art-requests.md: pixel art on a flat magenta
(#FF00FF) background in a grid of equal cells. This script removes the
magenta, cuts each cell, sizes it to the slot the game draws it in, and
lines up a character's frames on one ground line so an animation does not
jump. Two sheets need more care: the Rust Rats came with labels painted in,
so each rat is found by its shape rather than its cell, and the story
vignettes have a place name under each picture, which is cropped off.

Run from the repo root (it needs Pillow: pip install pillow):
    python3 scripts/art/import_art.py
Reads  art/concepts/sheets/*.jpeg (the originals, kept out of the public sync)
Writes engine/packages/client/assets/art/*.png  (sprites; the build index prefers these)
       art/bg/*.jpg                             (the paintings behind each place)
       engine/packages/client/assets/{icon,favicon,...}.png  (the app and browser icons)
Then run scripts/art/build_sprites.py to rebuild the client's sprite index.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / "art" / "concepts" / "sheets"
SPRITES = ROOT / "engine" / "packages" / "client" / "assets" / "art"
PAINTINGS = ROOT / "art" / "bg"

# Slot sizes, as the client draws them (scripts/art/build_sprites.py): icons
# 64, characters 144, the boss and the Loadout portrait 192, vignettes 192.
ICON = 64
CHARACTER = 144
BOSS = 192
PORTRAIT = 192
VIGNETTE = 192


# ------------------------------------------------------------ the magenta key


def is_magenta(r: int, g: int, b: int) -> bool:
    """The background: strongly red and blue, little green. JPEG blurs it, so allow a margin."""
    return r > 150 and b > 150 and g < 120 and min(r, b) - g > 80


def keyed(image: Image.Image) -> Image.Image:
    """The image with its magenta made transparent, and the pink fringe JPEG leaves at edges darkened."""
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            if is_magenta(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif min(r, b) - g > 45 and r > 90 and b > 90:
                # A half-magenta edge pixel: keep it, but as the outline's dark colour.
                pixels[x, y] = (43, 37, 34, 255)
    return image


def content_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    """The box around everything not transparent."""
    return image.getchannel("A").getbbox()


def cells(sheet: Image.Image, cols: int, rows: int, inset: float = 0.03) -> list[Image.Image]:
    """The grid's cells, read left to right then top to bottom, each trimmed by a little to drop gridlines."""
    width, height = sheet.size
    cell_w, cell_h = width / cols, height / rows
    out = []
    for row in range(rows):
        for col in range(cols):
            left, top = col * cell_w, row * cell_h
            box = (
                round(left + cell_w * inset),
                round(top + cell_h * inset),
                round(left + cell_w * (1 - inset)),
                round(top + cell_h * (1 - inset)),
            )
            out.append(sheet.crop(box))
    return out


# --------------------------------------------------------------- fitting


def fit_icon(cell: Image.Image, size: int = ICON, margin: float = 0.06) -> Image.Image:
    """An icon centred in a square, as large as it fits."""
    box = content_box(cell)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if not box:
        return canvas
    art = cell.crop(box)
    room = size * (1 - 2 * margin)
    scale = min(room / art.width, room / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def fit_frames(frames: list[Image.Image], size: int, margin: float = 0.05, flip: bool = False) -> list[Image.Image]:
    """
    A character's frames at one scale, centred across and standing on one
    ground line, so the animation does not jump. The scale is set by the
    largest frame, so every frame fits.
    """
    boxes = [content_box(frame) for frame in frames]
    arts = [frame.crop(box) if box else Image.new("RGBA", (1, 1)) for frame, box in zip(frames, boxes)]
    widest = max(art.width for art in arts)
    tallest = max(art.height for art in arts)
    room = size * (1 - 2 * margin)
    scale = min(room / widest, room / tallest)
    out = []
    for art in arts:
        if flip:
            art = art.transpose(Image.FLIP_LEFT_RIGHT)
        art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ground = round(size * (1 - margin))
        canvas.alpha_composite(art, ((size - art.width) // 2, ground - art.height))
        out.append(canvas)
    return out


def fit_together(frames: list[Image.Image], size: int, tall: int, reference: int = 0, margin: float = 0.05) -> list[Image.Image]:
    """
    Frames cut from one sheet, kept where each sits in its cell and scaled
    alike, so the figure in frames[reference] is `tall` pixels high, and
    standing on the same ground line as fit_frames. Used where a lunge
    should read as a lunge, which centring each frame on its own box would
    undo, and so the Tinker is one size on every sheet.
    """
    boxes = [box for box in (content_box(frame) for frame in frames) if box]
    left, top = min(b[0] for b in boxes), min(b[1] for b in boxes)
    right, bottom = max(b[2] for b in boxes), max(b[3] for b in boxes)
    own = content_box(frames[reference])
    scale = tall / (own[3] - own[1])
    width, height = round((right - left) * scale), round((bottom - top) * scale)
    ground = round(size * (1 - margin))
    out = []
    for frame in frames:
        art = frame.crop((left, top, right, bottom)).resize((width, height), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.alpha_composite(art, ((size - width) // 2, ground - height))
        out.append(canvas)
    return out


def feet_like(frame: Image.Image, like: Image.Image, band: float = 0.1) -> Image.Image:
    """The frame moved sideways so its feet stand where `like`'s do: for a pose that should not move."""
    def feet(image: Image.Image) -> float:
        box = image.crop((0, round(image.height * (1 - band)), image.width, image.height)).getchannel("A").getbbox()
        return (box[0] + box[2]) / 2
    moved = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    moved.alpha_composite(frame, (round(feet(like) - feet(frame)), 0))
    return moved


def save(image: Image.Image, name: str) -> None:
    SPRITES.mkdir(parents=True, exist_ok=True)
    image.save(SPRITES / f"{name}.png", optimize=True)


# ------------------------------------------------------- shapes, for the rats


def components(image: Image.Image, min_area: int) -> list[tuple[int, int, int, int, int]]:
    """Each separate shape in a keyed image as (left, top, right, bottom, area), smaller ones dropped."""
    alpha = image.getchannel("A")
    width, height = image.size
    solid = bytearray(1 if a else 0 for a in alpha.tobytes())
    seen = bytearray(width * height)
    found = []
    for start in range(width * height):
        if not solid[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        left, top, right, bottom, area = width, height, 0, 0, 0
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            area += 1
            left, top, right, bottom = min(left, x), min(top, y), max(right, x), max(bottom, y)
            for neighbour in (index - 1 if x else -1, index + 1 if x < width - 1 else -1, index - width, index + width):
                if 0 <= neighbour < width * height and solid[neighbour] and not seen[neighbour]:
                    seen[neighbour] = 1
                    stack.append(neighbour)
        if area >= min_area:
            found.append((left, top, right + 1, bottom + 1, area))
    return found


def rows_by_gaps(centres: list[float], count: int) -> list[float]:
    """Where to split sorted centres into `count` rows: at the largest gaps."""
    ordered = sorted(centres)
    gaps = sorted(range(1, len(ordered)), key=lambda i: ordered[i] - ordered[i - 1], reverse=True)[: count - 1]
    return sorted((ordered[i - 1] + ordered[i]) / 2 for i in gaps)


def without_gridlines(image: Image.Image, dark: int = 70, share: float = 0.9) -> Image.Image:
    """
    The image with its gridlines made clear: a row or column of pixels that
    is dark almost all the way across the sheet, which no sprite is. Left in,
    a gridline would join every sprite into one shape.
    """
    pixels = image.load()
    width, height = image.size

    def is_dark(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        return a > 0 and r + g + b < dark * 3

    rows = [y for y in range(height) if sum(1 for x in range(width) if is_dark(x, y)) > width * share]
    cols = [x for x in range(width) if sum(1 for y in range(height) if is_dark(x, y)) > height * share]
    for y in rows:
        for dy in (-2, -1, 0, 1, 2):
            if 0 <= y + dy < height:
                for x in range(width):
                    pixels[x, y + dy] = (0, 0, 0, 0)
    for x in cols:
        for dx in (-2, -1, 0, 1, 2):
            if 0 <= x + dx < width:
                for y in range(height):
                    pixels[x + dx, y] = (0, 0, 0, 0)
    return image


def rat_frames(sheet: Image.Image) -> list[list[Image.Image]]:
    """The four rats' five frames each, found by shape; painted labels and loose smoke puffs are too small to count."""
    image = without_gridlines(keyed(sheet))
    shapes = components(image, min_area=2500)
    width = image.width
    splits = rows_by_gaps([(top + bottom) / 2 for _, top, _, bottom, _ in shapes], 4)
    grid: dict[tuple[int, int], list[tuple[int, int, int, int]]] = {}
    for left, top, right, bottom, _ in shapes:
        col = min(4, int(((left + right) / 2) / (width / 5)))
        row = sum(1 for split in splits if (top + bottom) / 2 > split)
        grid.setdefault((row, col), []).append((left, top, right, bottom))
    rats = []
    for row in range(4):
        frames = []
        for col in range(5):
            boxes = grid.get((row, col))
            if not boxes:
                raise SystemExit(f"rust-rats.jpeg: no rat found in row {row + 1}, frame {col + 1}")
            box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
            # Keep only the shapes found in this cell: a label inside the box is blanked out.
            frame = Image.new("RGBA", image.size, (0, 0, 0, 0))
            for b in boxes:
                frame.alpha_composite(image.crop(b), (b[0], b[1]))
            frames.append(frame.crop(box))
        rats.append(frames)
    return rats


# ------------------------------------------------------------------ sheets


SKILLS = ["prospecting", "smithing", "tinkering", "cooking", "scavenging", "fight"]

SHEET_A = ["copper", "iron_ore", "coal", "garnet", "brass_ingot", "iron_ingot", "steel_ingot", "rat_scrap",
           "barley_meal", "salt_pork", "rustmoor_ration", "bent_nails", "umbrella_ribs", "odd_spoons", "clock_movement",
           "cracked_gauge_glass"]
REDRAWN_ICONS = {"brass_catapult": "icon-brass-slingshot.jpeg"}
SHEET_B = ["steel_blade", "brass_spanner", "iron_crowbar", "riveting_hammer", "scrapjaws_cleaver", "brass_catapult", "iron_rifle",
           "steel_carbine", "garnet_rifle", "copper_coil", "spark_rod", "brass_sparker", "garnet_rod", "brass_key", "iron_lock",
           "garnet_sight"]
# Sheet C: the first five are items, the rest the interface's own icons. One Ledger Page icon serves all five pages.
SHEET_C_ITEMS = ["ledger_page", "foundry_pass", "board_memo", "ballast_day_ribbon", "misstruck_crown"]
SHEET_C_UI = ["crowns", "nerve", "scald", "arrears", "notice", "boiler", "post", "exchange", "guild", "chat", "locked"]
# Work orders 027 and 028 (docs/art-requests.md, 13): the Cinderworks' materials, then its goods, armour and
# Tailoring; Sheet E's last three cells are Tailoring's skill icon and the Loadout's two empty slots.
SHEET_D = ["tin_ore", "nickel_ore", "steam_coal", "manganese_ore", "fire_opal", "cinders", "slag_iron", "slag_glass",
           "burnt_tuyere", "spoiled_casting", "bronze_ingot", "nickel_steel_ingot", "boiler_plate", "manganese_steel_ingot",
           "clinker_bar", "slag_wool"]
SHEET_E = ["bronze_valve", "valve_key", "pressure_gauge", "steam_injector", "opal_pyrometer", "gauze_goggles", "slag_wool_coat",
           "smoked_lens", "furnace_goggles", "slag_felt", "studded_felt_coat", "bronze_eyecups", "founders_goggles"]
SHEET_E_REST = ["skill_tailoring", "ui_empty_armour", "ui_empty_weapon"]
# Rustmoor's gear and tools (art request 14): one item a row, brass, iron, steel, then the fourth tier.
GEAR = {
    "gear-f.jpeg": (4, 4, ["brass_breastplate", "iron_cuirass", "steel_cuirass", "ribbed_cuirass",
                           "brass_skullcap", "iron_pot_helm", "steel_sallet", "visored_sallet",
                           "brass_knuckle_guards", "iron_gauntlets", "steel_gauntlets", "geared_gauntlets",
                           "brass_toecaps", "iron_sabatons", "steel_sabatons", "hobnailed_sabatons"]),
    "gear-g.jpeg": (4, 4, ["brass_buckler", "iron_targe", "steel_shield", "garnet_boss_shield",
                           "brass_plumb_bob", "iron_dividers", "steel_vernier", "garnet_pendulum",
                           "brass_pick", "iron_pick", "steel_pick", "garnet_pick",
                           "brass_tongs", "iron_tongs", "steel_tongs", "spring_tongs"]),
    # The redraw came back 4 by 4 with the ladle row drawn twice; the second is skipped.
    "gear-h.jpeg": (4, 4, ["brass_driver_roll", "iron_driver_roll", "steel_driver_roll", "watchmakers_roll",
                           "brass_ladle", "iron_ladle", "steel_ladle", "crested_ladle",
                           None, None, None, None,
                           "brass_salvage_hook", "iron_salvage_hook", "steel_salvage_hook", "clockwork_grapnel"]),
}
LEDGER_PAGES = ["ledger_page_1", "ledger_page_drop_1", "ledger_page_drop_2", "ledger_page_drop_3", "ledger_page_drop_4"]

RATS = ["rust_rat_runt", "rust_rat_scrounger", "rust_rat_tinplate", "rust_rat_gaffer"]
FRAMES = ["idle0", "idle1", "attack0", "attack1", "dead"]

# The Tinker sheet, two frames a pose: the client's pose names. Redrawn on 27 October in the
# armed sheets' style, so the Tinker at work and the Tinker fighting are the same person.
TINKER_POSES = ["idle", "pick", "hammer", "tinker", "cook", "scavenge", "attack", "portrait"]

# The armed Tinker: a ready frame then an attack frame per weapon, on two sheets.
ARMED = {
    "tinker-armed-w1.jpeg": (4, 4, ["brass_spanner", "steel_blade", "iron_crowbar", "riveting_hammer", "scrapjaws_cleaver",
                                    "brass_catapult", "iron_rifle", "steel_carbine"]),
    "tinker-armed-w2.jpeg": (4, 3, ["garnet_rifle", "copper_coil", "spark_rod", "brass_sparker", "garnet_rod"]),
}
# The Tinker's height on screen, head to foot, in the scene and in the Loadout.
TINKER_TALL = 119
PORTRAIT_TALL = 173

# The Cog Shop sheet: the crate is an item; the rest are the interface's own icons.
COG_SHOP_UI = ["cogs", "shop", "boost"]

VIGNETTES = ["sprocket_row", "rustmoor", "lowvents", "polytechnic", "brass_exchange", "infirmary"]

BACKGROUNDS = ["workshop", "rustmoor", "sprocket_row", "brass_exchange", "guildhall"]


def sheet(name: str) -> Image.Image:
    return Image.open(SHEETS / name).convert("RGB")


def main() -> None:
    written = 0

    for skill, cell in zip(SKILLS, cells(sheet("skillicons.jpeg"), 3, 2)):
        save(fit_icon(keyed(cell)), f"skill_{skill}")
        written += 1

    for names, file in ((SHEET_A, "sheet-a-materials-and-food-icons.jpeg"), (SHEET_B, "sheet-b-weapons-and-tools.jpeg")):
        for item, cell in zip(names, cells(sheet(file), 4, 4)):
            save(fit_icon(keyed(cell)), f"icon_{item}")
            written += 1

    # Gemini drew gridlines on both Cinderworks sheets, so they are cleared before the cells are cut.
    cinderworks = [fit_icon(cell) for cell in cells(without_gridlines(keyed(sheet("cinderworks-d.jpeg"))), 4, 4)]
    cinderworks += [fit_icon(cell) for cell in cells(without_gridlines(keyed(sheet("cinderworks-e.jpeg"))), 4, 4)]
    for name, icon in zip([f"icon_{item}" for item in SHEET_D + SHEET_E] + SHEET_E_REST, cinderworks):
        save(icon, name)
        written += 1
    # Sheet E's Tailoring icon crossed two needles into an X that read as "no coats"; it was redrawn alone.
    redrawn = keyed(sheet("skill-tailoring.jpeg"))
    save(fit_icon(redrawn.crop(content_box(redrawn))), "skill_tailoring")

    for file, (cols, rows, items) in GEAR.items():
        for item, cell in zip(items, cells(without_gridlines(keyed(sheet(file))), cols, rows)):
            if item is None:
                continue
            save(fit_icon(cell), f"icon_{item}")
            written += 1

    # Icons redrawn alone replace their sheet's cell: Sheet B's Brass Catapult came out a siege engine,
    # not the slingshot the Tinker holds (docs/art-requests.md, 12).
    for item, file in REDRAWN_ICONS.items():
        if (SHEETS / file).exists():
            redrawn = keyed(sheet(file))
            save(fit_icon(redrawn.crop(content_box(redrawn))), f"icon_{item}")

    sheet_c = [fit_icon(keyed(cell)) for cell in cells(sheet("sheet-c-papers-curios-icons.jpeg"), 4, 4)]
    for item, icon in zip(SHEET_C_ITEMS, sheet_c):
        for name in LEDGER_PAGES if item == "ledger_page" else [item]:
            save(icon, f"icon_{name}")
            written += 1
    for name, icon in zip(SHEET_C_UI, sheet_c[len(SHEET_C_ITEMS):]):
        save(icon, f"ui_{name}")
        written += 1

    # Gemini drew the monsters facing right; in the scene they stand on the right, facing the Tinker.
    for variant, frames in zip(RATS, rat_frames(sheet("rust-rats.jpeg"))):
        for frame_name, frame in zip(FRAMES, fit_frames(frames, CHARACTER, flip=True)):
            save(frame, f"{variant}_{frame_name}")
            written += 1
    scrapjaw = [keyed(cell) for cell in cells(sheet("scrapjaw.jpeg"), 3, 2, inset=0.01)][:5]
    for frame_name, frame in zip(FRAMES, fit_frames(scrapjaw, BOSS, flip=True)):
        save(frame, f"scrapjaw_{frame_name}")
        written += 1

    # Gemini's thin gridlines run into the cells and the feet reach the cells' edges, so the
    # gridlines are cleared first and the cells barely trimmed.
    tinker = cells(without_gridlines(keyed(sheet("tinker-at-work.jpeg"))), 4, 4, inset=0.004)
    # The second breath was drawn about 30 pixels to the right; standing still, it should not move.
    tinker[1] = feet_like(tinker[1], tinker[0])
    working = fit_together(tinker[:14], CHARACTER, TINKER_TALL)
    for index, pose in enumerate(TINKER_POSES[:-1]):
        for frame in (0, 1):
            save(working[index * 2 + frame], f"tinker_{pose}_{frame}")
            written += 1
    for frame, image in enumerate(fit_together(tinker[14:], PORTRAIT, PORTRAIT_TALL)):
        save(image, f"tinker_bare_portrait_{frame}")
        written += 1

    for file, (cols, rows, weapons) in ARMED.items():
        armed = cells(without_gridlines(keyed(sheet(file))), cols, rows, inset=0.004)[: len(weapons) * 2]
        scene = fit_together(armed, CHARACTER, TINKER_TALL)
        portrait = fit_together(armed, PORTRAIT, PORTRAIT_TALL)
        for index, weapon in enumerate(weapons):
            ready, strike = index * 2, index * 2 + 1
            for name, frames in (("idle", (ready, ready)), ("attack", (ready, strike))):
                for frame, cell in enumerate(frames):
                    save(scene[cell], f"tinker_{weapon}_{name}_{frame}")
                    written += 1
            for frame in (0, 1):
                save(portrait[ready], f"tinker_{weapon}_portrait_{frame}")
                written += 1

    shop = [fit_icon(cell) for cell in cells(without_gridlines(keyed(sheet("cog-shop.jpeg"))), 2, 2, inset=0.01)]
    save(shop[0], "icon_cog_crate")
    written += 1
    for name, icon in zip(COG_SHOP_UI, shop[1:]):
        save(icon, f"ui_{name}")
        written += 1

    # Each vignette is a framed picture with its place's name painted below; keep the picture, square.
    for place, cell in zip(VIGNETTES, cells(sheet("story-vignettes.jpeg"), 3, 2, inset=0.02)):
        picture = cell.crop((0, 0, cell.width, round(cell.height * 0.86)))
        side = min(picture.size)
        left = (picture.width - side) // 2
        square = picture.crop((left, 0, left + side, side)).convert("RGBA")
        save(square.resize((VIGNETTE, VIGNETTE), Image.LANCZOS), f"vignette_{place}")
        written += 1

    # The paintings: full size behind each place, and a wide strip for the scene above the bench.
    PAINTINGS.mkdir(parents=True, exist_ok=True)
    for place in BACKGROUNDS:
        painting = sheet(f"{place}-bg.jpeg")
        painting.save(PAINTINGS / f"{place}.jpg", quality=82, optimize=True, progressive=True)
        written += 1
        if place in ("workshop", "rustmoor"):
            # The scene is 2.5 wide to 1 high; take the band where the floor is.
            width = painting.width
            height = round(width / 2.5)
            top = max(0, min(painting.height - height, round(painting.height * 0.55 - height / 2)))
            strip = painting.crop((0, top, width, top + height)).resize((960, 384), Image.LANCZOS)
            strip.save(SPRITES / f"bg_{place}.png", optimize=True)
            written += 1

    written += app_icons()
    written += splash_layers()
    written += letter()
    written += brassbuckle()
    print(f"wrote {written} files to {SPRITES.relative_to(ROOT)} and {PAINTINGS.relative_to(ROOT)}")


SOOT = (43, 37, 34, 255)
CLIENT_ASSETS = ROOT / "engine" / "packages" / "client" / "assets"


def app_icons() -> int:
    """
    The game's icon (art/concepts/sheets/icon.jpeg): a brass kettle-boiler on
    soot in a rounded square. Gemini filled the corners outside the rounding
    with white. The browser's icon keeps the rounding with clear corners; the
    app icons fill them with soot, since phones round app icons themselves.
    """
    source = Image.open(SHEETS / "icon.jpeg").convert("RGBA")
    pixels = source.load()
    width, height = source.size
    # The white corners: light pixels in each corner region, reached from the very corner.
    corner = round(width * 0.12)
    clear = source.copy()
    filled = source.copy()
    clear_px, filled_px = clear.load(), filled.load()
    for cx, cy in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        stack = [(cx, cy)]
        seen = set()
        while stack:
            x, y = stack.pop()
            if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
                continue
            if abs(x - cx) > corner or abs(y - cy) > corner:
                continue
            r, g, b, _ = pixels[x, y]
            if r + g + b < 3 * 150:
                continue
            seen.add((x, y))
            clear_px[x, y] = (0, 0, 0, 0)
            filled_px[x, y] = SOOT
            stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    filled.save(CLIENT_ASSETS / "icon.png", optimize=True)
    filled.resize((512, 512), Image.LANCZOS).save(CLIENT_ASSETS / "splash-icon.png", optimize=True)
    clear.resize((64, 64), Image.LANCZOS).save(CLIENT_ASSETS / "favicon.png", optimize=True)
    # Android's adaptive icon: the whole square as the foreground over a soot background, and a white silhouette.
    filled.save(CLIENT_ASSETS / "android-icon-foreground.png", optimize=True)
    Image.new("RGBA", (width, height), SOOT).save(CLIENT_ASSETS / "android-icon-background.png", optimize=True)
    silhouette = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    silhouette_px = silhouette.load()
    filled_px = filled.load()
    for y in range(height):
        for x in range(width):
            r, g, b, _ = filled_px[x, y]
            if r + g + b > 3 * 70:
                silhouette_px[x, y] = (255, 255, 255, 255)
    silhouette.save(CLIENT_ASSETS / "android-icon-monochrome.png", optimize=True)
    return 6


SPLASH = ROOT / "art" / "splash"


def keyed_painting(image: Image.Image) -> Image.Image:
    """
    A painted layer with its magenta made transparent. Unlike pixel art its
    edges are soft, so an edge pixel becomes partly clear, with the magenta
    taken back out of its colour, instead of a dark outline. Pink that JPEG
    bled into thin parts (railings, rigging) comes out too, and the edge is
    pulled in by a pixel so no pink halo is left against the sky.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            strength = min(r, b) - g
            alpha = max(0.0, min(1.0, (150 - strength) / 100))
            if alpha < 0.25:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if alpha < 1:
                # The pixel is alpha parts paint and the rest magenta (255, 0, 255): keep the paint.
                unmix = lambda channel, key: max(0, min(255, round((channel - (1 - alpha) * key) / alpha)))
                r, g, b = unmix(r, 255), unmix(g, 0), unmix(b, 255)
            # Despill: no paint here is redder and bluer than it is green, so any such excess is magenta bled in by JPEG.
            spill = max(0, min(r, b) - g)
            pixels[x, y] = (r - spill, g, b - spill, round(alpha * 255))
    image.putalpha(image.getchannel("A").filter(ImageFilter.MinFilter(3)))
    return image


def splash_layers() -> int:
    """
    The splash painting in layers, for parallax (docs/art-requests.md, 9):
    each one an edit of art/splash.jpg, so they line up drawn over each other
    at the same size. The sky is whole; the roofs and the front (the title
    with the Tinker) are keyed; the airships are cut from their 2 by 2 sheet.
    WebP keeps the clear parts at a tenth of a PNG's size.
    """
    SPLASH.mkdir(parents=True, exist_ok=True)
    sheet("splash-sky.jpeg").save(SPLASH / "sky.jpg", quality=82, optimize=True, progressive=True)
    for layer in ("roofs", "front"):
        keyed_painting(sheet(f"splash-{layer}.jpeg")).save(SPLASH / f"{layer}.webp", quality=85, method=6)
    airships = without_gridlines(sheet("splash-airships.jpeg").convert("RGBA"))
    for index, cell in enumerate(cells(airships.convert("RGB"), 2, 2)[:3]):
        ship = keyed_painting(cell)
        ship = ship.crop(content_box(ship))
        ship.thumbnail((360, 360), Image.LANCZOS)
        ship.save(SPLASH / f"airship{index + 1}.webp", quality=85, method=6)
    return 6



LETTER = ROOT / "art" / "letter"


def pieces(image: Image.Image) -> list[Image.Image]:
    """Each separate shape in a keyed image, largest first, each on a clear canvas the image's size."""
    width, height = image.size
    solid = bytearray(1 if a else 0 for a in image.getchannel("A").tobytes())
    label = [0] * (width * height)
    sizes = []
    for start in range(width * height):
        if not solid[start] or label[start]:
            continue
        sizes.append(0)
        mark = len(sizes)
        stack = [start]
        label[start] = mark
        while stack:
            index = stack.pop()
            sizes[-1] += 1
            x = index % width
            for neighbour in (index - 1 if x else -1, index + 1 if x < width - 1 else -1, index - width, index + width):
                if 0 <= neighbour < width * height and solid[neighbour] and not label[neighbour]:
                    label[neighbour] = mark
                    stack.append(neighbour)
    found = []
    for mark in sorted(range(1, len(sizes) + 1), key=lambda m: -sizes[m - 1]):
        piece = Image.new("RGBA", image.size, (0, 0, 0, 0))
        mask = Image.frombytes("L", image.size, bytes(255 if m == mark else 0 for m in label))
        piece.paste(image, (0, 0), mask)
        found.append(piece)
    return found


def letter() -> int:
    """
    The solicitor's letter the sign-in opens as (docs/art-requests.md, 10).
    The two envelopes are cut to one box, so the open one lands exactly where
    the closed one was. The seal sheet has the whole seal on the left and the
    broken one on the right; the broken one's halves are saved apart, each on
    the whole seal's canvas, so all three line up and the halves can fall away.
    """
    LETTER.mkdir(parents=True, exist_ok=True)
    closed, opened = keyed_painting(sheet("letter-closed.jpeg")), keyed_painting(sheet("letter-open.jpeg"))
    boxes = [content_box(closed), content_box(opened)]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    for name, image in (("closed", closed), ("open", opened)):
        image = image.crop(box)
        image.thumbnail((720, 720), Image.LANCZOS)
        image.save(LETTER / f"{name}.webp", quality=85, method=6)
    paper = keyed_painting(sheet("letter-paper.jpeg"))
    paper = paper.crop(content_box(paper))
    paper.thumbnail((960, 960), Image.LANCZOS)
    paper.save(LETTER / "paper.webp", quality=85, method=6)

    seals = keyed_painting(sheet("letter-seal.jpeg"))
    middle = seals.width // 2
    whole, broken = seals.crop((0, 0, middle, seals.height)), seals.crop((middle, 0, seals.width, seals.height))
    whole, broken = whole.crop(content_box(whole)), broken.crop(content_box(broken))
    # One canvas for all three, as wide as the broken seal, each centred on it.
    size = (max(whole.width, broken.width), max(whole.height, broken.height))
    def centred(image: Image.Image) -> Image.Image:
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        canvas.thumbnail((240, 240), Image.LANCZOS)
        return canvas
    halves = pieces(broken)[:2]
    left, right = sorted(halves, key=lambda half: content_box(half)[0])
    for name, image in (("seal", whole), ("seal-left", left), ("seal-right", right)):
        centred(image).save(LETTER / f"{name}.webp", quality=88, method=6)
    return 6


def brassbuckle() -> int:
    """Professor Brassbuckle's head and shoulders, for the guide card: keyed, cropped to her, and made square."""
    portrait = keyed(sheet("brassbuckle.jpeg"))
    portrait = portrait.crop(content_box(portrait))
    side = max(portrait.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    # Centred across, standing on the bottom edge, as a bust does.
    canvas.alpha_composite(portrait, ((side - portrait.width) // 2, side - portrait.height))
    save(canvas.resize((128, 128), Image.LANCZOS), "brassbuckle_portrait")
    return 1


if __name__ == "__main__":
    main()
