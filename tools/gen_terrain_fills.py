#!/usr/bin/env python3
"""Generate seamless terrain fill textures — the per-category tiles the paint
layer bakes with.

    python tools/gen_terrain_fills.py

Writes wails/frontend/public/assets/terrain-fills/<category>.png — one
tileable 1024px texture per paint category (water, grass, sand, snow, rock).
Each is summed-octave value noise sampled through a wrapped lattice, so the
texture is continuous (no stamped silhouettes) and tiles exactly in every
direction. Octave frequencies all divide SIZE, which is what makes the wrap
exact.

SIZE px covers PAINT_FILL_WORLD world px (512) — 2 texels per world px, so
the painted terrain carries finer grain than the 1:1 tile art. The bake and
the editor preview both read the image's own size, so the density is safe to
change by editing SIZE alone.
"""

import os
import random

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "wails", "frontend", "public", "assets", "terrain-fills")
SIZE = 1024              # texture px — covers PAINT_FILL_WORLD world px
PAINT_FILL_WORLD = 512   # world px per tile — mirrors bake_terrain.py
SEED = 7

# (dark, base, light) color ramp — the noise field interpolates through these.
# water also sprinkles glint streaks; everything is opaque (no alpha).
SPECS = {
    "water": ((30, 74, 150), (52, 120, 190), (150, 205, 235), 26),
    "grass": ((88, 148, 74), (118, 178, 92), (158, 210, 130), 0),
    "sand":  ((196, 170, 120), (222, 200, 148), (244, 226, 184), 0),
    "snow":  ((212, 226, 240), (234, 242, 250), (250, 253, 255), 0),
    "rock":  ((116, 96, 76), (146, 126, 102), (176, 156, 130), 0),
}

# (lattice frequency, amplitude) — every freq divides SIZE so the wrapped
# interpolation tiles seamlessly. Low freqs give broad tonal patches, high
# freqs the fine grain.
OCTAVES = ((3, 0.42), (6, 0.26), (12, 0.18), (24, 0.10), (48, 0.06),
           (96, 0.04))


def noise_field(nrng, size, octaves=OCTAVES):
    """Tileable multi-octave value noise in [0,1] — each octave's lattice
    wraps (index mod freq), so opposite edges share lattice values and the
    interpolated field tiles exactly."""
    acc = np.zeros((size, size), dtype=np.float64)
    tot = 0.0
    for freq, amp in octaves:
        g = nrng.random((freq, freq))
        t = np.arange(size) * (freq / size)
        i0 = t.astype(np.int64) % freq
        i1 = (i0 + 1) % freq
        f = (t - np.floor(t))
        f = f * f * (3 - 2 * f)          # smoothstep
        fy, fx = f[:, None], f[None, :]
        g00 = g[np.ix_(i0, i0)]
        g01 = g[np.ix_(i1, i0)]
        g10 = g[np.ix_(i0, i1)]
        g11 = g[np.ix_(i1, i1)]
        acc += amp * (g00 * (1 - fy) * (1 - fx) + g01 * fy * (1 - fx)
                      + g10 * (1 - fy) * fx + g11 * fy * fx)
        tot += amp
    acc /= tot
    # Stretch to full contrast.
    lo, hi = acc.min(), acc.max()
    return (acc - lo) / max(hi - lo, 1e-9)


def gen_fill(cat, rng, size=SIZE):
    dark, base, light, n_glints = SPECS[cat]
    nrng = np.random.RandomState(rng.randint(0, 2 ** 31 - 1))
    n = noise_field(nrng, size)
    # Pixel-art mottle: an independent random value per 4-texel block (2 world
    # px at 2x density) layered over the smooth field — crisp squares that
    # tile because B divides SIZE.
    B = 4
    blk = nrng.random((size // B, size // B))
    n = np.clip(n * 0.72 + np.repeat(np.repeat(blk, B, 0), B, 1) * 0.40,
                0, 1)
    # Ramp: n<0.5 dark->base, n>0.5 base->light.
    a = np.empty((size, size, 3), dtype=np.float64)
    for ch in range(3):
        a[..., ch] = np.interp(n, (0.0, 0.5, 1.0),
                               (dark[ch], base[ch], light[ch]))
    # Fine per-texel grain so flat runs don't band.
    a += nrng.randint(-5, 6, (size, size, 1))
    img = np.clip(a, 0, 255).astype(np.uint8)
    if n_glints:  # short wrapped streaks on the light tone
        for _ in range(n_glints):
            w = rng.randint(4, 12)
            x, y = rng.randint(0, size - 1), rng.randint(0, size - 1)
            xs = (x + np.arange(w)) % size
            img[y, xs] = light
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for cat in SPECS:
        arr = gen_fill(cat, random.Random(f"{SEED}:{cat}"))
        path = os.path.join(OUT, f"{cat}.png")
        Image.fromarray(arr, "RGB").save(path, optimize=True)
        print(f"  {cat}: {path}")
    print(f"generated {len(SPECS)} fill textures ({SIZE}px / "
          f"{PAINT_FILL_WORLD} world px) -> {OUT}")


if __name__ == "__main__":
    main()
