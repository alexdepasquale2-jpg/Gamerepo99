#!/usr/bin/env python3
"""Assemble 2.5d-world-target-v4.png — fixes v3 compositing defects.

Root causes fixed:
- hero/npc vendor sheets are 3×4 grids of 16×16 frames; v3 pasted whole sheets → stacks
- RGB paste / black fill → black boxes; we only alpha_composite RGBA
- calm low-noise grass base + soft noise-mask blobs + sparse poisson tufts (no checkerboard)
- despair desaturates RGB only (alpha preserved)
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "assets/vendor"
SPRITES = ROOT / "assets/sprites"
OUT = ROOT / "docs/art/mockups/2.5d-world-target-v4.png"

W, H = 960, 540
HALF = W // 2
HDR = 28
GT = 48  # native ansimuz grass size — fewer seams than 32


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def desaturate_rgb(im: Image.Image, amount: float = 0.88) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3:4]
    grey = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2])[:, :, None]
    out = rgb + (grey - rgb) * amount
    out[:, :, 2] = np.clip(out[:, :, 2] + 6, 0, 255)
    out[:, :, 0] = np.clip(out[:, :, 0] - 3, 0, 255)
    # Preserve fully transparent pixels' RGB; keep alpha exact
    result = np.concatenate([out, a], axis=2).astype(np.uint8)
    # where alpha==0, zero rgb to avoid fringing if ever premultiplied wrong
    result[a[:, :, 0] == 0, :3] = 0
    return Image.fromarray(result, "RGBA")


def paste_alpha(base: Image.Image, stamp: Image.Image, xy: tuple[int, int]) -> None:
    x, y = xy
    if stamp.mode != "RGBA":
        stamp = stamp.convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.alpha_composite(stamp, dest=(x, y))
    base.alpha_composite(layer)


def paste_foot(base: Image.Image, stamp: Image.Image, foot_xy: tuple[int, int]) -> None:
    fx, fy = foot_xy
    paste_alpha(base, stamp, (fx - stamp.width // 2, fy - stamp.height))


def single_char(sheet: Image.Image, col: int, row: int, scale: int = 2) -> Image.Image:
    """Crop one 16×16 frame from ansimuz hero/npc 3×4 sheet; scale for mockup."""
    fr = sheet.crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16)).convert("RGBA")
    # Zero RGB under transparent to kill black-box risk on bad paste paths
    arr = np.array(fr)
    arr[arr[:, :, 3] == 0, :3] = 0
    fr = Image.fromarray(arr, "RGBA")
    if scale != 1:
        fr = fr.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
    return fr


def extract_components(tiles_path: Path) -> dict[str, Image.Image]:
    tiles = np.array(load_rgba(tiles_path))
    labeled, n = ndimage.label(tiles[:, :, 3] > 0)
    by_area = []
    for i in range(1, n + 1):
        ys, xs = np.where(labeled == i)
        area = len(xs)
        if area < 200:
            continue
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        crop = Image.fromarray(tiles[bbox[1] : bbox[3], bbox[0] : bbox[2]], "RGBA")
        by_area.append((area, bbox, crop))
    by_area.sort(key=lambda t: -t[0])
    # Heuristic assign by size/position
    out: dict[str, Image.Image] = {}
    for area, bbox, crop in by_area:
        x0, y0, x1, y1 = bbox
        w, h = x1 - x0, y1 - y0
        if "inn" not in out and w > 150 and h > 100 and x0 > 100:
            out["inn"] = crop
        elif "trees" not in out and h > 80 and w < 80 and x0 < 140:
            out["trees"] = crop
        elif "cliff" not in out and w > 80 and h < 100 and y0 > 100:
            out["cliff"] = crop
        elif "house" not in out and 80 < w < 160 and h > 70 and x0 > 180:
            out["house"] = crop
        elif "dirt" not in out and 40 < w < 70 and 30 < h < 50:
            out["dirt"] = crop
    return out


def _seed_rng(seed: bytes) -> np.random.Generator:
    h = hashlib.md5(seed).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def calm_grass_mean() -> tuple[int, int, int]:
    """Average ansimuz grass into one calm base RGB (low visual noise)."""
    samples = []
    for name in ("ansimuz-grass-tile.png", "ansimuz-grass-tile-2.png", "ansimuz-grass-tile-3.png"):
        arr = np.array(load_rgba(VENDOR / name), dtype=np.float32)
        samples.append(arr[:, :, :3].mean(axis=(0, 1)))
    mean = np.mean(samples, axis=0)
    return int(mean[0]), int(mean[1]), int(mean[2])


def _lowfreq_noise(h: int, w: int, rng: np.random.Generator, scale: int = 48) -> np.ndarray:
    """Soft irregular field in [0,1] — no square tile structure."""
    sh, sw = max(2, h // scale + 2), max(2, w // scale + 2)
    small = rng.random((sh, sw))
    # Upsample with bilinear via PIL
    im = Image.fromarray((small * 255).astype(np.uint8), "L")
    big = im.resize((w, h), Image.Resampling.BILINEAR)
    return np.array(big, dtype=np.float32) / 255.0


def paint_calm_grass(canvas: Image.Image, region, seed: bytes, alive: bool) -> None:
    """Fill region with calm base + soft blob tint + sparse organic tufts (no checkerboard)."""
    x0, y0, x1, y1 = region
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return
    rng = _seed_rng(seed)
    br, bg, bb = calm_grass_mean()
    # Slightly greener/calmer for reignited; cooler for despair base (desat later)
    if alive:
        br, bg, bb = br - 4, min(255, bg + 6), bb - 2
    else:
        br, bg, bb = br - 2, bg - 2, bb + 2

    base = np.zeros((h, w, 4), dtype=np.float32)
    base[:, :, 0] = br
    base[:, :, 1] = bg
    base[:, :, 2] = bb
    base[:, :, 3] = 255
    # Micro noise ±2 (not tileable pattern)
    micro = rng.integers(-2, 3, size=(h, w, 3))
    base[:, :, :3] = np.clip(base[:, :, :3] + micro, 0, 255)

    # Soft irregular variant blobs via low-freq noise mask (not square patches)
    n1 = _lowfreq_noise(h, w, rng, scale=56)
    n2 = _lowfreq_noise(h, w, rng, scale=36)
    blob = np.clip((n1 - 0.45) * 2.2, 0, 1) * 0.55 + np.clip((n2 - 0.55) * 1.8, 0, 1) * 0.35
    # Warm patch tint vs cool moss tint
    warm = np.array([18, 10, -6], dtype=np.float32)
    cool = np.array([-8, 6, 4], dtype=np.float32)
    tint = warm[None, None, :] * blob[:, :, None] + cool[None, None, :] * (1.0 - blob)[:, :, None] * 0.35
    # Only apply where blob strength is meaningful — soft edges already from bilinear noise
    strength = np.clip(blob * 0.85 + 0.15, 0, 1)[:, :, None]
    base[:, :, :3] = np.clip(base[:, :, :3] + tint * strength * 0.55, 0, 255)

    layer = Image.fromarray(base.astype(np.uint8), "RGBA")
    paste_alpha(canvas, layer, (x0, y0))

    # Sparse organic detail — poisson-ish (min distance), not grid
    min_dist = 22 if alive else 28
    count = max(4, (w * h) // (min_dist * min_dist * 3))
    pts: list[tuple[int, int]] = []
    attempts = 0
    while len(pts) < count and attempts < count * 40:
        attempts += 1
        px = int(rng.integers(2, max(3, w - 2)))
        py = int(rng.integers(2, max(3, h - 2)))
        ok = True
        for qx, qy in pts:
            if (px - qx) ** 2 + (py - qy) ** 2 < min_dist * min_dist:
                ok = False
                break
        if ok:
            pts.append((px, py))

    d = ImageDraw.Draw(canvas)
    for px, py in pts:
        ax, ay = x0 + px, y0 + py
        kind = int(rng.integers(0, 5))
        if kind == 0:
            # short tuft
            col = (max(0, br - 20), min(255, bg + 12), max(0, bb - 10), 200)
            d.line([(ax, ay), (ax, ay - 3)], fill=col, width=1)
            d.point([(ax - 1, ay - 2), (ax + 1, ay - 2)], fill=col)
        elif kind == 1 and alive:
            # tiny flower
            petal = (240, 220, 90, 220) if rng.random() > 0.4 else (230, 140, 160, 220)
            d.point([(ax, ay), (ax - 1, ay), (ax + 1, ay), (ax, ay - 1)], fill=petal)
            d.point([(ax, ay)], fill=(80, 140, 50, 255))
        elif kind == 2:
            # darker speck
            d.point([(ax, ay)], fill=(max(0, br - 30), max(0, bg - 20), max(0, bb - 15), 180))
        else:
            # pale blade
            col = (min(255, br + 25), min(255, bg + 20), min(255, bb + 8), 160)
            d.point([(ax, ay), (ax, ay - 1)], fill=col)


def dirt_band(canvas: Image.Image, y0: int, y1: int, seed: bytes, dirt_stamp: Image.Image | None) -> None:
    ground = load_rgba(SPRITES / "sheet-ground.png")
    dirt_tiles = [ground.crop((c * 32, 64, c * 32 + 32, 96)) for c in range(6)]
    for y in range(y0, y1, 32):
        for x in range(0, HALF, 32):
            h = hashlib.md5(seed + b"d" + bytes([x & 255, y & 255])).digest()
            paste_alpha(canvas, dirt_tiles[h[0] % 6], (x, y))
    if dirt_stamp is not None:
        # sprinkle a couple dirt patches
        paste_alpha(canvas, dirt_stamp, (40, y0 - 10))
        paste_alpha(canvas, dirt_stamp, (280, y0 + 5))


def build_half(alive: bool, comps: dict[str, Image.Image], chars: list[Image.Image]) -> Image.Image:
    half = Image.new("RGBA", (HALF, H), (0, 0, 0, 0))
    seed = b"alive-v4b" if alive else b"despair-v4b"

    sky = (118, 168, 208, 255) if alive else (88, 98, 108, 255)
    ImageDraw.Draw(half).rectangle([0, HDR, HALF, 100], fill=sky)

    paint_calm_grass(half, (0, 70, HALF, 250), seed + b"u", alive)
    dirt_band(half, 248, 248 + 56, seed, comps.get("dirt"))
    paint_calm_grass(half, (0, 300, HALF, H), seed + b"l", alive)

    # Cliff strip
    if "cliff" in comps:
        cimg = comps["cliff"]
        for x in range(-10, HALF, max(8, cimg.width - 12)):
            paste_alpha(half, cimg, (x, 210))

    # Buildings — exact component stamps (already alpha-masked)
    if "inn" in comps:
        paste_foot(half, comps["inn"], (200, 250))
    if "house" in comps:
        paste_foot(half, comps["house"], (380, 248))
    if "trees" in comps:
        tr = comps["trees"]
        paste_foot(half, tr, (50, 245))
        paste_foot(half, tr.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (430, 255))
        paste_foot(half, tr.resize((tr.width * 3 // 4, tr.height * 3 // 4), Image.Resampling.NEAREST), (300, 238))

    # Characters — ONE 16×16 (scaled) frame per spot, wide spacing
    if alive:
        spots = [
            (70, 370, 0),
            (150, 400, 1),
            (240, 385, 2),
            (330, 420, 3),
            (410, 390, 4),
            (200, 460, 5),
            (100, 480, 1),
            (300, 490, 0),
        ]
    else:
        spots = [
            (90, 390, 0),
            (220, 430, 2),
            (360, 410, 4),
            (150, 490, 1),
        ]
    for fx, fy, ci in spots:
        stamp = chars[ci % len(chars)]
        # soft contact shadow
        sh = Image.new("RGBA", (stamp.width + 6, 6), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([0, 0, sh.width - 1, sh.height - 1], fill=(0, 0, 0, 55 if alive else 35))
        paste_alpha(half, sh, (fx - sh.width // 2, fy - 3))
        paste_foot(half, stamp, (fx, fy))

    if alive:
        cart = procedural_cart()
        paste_foot(half, cart, (420, 470))

    if not alive:
        half = desaturate_rgb(half, 0.9)
    return half


def procedural_cart() -> Image.Image:
    im = Image.new("RGBA", (40, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([6, 8, 34, 20], fill=(120, 78, 42, 255))
    d.rectangle([8, 4, 32, 10], fill=(150, 100, 55, 255))
    d.ellipse([4, 16, 14, 26], fill=(40, 40, 40, 255))
    d.ellipse([26, 16, 36, 26], fill=(40, 40, 40, 255))
    return im


def main() -> None:
    comps = extract_components(VENDOR / "ansimuz-transparent-bg-tiles.png")
    print("components:", {k: v.size for k, v in comps.items()})

    hero = load_rgba(VENDOR / "ansimuz-hero.png")
    npc = load_rgba(VENDOR / "ansimuz-npc.png")
    # Distinct single frames only (col,row) — not whole sheets
    chars = [
        single_char(hero, 1, 2, scale=2),  # front
        single_char(hero, 0, 0, scale=2),  # side
        single_char(hero, 1, 1, scale=2),  # back-ish
        single_char(npc, 1, 2, scale=2),
        single_char(npc, 0, 0, scale=2),
        single_char(npc, 2, 2, scale=2),
    ]

    canvas = Image.new("RGBA", (W, H), (12, 12, 14, 255))
    paste_alpha(canvas, build_half(False, comps, chars), (0, 0))
    paste_alpha(canvas, build_half(True, comps, chars), (HALF, 0))

    d = ImageDraw.Draw(canvas)
    d.line([(HALF, HDR), (HALF, H)], fill=(20, 20, 24, 255), width=2)
    d.rectangle([0, 0, W, HDR], fill=(8, 8, 10, 255))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
        small = font
    d.text((10, 6), "Hearthfall — 2.5D world target v4", fill=(242, 233, 228, 255), font=font)
    d.text(
        (310, 8),
        "ansimuz CC0 • single frames • alpha_composite • 1 char/spot • calm grass + soft blobs",
        fill=(160, 150, 140, 255),
        font=small,
    )
    d.text((HALF // 2 - 40, HDR + 6), "DESPAIR", fill=(180, 180, 190, 255), font=font)
    d.text((HALF + HALF // 2 - 50, HDR + 6), "REIGNITED", fill=(255, 220, 120, 255), font=font)

    bg = Image.new("RGBA", canvas.size, (12, 12, 14, 255))
    final = Image.alpha_composite(bg, canvas).convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, optimize=True)
    print(f"wrote {OUT} {final.size}")


if __name__ == "__main__":
    main()
