"""Dyes the Tinker's leathers, so an outfit needs no new art (work order 042).

An outfit in content/looks/looks.json is a dye: a hue, and what the drawn
saturation and brightness are multiplied by. Every body there is drawn in the
same brown apron and gloves, and this script repaints those on each of the
body's frames and leaves the rest alone.

Hair, skin, boots, benches and rifle stocks are brown too, so colour alone
does not find the leathers. A frame's leather is the brown that
  - lies below the chin, which is found from the goggles on the forehead, and
  - belongs to a patch whose middle is within reach of the body, so a bench,
    an ore heap or a scrap pile beside the Tinker is left as it was.
A weapon held across the apron can still take the dye where it touches it;
EXCLUDE lists the boxes to leave alone on the frames where that showed.

Run from the repo root, after scripts/art/import_art.py (it needs Pillow):
    python3 scripts/art/dye_outfits.py
Reads  content/looks/looks.json and engine/packages/client/assets/art/<sprite>_*.png
Writes engine/packages/client/assets/art/looks/<sprite>-<outfit>_*.png
Then run scripts/art/build_sprites.py to rebuild the client's sprite index.
"""

from __future__ import annotations

import colorsys
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LOOKS = ROOT / "content" / "looks" / "looks.json"
ART = ROOT / "engine" / "packages" / "client" / "assets" / "art"
OUT = ART / "looks"

# How far either side of the head's middle a patch of leather may be centred, in head sizes
# (crown to the goggles' lower edge): as far as a punching fist, short of an ore heap or a scrap pile.
REACH = 2.6
# The most one lens of the goggles spans, as a share of the frame.
LENS = 0.14
# The furthest the goggles' lower edge sits below the crown of the head, as a share of the frame's height.
BROW = 0.2
# The chin, in head sizes below the goggles' lower edge.
CHIN = 1.15

# A dyed frame is saved with this many colours, which is a third the size and looks the same.
COLOURS = 128

# Frames where something beside the Tinker took the dye: the frame's file name without ".png" -> boxes
# (left, top, right, bottom) to leave alone, in the frame's own pixels.
EXCLUDE: dict[str, list[tuple[int, int, int, int]]] = {
    # The bench, which a glove rests on.
    "tinker_tinker_0": [(72, 100, 144, 144)],
    "tinker_tinker_1": [(72, 100, 144, 144)],
    "tinkerf_tinker_0": [(73, 98, 144, 144)],
    "tinkerf_tinker_1": [(73, 98, 144, 144)],
}


def hsv(r: int, g: int, b: int) -> tuple[float, float, float]:
    return colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)


def is_lens(r: int, g: int, b: int) -> bool:
    """The goggles' teal glass."""
    h, s, v = hsv(r, g, b)
    return 0.3 < h < 0.55 and s > 0.2 and v > 0.45


def is_leather(r: int, g: int, b: int) -> bool:
    """The apron's and gloves' brown: more saturated than hair, darker than skin or the shirt."""
    h, s, v = hsv(r, g, b)
    return 0.03 < h < 0.11 and s > 0.42 and 0.2 < v < 0.72


def is_hair(r: int, g: int, b: int) -> bool:
    h, s, v = hsv(r, g, b)
    return 0.04 < h < 0.13 and s > 0.25 and 0.1 < v < 0.45


def head(image: Image.Image) -> tuple[float, int, int] | None:
    """The middle of the head, its size (crown to the goggles' lower edge) and the chin's row, from the goggles. Weapons can be teal too (a raised
    spanner, a carbine, a coil's arc), so a lens is a patch of teal no bigger than LENS each way, and the goggles
    are the largest lens on a forehead, with any other lens level with it and close by."""
    pixels = image.load()
    width, height = image.size
    box = image.getchannel("A").getbbox()
    if not box:
        return None
    teal = {
        (x, y)
        for y in range(box[1], box[3])
        for x in range(box[0], box[2])
        if pixels[x, y][3] >= 200 and is_lens(*pixels[x, y][:3])
    }
    def crown_over(left: int, right: int, top: int) -> int:
        span = range(max(0, left - 4), min(width, right + 5))
        return next(y for y in range(box[1], top + 1) if any(pixels[x, y][3] >= 200 for x in span))

    lenses = []
    for patch in patches(teal):
        xs, ys = [x for x, _ in patch], [y for _, y in patch]
        left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
        if len(patch) < 6 or right - left > width * LENS or bottom - top > height * LENS:
            continue
        # Goggles sit on the forehead: hair above them, and not a body's length of it.
        crown = crown_over(left, right, top)
        hair = sum(is_hair(*pixels[x, y][:3]) for y in range(crown, top) for x in range(left, right + 1) if pixels[x, y][3] >= 200)
        if top - crown >= 3 and bottom - crown <= height * BROW and hair >= (right - left + 1) * 2:
            lenses.append((len(patch), left, right, top, bottom))
    if not lenses:
        return None
    _, left, right, top, bottom = max(lenses)
    wide = right - left
    for _, l, r, t, b in lenses:
        if t <= bottom and b >= top and l <= right + wide * 3 and r >= left - wide * 3:
            left, right, top, bottom = min(left, l), max(right, r), min(top, t), max(bottom, b)
    size = bottom - crown_over(left, right, top)
    return (left + right) / 2, size, bottom + round(size * CHIN)


def patches(mask: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """The mask's connected patches, corners touching."""
    seen: set[tuple[int, int]] = set()
    out = []
    for start in mask:
        if start in seen:
            continue
        stack, patch = [start], []
        seen.add(start)
        while stack:
            x, y = stack.pop()
            patch.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    near = (x + dx, y + dy)
                    if near in mask and near not in seen:
                        seen.add(near)
                        stack.append(near)
        out.append(patch)
    return out


def dyed(image: Image.Image, dye: dict, exclude: list[tuple[int, int, int, int]] = []) -> Image.Image:
    """The frame with its leathers in the dye's colour, keeping each pixel's shading."""
    image = image.copy()
    found = head(image)
    if not found:
        return image
    middle, size, chin = found
    reach = size * REACH
    pixels = image.load()
    width, height = image.size
    mask = {
        (x, y)
        for y in range(chin + 1, height)
        for x in range(width)
        if pixels[x, y][3] >= 200
        and is_leather(*pixels[x, y][:3])
        and not any(l <= x < r and t <= y < b for l, t, r, b in exclude)
    }
    for patch in patches(mask):
        if abs(sum(x for x, _ in patch) / len(patch) - middle) > reach:
            continue
        for x, y in patch:
            r, g, b, a = pixels[x, y]
            _, s, v = hsv(r, g, b)
            nr, ng, nb = colorsys.hsv_to_rgb(dye["hue"] / 360, min(1, s * dye["saturation"]), min(1, v * dye["value"]))
            pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return image


def frames_of(sprite: str) -> list[Path]:
    """A body's frames: <sprite>_<anything>.png, and not another body's whose prefix only starts the same."""
    return sorted(path for path in ART.glob(f"{sprite}_*.png"))


def main() -> None:
    looks = json.loads(LOOKS.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    wanted: set[str] = set()
    written = 0
    for body in looks["bodies"]:
        frames = frames_of(body["sprite"])
        if not frames:
            print(f"{body['id']}: no frames named {body['sprite']}_*.png yet; skipped")
            continue
        for outfit in looks["outfits"]:
            short = outfit["id"].split(".")[-1]
            for path in frames:
                rest = path.stem[len(body["sprite"]) + 1 :]
                name = f"{body['sprite']}-{short}_{rest}.png"
                dyed(Image.open(path).convert("RGBA"), outfit["dye"], EXCLUDE.get(path.stem, [])).quantize(COLOURS, method=Image.Quantize.FASTOCTREE).save(OUT / name, optimize=True)
                wanted.add(name)
                written += 1
    # An outfit or body taken out of looks.json takes its frames with it.
    for stale in sorted(path for path in OUT.glob("*.png") if path.name not in wanted):
        stale.unlink()
    print(f"wrote {written} dyed frames to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
