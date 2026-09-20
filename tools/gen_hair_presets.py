#!/usr/bin/env python3
"""Generate the stock rigged-hair presets as tools/hairs/*.hair.json docs.

Each preset paints its bangs/top/tail parts in the shared hair window
(tools/hair_docs.py) using the canonical hair ramp so the paperdoll bake
can recolor them. Users clone these in the editor's Hair workspace.

Run from the repo root:  python tools/gen_hair_presets.py
"""

import base64
import io
import json
import os

from PIL import Image, ImageDraw

if __package__:
    from . import paperdoll_layers as pl
    from .hair_docs import (
        CANVAS_H, CANVAS_W, DS, EYE_WINDOW, HAIR_DIR, PARTS, WIN_X0, WIN_Y0,
    )
else:
    import paperdoll_layers as pl
    from hair_docs import (
        CANVAS_H, CANVAS_W, DS, EYE_WINDOW, HAIR_DIR, PARTS, WIN_X0, WIN_Y0,
    )

OUTLINE = (44, 30, 54, 255)
BASE = pl.HAIR_COLORS[0]
MAIN = (*BASE, 255)
LIGHT = pl.shade(BASE, 1.5)
DARK = pl.shade(BASE, 0.6)


class WDraw:
    """ImageDraw proxy over a part canvas: draw calls use cell coords and
    land in the shared hair window at DS px per unit (like SDraw)."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _pts(self, pts):
        if pts and isinstance(pts[0], (int, float)):
            pts = list(zip(pts[::2], pts[1::2]))
        return [((x - WIN_X0) * DS, (y - WIN_Y0) * DS) for x, y in pts]

    def _box(self, b):
        x0, y0 = self._pts(b[0], b[1])[0]
        x1, y1 = self._pts(b[2], b[3])[0]
        return [x0, y0, x1, y1]

    def line(self, pts, width=1, **kw):
        self.d.line(self._pts(pts), width=max(1, round(width * DS)), **kw)

    def polygon(self, pts, **kw):
        self.d.polygon(self._pts(pts), **kw)

    def rectangle(self, box, **kw):
        self.d.rectangle(self._box(box), **kw)

    def ellipse(self, box, **kw):
        self.d.ellipse(self._box(box), **kw)


def new_canvas():
    return Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))


def clear_eye_window(im):
    """Transparent eye band on front hair so the leading eye survives."""
    x0, y0, x1, y1 = EYE_WINDOW
    im.paste((0, 0, 0, 0), (
        round((x0 - WIN_X0) * DS), round((y0 - WIN_Y0) * DS),
        round((x1 - WIN_X0) * DS), round((y1 - WIN_Y0) * DS),
    ))


def png_url(im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def part(pivot, img):
    return {"enabled": img is not None, "pivot": list(pivot),
            "png": png_url(img) if img else ""}


# ---------------------------------------------------------------------------
# Preset part painters. Cell coords: the head spans x 33.5–48, y 4.5–17 and
# faces +x; the window starts at x 26, y 0. Silhouettes follow the house
# style — heavy outline, 3-step ramp, stepped edges.
# ---------------------------------------------------------------------------

def draw_short_spikey():
    top = new_canvas()
    d = WDraw(top)
    # Crown cap with short spike notches along the top edge.
    d.polygon([(33, 9.5), (33.2, 7), (34.5, 5.2), (36, 6.4), (36.8, 3.8),
               (38.5, 5.6), (40, 3.4), (41.5, 5.4), (43.5, 3.6), (44.8, 5.8),
               (46.4, 5), (47.6, 7), (48.2, 10), (47, 13), (45.8, 12.8),
               (45.5, 9.5), (43.8, 11), (42.4, 8.6), (40, 10.6), (38.6, 9),
               (38, 13.6), (35.4, 13.8), (33.4, 11.4)],
              fill=MAIN, outline=OUTLINE)
    d.polygon([(35, 7), (38, 5.4), (43, 5.2), (46.2, 6.6), (43, 6.4),
               (38.6, 7), (35.4, 8.6)], fill=LIGHT)
    d.polygon([(35, 9), (37, 9), (37, 12.5), (35.5, 12.5)], fill=DARK)
    clear_eye_window(top)

    bangs = new_canvas()
    d = WDraw(bangs)
    d.polygon([(43.5, 8), (46, 7.2), (48, 8.6), (48.3, 10.6), (47, 12.4),
               (46, 10.8), (44.8, 12.2), (43.8, 10.4)],
              fill=MAIN, outline=OUTLINE)
    d.line([(44.5, 8.6), (47, 8.2)], fill=DARK, width=0.5)
    clear_eye_window(bangs)
    return {"top": ((40.0, 4.5), top), "bangs": ((44.0, 7.5), bangs)}


def draw_short_combover():
    top = new_canvas()
    d = WDraw(top)
    # Smooth cap swept forward; side part sits at the back-left of the crown.
    d.polygon([(33, 9.5), (33.4, 6.6), (35.4, 4.8), (40, 4), (45, 4.4),
               (47.6, 6.4), (48.4, 9.6), (47.2, 12.6), (45.6, 12.6),
               (45, 9.4), (43, 10.8), (40.6, 8.8), (38, 10.4), (36.8, 8.8),
               (36.4, 13.4), (34, 13.6), (33.2, 11.4)],
              fill=MAIN, outline=OUTLINE)
    d.polygon([(37.5, 5.4), (41, 4.6), (45.4, 5.4), (47, 7), (43.4, 6),
               (39.5, 6.6)], fill=LIGHT)
    d.line([(36.5, 5), (35.8, 9)], fill=DARK, width=0.75)
    d.polygon([(35, 9), (37, 9), (37, 12.5), (35.5, 12.5)], fill=DARK)
    clear_eye_window(top)

    bangs = new_canvas()
    d = WDraw(bangs)
    # Fringe swept diagonally toward the face.
    d.polygon([(43.5, 7.6), (46.5, 7.4), (48.2, 9.4), (47.6, 11.4),
               (46.2, 10), (44.6, 11.6), (43.6, 9.6)],
              fill=MAIN, outline=OUTLINE)
    clear_eye_window(bangs)
    return {"top": ((40.0, 4.5), top), "bangs": ((44.0, 7.5), bangs)}


def draw_tall_spikey():
    top = new_canvas()
    d = WDraw(top)
    # Five tall spikes over a narrow cap; silhouette reaches y ~0.5.
    d.polygon([(33.4, 10), (33.4, 7), (34.6, 4), (35.4, 6.4), (36, 2),
               (37.4, 5), (38.6, 0.8), (39.8, 4.8), (41.5, 0.4), (42.6, 4.6),
               (44.4, 1.4), (45, 5.2), (46.6, 3.4), (47.4, 6.6), (48.2, 9.6),
               (47.2, 12.6), (45.8, 12.4), (45.4, 9.4), (43.6, 11),
               (42, 8.6), (39.6, 10.6), (38.4, 9), (37.8, 13.6), (35, 13.8),
               (33.6, 11.4)], fill=MAIN, outline=OUTLINE)
    d.polygon([(37, 4.6), (38.6, 1.8), (39.6, 4.4), (41.5, 1.2), (42.4, 4.4),
               (40.6, 4.2), (38.8, 5.4)], fill=LIGHT)
    d.polygon([(35, 9), (37, 9), (37, 12.5), (35.5, 12.5)], fill=DARK)
    clear_eye_window(top)

    bangs = new_canvas()
    d = WDraw(bangs)
    d.polygon([(43.6, 7.6), (46.4, 7), (48.2, 9.2), (47.6, 11), (46, 9.8),
               (44.6, 11.4), (43.6, 9.8)], fill=MAIN, outline=OUTLINE)
    clear_eye_window(bangs)
    return {"top": ((40.0, 4.0), top), "bangs": ((44.0, 7.5), bangs)}


def draw_long_wavy():
    top = new_canvas()
    d = WDraw(top)
    d.polygon([(33, 9.6), (33.4, 6.4), (35.8, 4.4), (41, 3.8), (45.6, 4.6),
               (48, 7), (48.6, 10.4), (47.4, 13.2), (45.8, 13), (45.2, 9.6),
               (43.2, 11.2), (40.8, 9), (38.2, 10.8), (37, 9.2), (36.4, 14),
               (33.8, 14), (33, 11.6)], fill=MAIN, outline=OUTLINE)
    d.polygon([(35, 6.6), (39, 5), (44, 5.4), (46.8, 7), (43.4, 6.2),
               (38.6, 6.8), (35.6, 8.6)], fill=LIGHT)
    clear_eye_window(top)

    bangs = new_canvas()
    d = WDraw(bangs)
    # Soft fringe plus a side lock framing the face.
    d.polygon([(43.4, 7.8), (46.6, 7.4), (48.4, 9.6), (48, 12), (46.6, 10.8),
               (45.4, 12.4), (44.2, 10.6), (43.4, 10)],
              fill=MAIN, outline=OUTLINE)
    d.polygon([(46.6, 9), (47.6, 9.4), (47.4, 14.5), (46.6, 15), (46.2, 12)],
              fill=MAIN, outline=OUTLINE)
    clear_eye_window(bangs)

    tail = new_canvas()
    d = WDraw(tail)
    # Long mass behind the skull with a wavy trailing edge, down to y ~24.
    d.polygon([(34.5, 7.5), (37, 8), (37.5, 11), (36, 13), (37, 16),
               (35.5, 18.5), (36.5, 21), (34.5, 24.5), (31.5, 24), (30, 21),
               (31, 18), (29.8, 15), (31, 12), (30.5, 9.5)],
              fill=MAIN, outline=OUTLINE)
    d.line([(35.6, 9), (34, 12), (35, 15), (33.8, 18), (34.6, 21)],
           fill=DARK, width=0.75)
    d.line([(33, 9), (31.8, 12), (32.6, 15), (31.6, 18), (32.4, 21)],
           fill=LIGHT, width=0.5)
    return {
        "top": ((40.0, 4.5), top),
        "bangs": ((44.0, 7.5), bangs),
        "tail": ((35.5, 9.0), tail),
    }


PRESETS = {
    "short_spikey": ("Short Spikey Hair", draw_short_spikey, 0.8),
    "short_combover": ("Short Comb Over", draw_short_combover, 0.8),
    "tall_spikey": ("Tall Spikey Hair", draw_tall_spikey, 0.9),
    "long_wavy": ("Long Wavy Hair", draw_long_wavy, 1.1),
}


def main():
    os.makedirs(HAIR_DIR, exist_ok=True)
    for hid, (label, painter, sway) in PRESETS.items():
        parts = {}
        drawn = painter()
        for name in PARTS:
            pivot, img = drawn.get(name, (None, None))
            if img is None or img.getbbox() is None:
                continue
            parts[name] = part(pivot, img)
        doc = {
            "id": hid,
            "label": label,
            "preset": True,
            "sway": sway,
            "parts": parts,
        }
        path = os.path.join(HAIR_DIR, f"{hid}.hair.json")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(doc, f)
            f.write("\n")
        print(f"wrote {path} ({', '.join(parts)})")


if __name__ == "__main__":
    main()
