"""Draws The Long Boil's placeholder pixel art and writes it as PNG files.

The art brief (docs/art-brief.md, section 4) asks for 48x48 pixel art for
characters and monsters, 96x96 for bosses and 32x32 for item icons, in a
limited palette with a clean 1-pixel soot outline. Until real sprites are
drawn or generated to that brief, this script draws them from simple shapes,
so the client has sprites to animate and any of them can be replaced by
dropping in a PNG of the same name.

Run from the repo root:  python3 scripts/art/build_sprites.py
It writes engine/packages/client/assets/sprites/*.png and the index
engine/packages/client/src/sprites.ts. It needs only the standard library.
"""

from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "engine" / "packages" / "client" / "assets" / "sprites"
INDEX = ROOT / "engine" / "packages" / "client" / "src" / "sprites.ts"
ITEMS = ROOT / "content" / "items" / "rustmoor.json"

# The art brief's palette, plus shades derived from it.
BRASS = "#B5893B"
COPPER = "#B8673A"
VERDIGRIS = "#4F8A7A"
SOOT = "#2B2522"
CREAM = "#EFE4CC"
EMBER = "#E07A2E"
SKIN = "#D9A57B"
STEEL = "#8E979A"
IRON = "#5E6466"
WOOD = "#7A5232"
LEATHER = "#6E3F24"
PAPER = "#E6D7B4"


def rgb(hex_colour: str) -> tuple[int, int, int]:
    value = hex_colour.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def shade(hex_colour: str, factor: float) -> str:
    """Lighter above 1, darker below 1."""
    r, g, b = rgb(hex_colour)
    if factor >= 1:
        r, g, b = (int(c + (255 - c) * (factor - 1)) for c in (r, g, b))
    else:
        r, g, b = (int(c * factor) for c in (r, g, b))
    return f"#{max(0, min(255, r)):02X}{max(0, min(255, g)):02X}{max(0, min(255, b)):02X}"


class Canvas:
    def __init__(self, width: int, height: int):
        self.w = width
        self.h = height
        self.px: dict[tuple[int, int], str] = {}

    def set(self, x: float, y: float, colour: str) -> None:
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = colour

    def rect(self, x0: float, y0: float, x1: float, y1: float, colour: str) -> None:
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, colour)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, colour: str) -> None:
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / max(rx, 0.5)) ** 2 + ((y - cy) / max(ry, 0.5)) ** 2 <= 1.0:
                    self.set(x, y, colour)

    def line(self, x0: float, y0: float, x1: float, y1: float, colour: str, thick: int = 1) -> None:
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if thick == 1:
                self.set(x, y, colour)
            else:
                self.ellipse(x, y, (thick - 1) / 2, (thick - 1) / 2, colour)

    def polygon(self, points: list[tuple[float, float]], colour: str) -> None:
        ys = [p[1] for p in points]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            crossings = []
            for (xa, ya), (xb, yb) in zip(points, points[1:] + points[:1]):
                if (ya <= y + 0.5 < yb) or (yb <= y + 0.5 < ya):
                    crossings.append(xa + (y + 0.5 - ya) * (xb - xa) / (yb - ya))
            crossings.sort()
            for a, b in zip(crossings[::2], crossings[1::2]):
                for x in range(int(round(a)), int(round(b)) + 1):
                    self.set(x, y, colour)

    def outline(self, colour: str = SOOT) -> None:
        """The brief's clean 1-pixel dark outline around every filled shape."""
        edge = []
        for (x, y) in list(self.px):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in self.px and 0 <= n[0] < self.w and 0 <= n[1] < self.h:
                    edge.append(n)
        for x, y in edge:
            self.px[(x, y)] = colour

    def flipped(self) -> "Canvas":
        other = Canvas(self.w, self.h)
        other.px = {(self.w - 1 - x, y): c for (x, y), c in self.px.items()}
        return other

    def recoloured(self, mapping: dict[str, str]) -> "Canvas":
        other = Canvas(self.w, self.h)
        other.px = {p: mapping.get(c, c) for p, c in self.px.items()}
        return other

    def png(self, path: Path, scale: int) -> None:
        width, height = self.w * scale, self.h * scale
        rows = bytearray()
        for y in range(height):
            rows.append(0)
            for x in range(width):
                colour = self.px.get((x // scale, y // scale))
                if colour is None:
                    rows += b"\x00\x00\x00\x00"
                else:
                    rows += bytes(rgb(colour)) + b"\xff"

        def chunk(kind: bytes, data: bytes) -> bytes:
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

        header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))


# ---------------------------------------------------------------- the Tinker


def arm(c: Canvas, sx: float, sy: float, angle: float, length: float = 8) -> tuple[float, float]:
    """An arm from the shoulder at `angle` degrees (0 = pointing right, 90 = down). Returns the hand."""
    rad = math.radians(angle)
    hx, hy = sx + math.cos(rad) * length, sy + math.sin(rad) * length
    c.line(sx, sy, hx, hy, CREAM, 3)
    c.ellipse(hx, hy, 1.2, 1.2, SKIN)
    return hx, hy


def tool(c: Canvas, hx: float, hy: float, angle: float, kind: str) -> None:
    rad = math.radians(angle)
    ux, uy = math.cos(rad), math.sin(rad)
    px, py = -uy, ux  # perpendicular
    if kind == "hammer":
        ex, ey = hx + ux * 7, hy + uy * 7
        c.line(hx, hy, ex, ey, WOOD, 2)
        c.line(ex - px * 3, ey - py * 3, ex + px * 3, ey + py * 3, IRON, 3)
    elif kind == "pick":
        ex, ey = hx + ux * 8, hy + uy * 8
        c.line(hx, hy, ex, ey, WOOD, 2)
        c.line(ex - px * 5 - ux, ey - py * 5 - uy, ex + px * 4, ey + py * 4, STEEL, 2)
    elif kind == "spanner":
        ex, ey = hx + ux * 9, hy + uy * 9
        c.line(hx, hy, ex, ey, BRASS, 2)
        c.ellipse(ex, ey, 2.4, 2.4, BRASS)
        c.ellipse(ex + ux, ey + uy, 1, 1, SOOT)


def tinker(pose: str, frame: int) -> Canvas:
    c = Canvas(48, 48)
    bob = 1 if (pose == "idle" and frame == 1) else 0
    # Legs and boots.
    c.rect(19, 34 + bob, 22, 42, LEATHER)
    c.rect(25, 34 + bob, 28, 42, LEATHER)
    c.rect(18, 42, 23, 44, SOOT)
    c.rect(24, 42, 29, 44, SOOT)
    # Back arm, hanging.
    c.line(20, 24 + bob, 18, 32 + bob, shade(CREAM, 0.8), 3)
    # Torso: work shirt and leather apron.
    c.rect(18, 22 + bob, 29, 34 + bob, CREAM)
    c.rect(19, 26 + bob, 28, 37 + bob, COPPER)
    c.rect(19, 26 + bob, 28, 26 + bob, shade(COPPER, 0.7))
    c.set(23, 31 + bob, BRASS)
    c.set(24, 31 + bob, BRASS)
    # Head, hair and goggles pushed up.
    c.ellipse(24, 15 + bob, 6, 6.5, SKIN)
    c.rect(18, 8 + bob, 30, 11 + bob, shade(LEATHER, 0.8))
    c.rect(17, 11 + bob, 31, 12 + bob, BRASS)
    c.ellipse(21, 11 + bob, 1.6, 1.6, VERDIGRIS)
    c.ellipse(27, 11 + bob, 1.6, 1.6, VERDIGRIS)
    c.set(28, 15 + bob, SOOT)
    c.set(29, 18 + bob, shade(SKIN, 0.75))
    # Front arm and tool, by pose. A raised arm swings out in front of the face, not through it.
    shoulder = (27, 24 + bob)
    raised = (29, 23 + bob)
    if pose == "idle":
        arm(c, *shoulder, 95, 8)
    elif pose == "hammer":
        c.rect(34, 37, 44, 39, IRON)
        c.rect(37, 40, 41, 44, shade(IRON, 0.8))
        angle = -50 if frame == 0 else 25
        hand = arm(c, *(raised if frame == 0 else shoulder), angle, 8)
        tool(c, *hand, angle - 10, "hammer")
        if frame == 1:
            c.set(38, 35, EMBER)
            c.set(40, 34, EMBER)
            c.set(36, 34, BRASS)
    elif pose == "pick":
        c.polygon([(33, 44), (37, 36), (42, 34), (46, 44)], shade(STEEL, 0.7))
        c.set(40, 39, COPPER)
        c.set(43, 41, VERDIGRIS)
        angle = -55 if frame == 0 else 35
        hand = arm(c, *(raised if frame == 0 else shoulder), angle, 8)
        tool(c, *hand, angle, "pick")
    elif pose == "tinker":
        c.rect(31, 33, 46, 35, WOOD)
        c.rect(33, 36, 34, 44, shade(WOOD, 0.7))
        c.rect(43, 36, 44, 44, shade(WOOD, 0.7))
        c.ellipse(39, 31, 2.5, 2, BRASS)
        hand = arm(c, *shoulder, 20 if frame == 0 else 35, 8)
        tool(c, *hand, -20, "spanner")
        if frame == 1:
            c.set(41, 28, EMBER)
            c.set(42, 27, CREAM)
    elif pose == "attack":
        angle = -60 if frame == 0 else 15
        hand = arm(c, *(raised if frame == 0 else shoulder), angle, 8)
        tool(c, *hand, angle - 5, "spanner")
        if frame == 1:
            for i in range(5):
                c.set(36 + i, 20 + i * 2, CREAM)
    c.outline()
    return c


# ---------------------------------------------------------------- monsters

RAT_FUR = COPPER


def rat(frame: str) -> Canvas:
    c = Canvas(48, 48)
    lunge = -5 if frame == "attack1" else 0
    breathe = 1 if frame == "idle1" else 0
    if frame == "dead":
        c.ellipse(24, 38, 13, 6, RAT_FUR)
        c.ellipse(12, 37, 6, 5, RAT_FUR)
        for x in (18, 23, 29, 33):
            c.line(x, 32, x - 1, 28, shade(RAT_FUR, 0.6), 2)
        c.line(11, 35, 13, 37, SOOT)
        c.line(13, 35, 11, 37, SOOT)
        c.line(37, 38, 45, 42, shade(RAT_FUR, 0.7), 2)
        c.outline()
        return c
    # Tail.
    c.line(36, 34, 41, 28, shade(RAT_FUR, 0.7), 2)
    c.line(41, 28, 46, 26, shade(RAT_FUR, 0.7), 2)
    # Body with a gear-tooth back (the brief: "rust-colored rats with gear-tooth backs").
    c.ellipse(25 + lunge, 34 + breathe, 13, 8 - breathe, RAT_FUR)
    for i, x in enumerate(range(16, 36, 4)):
        c.rect(x + lunge, 25 + breathe + (i % 2), x + 2 + lunge, 27 + breathe, BRASS)
    c.ellipse(25 + lunge, 37 + breathe, 9, 3, shade(RAT_FUR, 1.25))
    # Legs.
    for x in (16, 21, 29, 34):
        c.rect(x + lunge, 41, x + 1 + lunge, 44, shade(RAT_FUR, 0.6))
    # Head, ear, eye, snout.
    hx = 12 + lunge
    c.ellipse(hx, 31 + breathe, 7, 6, RAT_FUR)
    c.ellipse(hx + 3, 24 + breathe, 3, 3, shade(RAT_FUR, 0.8))
    c.ellipse(hx + 3, 24 + breathe, 1.5, 1.5, shade(RAT_FUR, 1.4))
    c.set(hx - 1, 29 + breathe, EMBER)
    c.set(hx - 6, 32 + breathe, SOOT)
    if frame.startswith("attack"):
        c.rect(hx - 6, 34 + breathe, hx - 2, 35 + breathe, SOOT)
        c.set(hx - 5, 34 + breathe, CREAM)
        c.set(hx - 3, 34 + breathe, CREAM)
    c.outline()
    return c


def scrapjaw(frame: str) -> Canvas:
    c = Canvas(96, 96)
    if frame == "dead":
        for i, (x, y) in enumerate([(20, 80), (34, 84), (50, 78), (64, 84), (78, 80)]):
            c.rect(x, y, x + 10, y + 5, [BRASS, COPPER, IRON, STEEL, shade(COPPER, 0.7)][i])
            c.set(x + 2, y + 2, SOOT)
        c.polygon([(6, 74), (30, 68), (30, 76), (6, 78)], IRON)
        for x in range(9, 29, 4):
            c.polygon([(x, 74), (x + 2, 74), (x + 1, 71)], CREAM)
        c.outline()
        return c
    lunge = -6 if frame == "attack1" else 0
    breathe = 1 if frame == "idle1" else 0
    jaw = 10 if frame.startswith("attack") else (3 if frame == "idle1" else 1)
    # Tail.
    c.polygon([(70, 58), (94, 50), (94, 54), (72, 68)], shade(COPPER, 0.75))
    # Body of riveted scrap plates.
    c.ellipse(52 + lunge, 60 + breathe, 26, 14, IRON)
    plates = [(32, 48, BRASS), (44, 46, COPPER), (56, 47, STEEL), (66, 50, shade(COPPER, 0.7))]
    for x, y, colour in plates:
        c.rect(x + lunge, y + breathe, x + 10 + lunge, y + 7 + breathe, colour)
        c.set(x + 2 + lunge, y + 2 + breathe, SOOT)
        c.set(x + 8 + lunge, y + 2 + breathe, SOOT)
    for x in range(34, 74, 6):
        c.polygon([(x + lunge, 46 + breathe), (x + 3 + lunge, 46 + breathe), (x + 1.5 + lunge, 40 + breathe)], shade(STEEL, 0.8))
    # Legs.
    for x in (34, 46, 60, 70):
        c.rect(x + lunge, 70, x + 5 + lunge, 80, shade(IRON, 0.8))
        c.rect(x - 1 + lunge, 80, x + 7 + lunge, 82, SOOT)
    # Head: upper and lower jaw with teeth.
    hx = 30 + lunge
    c.polygon([(hx, 50 + breathe), (hx - 26, 54 + breathe), (hx - 26, 58 + breathe), (hx, 60 + breathe)], IRON)
    c.polygon([(hx, 62 + breathe), (hx - 24, 60 + jaw + breathe), (hx - 24, 64 + jaw + breathe), (hx, 68 + breathe)], shade(IRON, 0.8))
    for x in range(hx - 22, hx - 2, 4):
        c.polygon([(x, 58 + breathe), (x + 2, 58 + breathe), (x + 1, 61 + breathe)], CREAM)
        c.polygon([(x, 61 + jaw + breathe), (x + 2, 61 + jaw + breathe), (x + 1, 58 + jaw + breathe)], CREAM)
    c.ellipse(hx - 6, 52 + breathe, 2.5, 2, EMBER)
    c.set(hx - 6, 52 + breathe, CREAM)
    c.outline()
    return c


RAT_VARIANTS = {
    "rust_rat_runt": {},
    "rust_rat_scrounger": {RAT_FUR: "#8C4A2F", shade(RAT_FUR, 0.7): "#6A3622", shade(RAT_FUR, 1.25): "#B07258"},
    "rust_rat_tinplate": {RAT_FUR: "#9AA3A6", shade(RAT_FUR, 0.7): "#6E777A", shade(RAT_FUR, 1.25): "#C3C9CB", shade(RAT_FUR, 0.6): "#5E6466"},
    "rust_rat_gaffer": {RAT_FUR: "#6B3A2A", shade(RAT_FUR, 0.7): "#4A281D", shade(RAT_FUR, 1.25): "#8F5A46", BRASS: STEEL},
}


# ---------------------------------------------------------------- item icons


def ingot(c: Canvas, colour: str) -> None:
    c.polygon([(6, 22), (10, 12), (24, 12), (27, 22)], colour)
    c.polygon([(10, 12), (24, 12), (22, 15), (12, 15)], shade(colour, 1.3))
    c.rect(8, 21, 26, 23, shade(colour, 0.7))


def ore(c: Canvas, flecks: list[str]) -> None:
    c.polygon([(5, 22), (9, 10), (18, 7), (27, 13), (27, 24), (15, 27)], shade(STEEL, 0.75))
    c.polygon([(9, 10), (18, 7), (20, 12), (11, 14)], shade(STEEL, 0.95))
    for i, (x, y) in enumerate([(12, 17), (19, 15), (16, 22), (23, 19), (10, 21)]):
        c.rect(x, y, x + 1, y + 1, flecks[i % len(flecks)])


def blade(c: Canvas, colour: str = STEEL) -> None:
    c.polygon([(7, 26), (22, 7), (26, 6), (25, 10), (10, 28)], colour)
    c.line(9, 26, 23, 9, shade(colour, 1.35))
    c.rect(5, 24, 10, 25, BRASS)
    c.line(4, 29, 8, 25, WOOD, 2)


def rifle(c: Canvas, colour: str = IRON) -> None:
    c.rect(4, 15, 28, 17, colour)
    c.polygon([(4, 16), (12, 16), (14, 22), (8, 25), (3, 21)], WOOD)
    c.rect(12, 18, 13, 21, SOOT)


def rod(c: Canvas, colour: str = COPPER, gem: str = VERDIGRIS) -> None:
    c.line(8, 27, 22, 9, colour, 2)
    c.ellipse(23, 8, 3, 3, gem)
    c.set(26, 4, EMBER)
    c.set(28, 7, CREAM)
    c.set(20, 4, CREAM)


def paper(c: Canvas) -> None:
    c.polygon([(7, 4), (24, 4), (27, 8), (27, 28), (7, 28)], PAPER)
    for y in range(10, 26, 4):
        c.rect(10, y, 24, y, shade(PAPER, 0.75))


def icon(item: str) -> Canvas:
    c = Canvas(32, 32)
    name = item.split(".")[-1]
    if name == "copper":
        ore(c, [COPPER, VERDIGRIS])
    elif name == "iron_ore":
        ore(c, [shade(COPPER, 0.6), "#8C4A2F"])
    elif name == "coal":
        c.ellipse(12, 19, 7, 6, SOOT)
        c.ellipse(20, 15, 7, 6, shade(SOOT, 1.2))
        c.set(18, 12, STEEL)
        c.set(10, 17, STEEL)
    elif name == "garnet":
        c.polygon([(16, 5), (26, 13), (16, 28), (6, 13)], "#9E2B35")
        c.polygon([(16, 5), (21, 13), (11, 13)], "#D0545F")
    elif name == "brass_ingot":
        ingot(c, BRASS)
    elif name == "iron_ingot":
        ingot(c, IRON)
    elif name == "steel_ingot":
        ingot(c, STEEL)
    elif name == "brass_spanner":
        # An open-ended spanner: a handle and a C-shaped jaw.
        c.line(7, 25, 20, 12, BRASS, 3)
        c.ellipse(22, 10, 5, 5, BRASS)
        for x in range(21, 28):
            for y in range(4, 10):
                if (x - 22) + (10 - y) > 2:
                    c.px.pop((x, y), None)
    elif name in ("steel_blade",):
        blade(c)
    elif name == "scrapjaws_cleaver":
        c.polygon([(6, 8), (24, 8), (24, 20), (8, 20)], STEEL)
        c.rect(6, 8, 24, 9, shade(STEEL, 1.35))
        c.line(24, 14, 29, 26, WOOD, 3)
        for x in range(8, 24, 4):
            c.set(x, 20, CREAM)
    elif name == "iron_crowbar":
        c.line(6, 27, 24, 6, IRON, 2)
        c.line(24, 6, 28, 9, IRON, 2)
    elif name == "riveting_hammer":
        c.line(9, 27, 19, 11, WOOD, 2)
        c.line(14, 9, 24, 14, IRON, 3)
    elif name in ("iron_rifle", "steel_carbine"):
        rifle(c, IRON if name == "iron_rifle" else STEEL)
    elif name == "garnet_rifle":
        rifle(c, shade(COPPER, 0.8))
        c.set(22, 14, "#D0545F")
    elif name == "brass_catapult":
        c.line(16, 28, 16, 16, WOOD, 2)
        c.line(16, 16, 9, 7, WOOD, 2)
        c.line(16, 16, 23, 7, WOOD, 2)
        c.line(9, 7, 23, 7, BRASS)
    elif name in ("spark_rod", "copper_coil", "brass_sparker", "garnet_rod"):
        rod(c, {"spark_rod": IRON, "copper_coil": COPPER, "brass_sparker": BRASS, "garnet_rod": shade(COPPER, 0.8)}[name],
            "#D0545F" if name == "garnet_rod" else VERDIGRIS)
    elif name == "brass_key":
        c.ellipse(10, 12, 5, 5, BRASS)
        c.ellipse(10, 12, 2, 2, SOOT)
        c.line(14, 15, 26, 25, BRASS, 2)
        c.rect(21, 22, 23, 26, BRASS)
    elif name == "iron_lock":
        c.rect(8, 14, 24, 27, IRON)
        c.line(11, 14, 11, 8, STEEL, 2)
        c.line(21, 14, 21, 8, STEEL, 2)
        c.line(11, 7, 21, 7, STEEL, 2)
        c.rect(15, 18, 17, 22, SOOT)
    elif name == "garnet_sight":
        c.rect(6, 13, 26, 18, BRASS)
        c.ellipse(26, 15, 3, 3, "#D0545F")
    elif name == "rat_scrap":
        c.polygon([(6, 22), (12, 12), (17, 17), (24, 9), (27, 24), (14, 27)], shade(COPPER, 0.75))
        c.rect(10, 18, 13, 20, STEEL)
        c.rect(19, 15, 21, 18, BRASS)
    elif name == "rustmoor_ration":
        c.rect(7, 10, 25, 26, shade(STEEL, 0.9))
        c.rect(7, 10, 25, 12, STEEL)
        c.rect(9, 15, 23, 22, CREAM)
        c.rect(12, 17, 20, 19, COPPER)
    elif name == "barley_meal":
        c.ellipse(16, 19, 9, 9, PAPER)
        c.rect(12, 7, 20, 11, shade(PAPER, 0.85))
        c.line(11, 11, 21, 11, WOOD)
    elif name == "salt_pork":
        c.ellipse(16, 17, 11, 8, "#C9786E")
        c.ellipse(16, 16, 8, 5, "#E3A097")
        c.line(9, 17, 23, 17, CREAM)
    elif name == "bent_nails":
        for x, y in ((8, 9), (15, 8), (21, 11)):
            c.line(x, y, x + 2, y + 10, STEEL)
            c.line(x + 2, y + 10, x + 6, y + 13, STEEL)
            c.rect(x - 1, y - 1, x + 1, y, IRON)
    elif name == "umbrella_ribs":
        for i in range(5):
            c.line(16, 26, 4 + i * 6, 6 + abs(2 - i) * 3, STEEL)
        c.rect(15, 24, 17, 28, WOOD)
    elif name == "odd_spoons":
        for x, colour in ((10, "#C8CDCF"), (20, STEEL)):
            c.ellipse(x, 9, 3, 4, colour)
            c.line(x, 13, x + 1, 27, colour, 2)
    elif name == "clock_movement":
        c.ellipse(16, 16, 10, 10, BRASS)
        for i in range(8):
            a = i * math.pi / 4
            c.rect(16 + math.cos(a) * 11 - 1, 16 + math.sin(a) * 11 - 1, 16 + math.cos(a) * 11, 16 + math.sin(a) * 11, BRASS)
        c.ellipse(16, 16, 5, 5, shade(BRASS, 0.7))
        c.ellipse(16, 16, 1.5, 1.5, SOOT)
    elif name == "foundry_pass":
        c.rect(5, 9, 27, 24, PAPER)
        c.rect(5, 9, 27, 11, shade(PAPER, 0.8))
        c.ellipse(21, 19, 3.5, 3.5, EMBER)
        c.rect(8, 14, 16, 14, shade(PAPER, 0.6))
        c.rect(8, 17, 14, 17, shade(PAPER, 0.6))
    elif name.startswith("ledger_page"):
        paper(c)
        c.rect(16, 6, 16, 27, shade(PAPER, 0.6))
    else:
        # Anything not drawn yet: a riveted crate.
        c.rect(6, 8, 26, 26, WOOD)
        c.rect(6, 8, 26, 10, shade(WOOD, 1.3))
        c.line(6, 8, 26, 26, shade(WOOD, 0.7))
        for x, y in ((8, 12), (24, 12), (8, 24), (24, 24)):
            c.set(x, y, BRASS)
    c.outline()
    return c


# ---------------------------------------------------------------- backgrounds


def workshop_background() -> Canvas:
    c = Canvas(160, 64)
    c.rect(0, 0, 159, 63, shade(LEATHER, 0.55))
    for y in range(2, 46, 6):
        offset = 0 if (y // 6) % 2 else 6
        for x in range(-offset, 160, 12):
            c.rect(x, y, x + 10, y + 4, shade(LEATHER, 0.65))
    c.rect(0, 46, 159, 63, shade(WOOD, 0.55))
    for x in range(0, 160, 16):
        c.rect(x, 46, x, 63, shade(WOOD, 0.45))
    # The Boiler, with its gauge.
    c.rect(124, 14, 150, 50, shade(COPPER, 0.8))
    c.ellipse(137, 14, 13, 4, shade(COPPER, 0.95))
    for y in range(18, 50, 8):
        c.set(126, y, BRASS)
        c.set(148, y, BRASS)
    c.ellipse(137, 28, 5, 5, CREAM)
    c.line(137, 28, 140, 25, SOOT)
    c.rect(134, 4, 138, 10, IRON)
    # A shelf of jars and a window of fog.
    c.rect(8, 16, 46, 17, WOOD)
    for x, colour in ((10, VERDIGRIS), (18, BRASS), (26, COPPER), (34, VERDIGRIS)):
        c.rect(x, 10, x + 4, 15, colour)
    c.rect(64, 8, 92, 30, shade(CREAM, 0.85))
    c.rect(77, 8, 78, 30, shade(WOOD, 0.6))
    c.rect(64, 18, 92, 19, shade(WOOD, 0.6))
    return c


def rustmoor_background() -> Canvas:
    c = Canvas(160, 64)
    c.rect(0, 0, 159, 63, "#A9A9A2")
    c.rect(0, 0, 159, 18, "#C3C2B8")
    for i, (x, h, colour) in enumerate([(0, 22, IRON), (22, 30, shade(COPPER, 0.6)), (52, 18, STEEL), (78, 34, shade(IRON, 0.8)),
                                        (110, 26, shade(COPPER, 0.5)), (134, 32, IRON)]):
        c.polygon([(x, 50), (x + 14, 50 - h), (x + 30, 50)], colour)
    c.line(30, 0, 44, 30, shade(IRON, 0.7), 2)
    c.line(120, 0, 112, 26, shade(IRON, 0.7), 2)
    c.rect(0, 50, 159, 63, shade(COPPER, 0.45))
    for x in range(4, 160, 11):
        c.set(x, 55 + (x % 5), BRASS)
        c.set(x + 5, 58, STEEL)
    return c


# ---------------------------------------------------------------- export


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index: dict = {"characters": {}, "icons": {}, "backgrounds": {}}

    def save(name: str, canvas: Canvas, scale: int) -> str:
        canvas.png(OUT / f"{name}.png", scale)
        return name

    tinker_anims = {pose: [save(f"tinker_{pose}_{f}", tinker(pose, f), 3) for f in (0, 1)] for pose in ("idle", "hammer", "pick", "tinker", "attack")}
    index["characters"]["tinker"] = tinker_anims

    for variant, mapping in RAT_VARIANTS.items():
        anims = {}
        for anim, frames in {"idle": ["idle0", "idle1"], "attack": ["attack0", "attack1"], "dead": ["dead"]}.items():
            anims[anim] = [save(f"{variant}_{frame}", rat(frame).recoloured(mapping), 3) for frame in frames]
        index["characters"][f"monster.rustmoor.{variant}"] = anims

    index["characters"]["monster.rustmoor.scrapjaw"] = {
        anim: [save(f"scrapjaw_{frame}", scrapjaw(frame), 2) for frame in frames]
        for anim, frames in {"idle": ["idle0", "idle1"], "attack": ["attack0", "attack1"], "dead": ["dead"]}.items()
    }

    items = [item["id"] for item in json.loads(ITEMS.read_text())["items"]]
    for item in items + ["fallback"]:
        index["icons"][item] = save(f"icon_{item.split('.')[-1]}", icon(item), 2)

    index["backgrounds"]["workshop"] = save("bg_workshop", workshop_background(), 3)
    index["backgrounds"]["rustmoor"] = save("bg_rustmoor", rustmoor_background(), 3)

    def req(name: str) -> str:
        return f'require("../assets/sprites/{name}.png")'

    lines = [
        "// Generated by scripts/art/build_sprites.py; do not edit by hand.",
        "// Placeholder pixel art drawn to docs/art-brief.md. Replace any PNG under",
        "// assets/sprites/ with real art of the same name and size to swap it in.",
        "",
        "/* eslint-disable @typescript-eslint/no-require-imports */",
        "export type Frames = number[];",
        "",
        "export const characters: Record<string, Record<string, Frames>> = {",
    ]
    for who, anims in index["characters"].items():
        lines.append(f'  "{who}": {{')
        for anim, frames in anims.items():
            lines.append(f"    {anim}: [{', '.join(req(f) for f in frames)}],")
        lines.append("  },")
    lines += ["};", "", "export const icons: Record<string, number> = {"]
    for item, name in index["icons"].items():
        lines.append(f'  "{item}": {req(name)},')
    lines += ["};", "", "export const backgrounds: Record<string, number> = {"]
    for name, file in index["backgrounds"].items():
        lines.append(f'  {name}: {req(file)},')
    lines += ["};", ""]
    INDEX.write_text("\n".join(lines))
    count = len(list(OUT.glob("*.png")))
    print(f"wrote {count} PNGs to {OUT.relative_to(ROOT)} and {INDEX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
