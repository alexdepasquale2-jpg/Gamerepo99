#!/usr/bin/env python3
"""Flatten ansimuz Trees & Bushes canopies to town-building clean shading.

Reads the pristine CC0 sheet (assets/vendor/ansimuz-trees-and-bushes.src.png),
remaps to the town-olive palette (same greens/browns as 6379017), closes small
canopy holes, median/mean-filters value, hard-quantizes to 4 flat bands
(light / mid / shadow / outline), and writes assets/vendor/ansimuz-trees-and-bushes.png.

Trunk browns are remapped but not re-shaded. Building-wall exclusion stays in
overworld-paint.ts (untouched).

Usage:
  python3 scripts/art/flatten-trees-canopy.py
"""
from __future__ import annotations

from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/vendor/ansimuz-trees-and-bushes.src.png"
OUT = ROOT / "assets/vendor/ansimuz-trees-and-bushes.png"
RIGHT_COL_X = 220  # fir/bush/small props — gentle remap only (no hole-fill blob)

# Town-olive canopy bands (match town sheet dark + prior remap mid/light)
OUTLINE = np.array([0x3A, 0x42, 0x16, 255], dtype=np.uint8)
SHADOW = np.array([0x48, 0x60, 0x18, 255], dtype=np.uint8)
MID = np.array([0x68, 0x80, 0x28, 255], dtype=np.uint8)
LIGHT = np.array([0xA8, 0xB8, 0x48, 255], dtype=np.uint8)
TDARK = np.array([0x48, 0x38, 0x28, 255], dtype=np.uint8)
TMID = np.array([0x68, 0x50, 0x30, 255], dtype=np.uint8)
TLIGHT = np.array([0x88, 0x68, 0x40, 255], dtype=np.uint8)

# Original ansimuz sheet colors → role (dark_fill punched transparent like 6379017)
ORIG_MAP: dict[tuple[int, int, int], str] = {
    (0x25, 0x22, 0x2E): "dark_fill",
    (0x11, 0x4D, 0x3C): "canopy_mid",
    (0x31, 0x4F, 0x45): "canopy_light",
    (0x3D, 0x3F, 0x37): "trunk_dark",
    (0x5D, 0x60, 0x2C): "trunk_mid",
    (0x9A, 0x92, 0x3A): "trunk_light",
    (0x2B, 0x40, 0x45): "dark_fill",
    (0x24, 0x50, 0x22): "canopy_mid",
    (0x3D, 0x3E, 0x37): "trunk_dark",
    (0x40, 0x24, 0x18): "trunk_dark",
    (0x2E, 0x4A, 0x41): "canopy_mid",
    (0x35, 0x54, 0x46): "canopy_light",
    (0xD3, 0xC6, 0x3B): "trunk_light",
    (0xD3, 0x8F, 0x10): "drop",
    (0xAB, 0x7A, 0x1E): "trunk_light",
    (0x28, 0x3C, 0x41): "dark_fill",
    (0xFA, 0xEB, 0x54): "trunk_light",
    (0x00, 0x00, 0x00): "dark_fill",
}


def dilate(m: np.ndarray, r: int = 1) -> np.ndarray:
    h, w = m.shape
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx > r * r or (dy == 0 and dx == 0):
                continue
            shifted = np.zeros_like(m)
            shifted[max(0, dy) : min(h, h + dy), max(0, dx) : min(w, w + dx)] = m[
                max(0, -dy) : min(h, h - dy), max(0, -dx) : min(w, w - dx)
            ]
            out |= shifted
    return out


def erode(m: np.ndarray, r: int = 1) -> np.ndarray:
    h, w = m.shape
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx > r * r:
                continue
            shifted = np.zeros_like(m)
            shifted[max(0, dy) : min(h, h + dy), max(0, dx) : min(w, w + dx)] = m[
                max(0, -dy) : min(h, h - dy), max(0, -dx) : min(w, w - dx)
            ]
            out &= shifted
    return out


def fill_holes(canopy: np.ndarray, trunk: np.ndarray, max_hole: int = 250) -> np.ndarray:
    h, w = canopy.shape
    empty = ~(canopy | trunk)
    visited = np.zeros((h, w), dtype=bool)
    fill = canopy.copy()
    for y in range(h):
        for x in range(w):
            if not empty[y, x] or visited[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(y, x)])
            visited[y, x] = True
            comp = [(y, x)]
            border = False
            while q:
                cy, cx = q.popleft()
                if cy in (0, h - 1) or cx in (0, w - 1):
                    border = True
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if not (0 <= ny < h and 0 <= nx < w):
                        border = True
                        continue
                    if visited[ny, nx] or not empty[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    q.append((ny, nx))
                    comp.append((ny, nx))
            if (not border) and len(comp) <= max_hole:
                for cy, cx in comp:
                    fill[cy, cx] = True
    return fill


def median_filter_masked(val: np.ndarray, mask: np.ndarray, radius: int = 2, passes: int = 3) -> np.ndarray:
    h, w = mask.shape
    v = val.copy()
    for _ in range(passes):
        new = v.copy()
        for y, x in zip(*np.where(mask)):
            samples: list[float] = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dy * dy + dx * dx > radius * radius:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                        samples.append(float(v[ny, nx]))
            if samples:
                samples.sort()
                new[y, x] = samples[len(samples) // 2]
        v = new
    return v


def mean_filter_masked(val: np.ndarray, mask: np.ndarray, radius: int = 2, passes: int = 3) -> np.ndarray:
    h, w = mask.shape
    v = val.copy()
    for _ in range(passes):
        new = v.copy()
        for y, x in zip(*np.where(mask)):
            s = 0.0
            n = 0
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dy * dy + dx * dx > radius * radius:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                        s += float(v[ny, nx])
                        n += 1
            if n:
                new[y, x] = s / n
        v = new
    return v


def despeckle(role: np.ndarray, mask: np.ndarray, valid: tuple[int, ...], passes: int = 12, own_max: int = 3) -> np.ndarray:
    h, w = mask.shape
    r = role.copy()
    order = {3: 0, 2: 1, 4: 2, 1: 3}
    for _ in range(passes):
        new = r.copy()
        changed = 0
        for y, x in zip(*np.where(mask)):
            if y == 0 or x == 0 or y == h - 1 or x == w - 1:
                continue
            me = int(r[y, x])
            if me not in valid:
                continue
            votes = [
                int(r[y + dy, x + dx])
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                if r[y + dy, x + dx] in valid
            ]
            own = sum(1 for v in votes if v == me)
            if own <= own_max:
                cnt = Counter(v for v in votes if v != me)
                if not cnt:
                    continue
                best = sorted(cnt.items(), key=lambda kv: (-kv[1], order[kv[0]]))[0][0]
                if best != me:
                    new[y, x] = best
                    changed += 1
        r = new
        if changed == 0:
            break
    return r


def remap_base(orig: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Town-olive remap; punch dark dither carpet to transparent. Returns base, trunk, canopy0."""
    h, w, _ = orig.shape
    base = np.zeros_like(orig)
    for y in range(h):
        for x in range(w):
            if orig[y, x, 3] == 0:
                continue
            key = (int(orig[y, x, 0]), int(orig[y, x, 1]), int(orig[y, x, 2]))
            role = ORIG_MAP.get(key)
            if role is None:
                r, g, b = key
                if g > r + 5 and g > b:
                    role = "canopy_mid"
                elif r + g + b < 80:
                    role = "dark_fill"
                else:
                    role = "trunk_mid"
            if role in ("dark_fill", "drop"):
                continue
            if role == "canopy_mid":
                base[y, x] = MID
            elif role == "canopy_light":
                base[y, x] = LIGHT
            elif role == "trunk_dark":
                base[y, x] = TDARK
            elif role == "trunk_mid":
                base[y, x] = TMID
            elif role == "trunk_light":
                base[y, x] = TLIGHT
    trunk = (
        ((base[:, :, 0] == TDARK[0]) & (base[:, :, 1] == TDARK[1]) & (base[:, :, 2] == TDARK[2]) & (base[:, :, 3] > 0))
        | ((base[:, :, 0] == TMID[0]) & (base[:, :, 1] == TMID[1]) & (base[:, :, 2] == TMID[2]) & (base[:, :, 3] > 0))
        | ((base[:, :, 0] == TLIGHT[0]) & (base[:, :, 1] == TLIGHT[1]) & (base[:, :, 2] == TLIGHT[2]) & (base[:, :, 3] > 0))
    )
    canopy0 = (base[:, :, 3] > 0) & ~trunk
    return base, trunk, canopy0



def round_silhouette(mask: np.ndarray, passes: int = 5) -> np.ndarray:
    """Soften blocky jaggies: fill notches, chamfer outer 90° corners, shave spikes."""
    h, w = mask.shape
    m = mask.copy()
    for _ in range(passes):
        fill: list[tuple[int, int]] = []
        clear: list[tuple[int, int]] = []
        for y in range(2, h - 2):
            for x in range(2, w - 2):
                n = bool(m[y - 1, x])
                s = bool(m[y + 1, x])
                e = bool(m[y, x + 1])
                ww = bool(m[y, x - 1])
                if not m[y, x]:
                    n8 = sum(
                        1
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                        if not (dy == 0 and dx == 0) and m[y + dy, x + dx]
                    )
                    # Concave notch / diagonal step fill
                    if ((n and e) or (n and ww) or (s and e) or (s and ww)) and n8 >= 3:
                        fill.append((y, x))
                    elif n8 >= 5:
                        fill.append((y, x))
                else:
                    card = int(n) + int(s) + int(e) + int(ww)
                    n8 = sum(
                        1
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                        if not (dy == 0 and dx == 0) and m[y + dy, x + dx]
                    )
                    # Spike
                    if card <= 1 and n8 <= 2:
                        clear.append((y, x))
                        continue
                    # Chamfer sharp outer 90° corner when both arms are ≥2px
                    # SE-open corner
                    if (not e) and (not s) and ww and n and m[y, x - 2] and m[y - 2, x]:
                        clear.append((y, x))
                    # SW-open
                    elif (not ww) and (not s) and e and n and m[y, x + 2] and m[y - 2, x]:
                        clear.append((y, x))
                    # NE-open
                    elif (not e) and (not n) and ww and s and m[y, x - 2] and m[y + 2, x]:
                        clear.append((y, x))
                    # NW-open
                    elif (not ww) and (not n) and e and s and m[y, x + 2] and m[y + 2, x]:
                        clear.append((y, x))
        for y, x in fill:
            m[y, x] = True
        for y, x in clear:
            m[y, x] = False
    return m


def flatten(base: np.ndarray, trunk: np.ndarray, canopy0: np.ndarray) -> np.ndarray:
    h, w, _ = base.shape
    closed = erode(dilate(canopy0, 2), 2) & ~trunk
    canopy = fill_holes(closed | canopy0, trunk, max_hole=250)
    canopy &= dilate(canopy0, 2) & ~trunk
    canopy = round_silhouette(canopy, passes=5)
    canopy &= ~trunk

    val = np.full((h, w), 0.55, dtype=np.float32)
    val[(base[:, :, 0] == LIGHT[0]) & (base[:, :, 1] == LIGHT[1]) & (base[:, :, 2] == LIGHT[2]) & (base[:, :, 3] > 0)] = 0.80
    val[(base[:, :, 0] == MID[0]) & (base[:, :, 1] == MID[1]) & (base[:, :, 2] == MID[2]) & (base[:, :, 3] > 0)] = 0.55
    val[canopy & (base[:, :, 3] == 0)] = 0.55

    labels = np.zeros((h, w), dtype=np.int32)
    lab = 0
    for y in range(h):
        for x in range(w):
            if not canopy[y, x] or labels[y, x]:
                continue
            lab += 1
            q: deque[tuple[int, int]] = deque([(y, x)])
            labels[y, x] = lab
            cells = [(y, x)]
            while q:
                cy, cx = q.popleft()
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and canopy[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = lab
                        q.append((ny, nx))
                        cells.append((ny, nx))
            ys = [c[0] for c in cells]
            xs = [c[1] for c in cells]
            y0, y1 = min(ys), max(ys)
            x0, x1 = min(xs), max(xs)
            span = max(1, y1 - y0)
            xspan = max(1, x1 - x0)
            for yy, xx in cells:
                ty = (yy - y0) / span
                tx = (xx - x0) / xspan
                bias = (1 - ty) * 0.22 + (1 - tx) * 0.10
                if ty > 0.7:
                    bias -= 0.20
                val[yy, xx] = float(np.clip(val[yy, xx] + bias - 0.10, 0, 1))

    val = median_filter_masked(val, canopy, radius=2, passes=3)
    val = mean_filter_masked(val, canopy, radius=2, passes=3)

    cvs = val[canopy]
    p25, _p50, p75 = np.percentile(cvs, [30, 55, 78])
    role = np.zeros((h, w), dtype=np.uint8)
    role[canopy & (val >= p75)] = 4
    role[canopy & (val < p25)] = 2
    role[canopy & (role == 0)] = 3

    for y, x in zip(*np.where(canopy)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < h and 0 <= nx < w) or not canopy[ny, nx]:
                role[y, x] = 1
                break

    trunk_foot_y = np.full(w, -1, dtype=np.int32)
    for x in range(w):
        col = np.where(trunk[:, x])[0]
        if len(col):
            trunk_foot_y[x] = int(col.max())
    foot = trunk_foot_y.copy()
    for x in range(w):
        if foot[x] < 0:
            for d in range(1, 14):
                for nx in (x - d, x + d):
                    if 0 <= nx < w and trunk_foot_y[nx] >= 0:
                        foot[x] = trunk_foot_y[nx]
                        break
                if foot[x] >= 0:
                    break
    ground = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if canopy[y, x] and foot[x] >= 0 and y >= foot[x] - 1:
                ground[y, x] = True
    role[ground] = 3
    for y, x in zip(*np.where(ground)):
        if y > 0 and not canopy[y - 1, x] and not trunk[y - 1, x]:
            role[y, x] = 4

    role = despeckle(role, canopy & ~ground, (1, 2, 3, 4), passes=12, own_max=3)

    # Round silhouette again after band paint intent, then rebuild outline on new rim
    canopy = round_silhouette(canopy, passes=2)
    canopy &= ~trunk
    # Drop role where silhouette shaved; fill new pixels as mid then outline
    role[~canopy & (role > 0) & (role != 5)] = 0
    new_leaf = canopy & ~ground & (role == 0)
    role[new_leaf] = 3
    for y, x in zip(*np.where(canopy & ~ground)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < h and 0 <= nx < w) or not canopy[ny, nx]:
                role[y, x] = 1
                break
    role = despeckle(role, canopy & ~ground, (1, 2, 3, 4), passes=4, own_max=2)
    # Final outer outline (after despeckle)
    for y, x in zip(*np.where(canopy & ~ground)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < h and 0 <= nx < w) or not canopy[ny, nx]:
                role[y, x] = 1
                break

    out = np.zeros_like(base)
    out[trunk] = base[trunk]
    pal = {1: OUTLINE, 2: SHADOW, 3: MID, 4: LIGHT}
    for rid, col in pal.items():
        out[(role == rid) & canopy] = col
    return out


def gentle_right_column(orig: np.ndarray, baked: np.ndarray) -> np.ndarray:
    """Keep fir/bush/small sprites from hole-fill blobbing; light flat bands only."""
    h, w, _ = orig.shape
    base, trunk, _canopy0 = remap_base(orig)
    out = baked.copy()
    out[:, RIGHT_COL_X:, :] = base[:, RIGHT_COL_X:, :]
    right = np.zeros((h, w), dtype=bool)
    right[:, RIGHT_COL_X:] = True
    leaf = (out[:, :, 3] > 0) & ~trunk & right
    role = np.zeros((h, w), dtype=np.uint8)
    role[leaf & (out[:, :, 0] == LIGHT[0]) & (out[:, :, 1] == LIGHT[1])] = 4
    role[leaf & (role == 0)] = 3
    for y, x in zip(*np.where(leaf)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < h and 0 <= nx < w) or out[ny, nx, 3] == 0 or trunk[ny, nx]:
                role[y, x] = 1
                break
    # Upper third of each component → light; lower → shadow
    labels = np.zeros((h, w), dtype=np.int32)
    lab = 0
    for y in range(h):
        for x in range(RIGHT_COL_X, w):
            if not leaf[y, x] or labels[y, x]:
                continue
            lab += 1
            q: deque[tuple[int, int]] = deque([(y, x)])
            labels[y, x] = lab
            cells = [(y, x)]
            while q:
                cy, cx = q.popleft()
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and leaf[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = lab
                        q.append((ny, nx))
                        cells.append((ny, nx))
            ys = [c[0] for c in cells]
            y0, y1 = min(ys), max(ys)
            span = max(1, y1 - y0)
            for yy, xx in cells:
                if role[yy, xx] == 1:
                    continue
                ty = (yy - y0) / span
                role[yy, xx] = 4 if ty < 0.35 else (2 if ty > 0.72 else 3)
    pal = {1: OUTLINE, 2: SHADOW, 3: MID, 4: LIGHT}
    for rid, col in pal.items():
        out[(role == rid) & leaf] = col
    out[trunk & right] = base[trunk & right]
    # Soft round on right-col leaf only (1 pass)
    leaf_mask = (out[:, :, 3] > 0) & ~trunk & right
    leaf_mask = round_silhouette(leaf_mask, passes=2)
    # clear shaved
    drop = right & ~trunk & (baked[:, :, 3] > 0)  # noqa — use previous leaf
    # Rebuild alpha for right leaf from leaf_mask + trunks
    for y in range(h):
        for x in range(RIGHT_COL_X, w):
            if trunk[y, x]:
                continue
            if leaf_mask[y, x]:
                if out[y, x, 3] == 0:
                    out[y, x] = MID
            else:
                if not trunk[y, x]:
                    out[y, x] = (0, 0, 0, 0)
    return out



def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing pristine source: {SRC}")
    orig = np.array(Image.open(SRC).convert("RGBA"))
    base, trunk, canopy0 = remap_base(orig)
    out = flatten(base, trunk, canopy0)
    out = gentle_right_column(orig, out)
    Image.fromarray(out, "RGBA").save(OUT)
    opaque = int((out[:, :, 3] > 0).sum())
    colors = Counter(tuple(out[y, x, :3]) for y in range(out.shape[0]) for x in range(out.shape[1]) if out[y, x, 3] > 0)
    print(f"wrote {OUT.relative_to(ROOT)} opaque={opaque} colors={len(colors)}")
    for c, n in colors.most_common():
        print(f"  #{c[0]:02x}{c[1]:02x}{c[2]:02x} n={n}")


if __name__ == "__main__":
    main()
