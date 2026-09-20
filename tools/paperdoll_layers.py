"""Original pixel-art appearance layers, using the game's existing variant IDs.

All drawing stays in the generator's shared cell coordinates so every variant
uses the same bone pivots. The base never contains face, hair or clothing art.
"""
import colorsys
import os

from PIL import Image

SKINS = [
    ((239, 184, 126), (193, 123, 95)), ((255, 215, 174), (207, 157, 130)),
    ((210, 151, 101), (157, 97, 75)), ((171, 113, 79), (118, 71, 65)),
    ((124, 81, 66), (78,  50, 53)), (( 90, 62, 56), (53, 39, 45)),
    # Creature tones — enemy presets only; not in the player wizard.
    ((140, 178, 84),  (96, 128, 58)),    # c7 goblin green
    ((196, 92, 80),   (142, 62, 58)),    # c8 imp crimson
    ((162, 164, 182), (110, 112, 132)),  # c9 stone gray
]
HAIR_COLORS = [(108, 61, 51), ( 50,  40, 49), (204, 161,  70),
               (162, 65,  50), (212,  80,  50), (225, 220, 211),
               (65,  90, 136), (135,  80, 162), ( 70, 126,  90), (221, 138, 161)]
CLOTH_COLORS = [(52, 126, 127), (70,  90, 168), (177, 64,  70), (132,  80, 166),
                (177, 134,  60), ( 70, 135,  70), (197, 188, 167), (75,  70,  90)]
EYE_COLORS = [(48, 139, 191), (63, 157, 99), (158, 93, 49), (145,  90, 180),
              (201, 149,  50), (55, 162, 170), (151, 163, 185)]


def rgba(rgb):
    return (*rgb, 255)


def shade(rgb, factor):
    """Build a saturated SNES-style ramp instead of a flat RGB multiply.

    Shadows lean slightly cooler and retain chroma; highlights lean slightly
    warmer and lose a touch of saturation.  The small hue separation keeps
    cloth, hair, hide and metal readable inside the heavy shared outline.
    """
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb[:3]))
    if factor < 1:
        h = (h + .035) % 1.0
        s = min(1.0, s * 1.08)
    elif factor > 1:
        h = (h - .018) % 1.0
        s *= .9
    v = max(0.0, min(1.0, v * factor))
    return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v)) + (255,)


def recolor(image, mapping):
    out = image.copy()
    out.putdata([mapping.get(pixel, pixel) for pixel in image.getdata()])
    return out


# Extracted MapleStory faces (tools/faces/ms<N>.png via fetch_ms_faces.py).
# Nexon placeholder art — the variants show up in the editor as face_msN.
MS_FACES = [f"ms{i}" for i in range(1, 15)]
MS_EYE_Y = 11.4   # paperdoll eye line (cell units)
MS_EYE_X = 41.9   # center of the eye span (cell units)
MS_SPAN = 52      # target eye-span width in draw px (~6.5 cell units)


def ms_face(g, key):
    """Composite an extracted MapleStory face sprite into cell coords.

    Scaled NEAREST to preserve the pixel clusters, then anchored by its
    densest dark row (the eye line) rather than the sprite origin — the
    female-series origins float well above the eyes.
    """
    im = g.new_part()
    src = Image.open(os.path.join(g.ROOT, "tools", "faces", f"{key}.png"))
    src = src.convert("RGBA").transpose(Image.FLIP_LEFT_RIGHT)
    px = src.load()

    def dark(x, y):
        p = px[x, y]
        return p[3] > 128 and sum(p[:3]) < 300

    # Eye line = densest dark row; eye span = dark x-extent across the rows
    # around it. Sprites vary in source size, so the scale is derived per
    # face to map every eye span onto the same target width — a fixed px
    # scale would let wide sprites render larger than narrow ones.
    best_y, best_n = 0, -1
    for y in range(src.height):
        n = sum(1 for x in range(src.width) if dark(x, y))
        if n > best_n:
            best_y, best_n = y, n
    xs = [x for y in range(max(0, best_y - 1), min(src.height, best_y + 2))
          for x in range(src.width) if dark(x, y)]
    span = (max(xs) - min(xs) + 1) if xs else src.width
    cx = (min(xs) + max(xs)) / 2 if xs else src.width / 2
    s = max(1.8, min(3.4, MS_SPAN / span))
    scaled = src.resize((round(src.width * s), round(src.height * s)),
                        Image.NEAREST)
    im.alpha_composite(scaled, (round(MS_EYE_X * g.DS - cx * s),
                                round(MS_EYE_Y * g.DS - best_y * s)))
    return im


# Creature recolors of the ms faces. The extracted sprites are monochrome
# linework (black features + white sclera), so a multiply tint does the work:
# dark lines keep their shape while the whites pick up the creature's
# eye-glow color — amber for goblins, ember for imps, hollow cyan for stone.
MS_CREATURE_TINTS = {
    "gob":   (255, 205, 92),
    "imp":   (255, 132, 60),
    "stone": (150, 226, 255),
}


def ms_face_creature(g, key, kind):
    """Creature-tinted ms face — multiplies the sprite by the creature color."""
    tr, tg, tb = MS_CREATURE_TINTS[kind]
    im = ms_face(g, key)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, gg, b, a = px[x, y]
            if a:
                px[x, y] = (r * tr // 255, gg * tg // 255, b * tb // 255, a)
    return im


def ears(g, style):
    """Skin-toned ears — recolored per skin like the body parts."""
    im = g.new_part()
    d = g.SDraw(im)
    if style == 'point':   # goblin: broad ears sweeping back from the jaw
        d.polygon([(35.5, 9.5), (29, 4.5), (36.5, 12)], fill=g.SKIN_DARK, outline=g.OUTLINE)
        d.polygon([(37, 10), (28, 6), (38.5, 14)], fill=g.SKIN, outline=g.OUTLINE)
        d.line([(36.5, 11.5), (30.5, 7.5)], fill=g.SKIN_DARK, width=1)
    elif style == 'long':  # imp: tall narrow ears angled up and back
        d.polygon([(35, 9), (29.5, 1.5), (36.5, 11)], fill=g.SKIN_DARK, outline=g.OUTLINE)
        d.polygon([(36.5, 10), (31, 2.5), (38, 13)], fill=g.SKIN, outline=g.OUTLINE)
        d.line([(36.5, 11), (32.5, 5)], fill=g.SKIN_DARK, width=.75)
    return im


def horns(g, style):
    """Fixed-palette bone horns (not skin-toned)."""
    im = g.new_part()
    d = g.SDraw(im)
    bone, bone_d = rgba((222, 208, 178)), rgba((150, 136, 110))
    if style == 'imp':  # short curved nubs on the crown
        d.polygon([(38.5, 6), (37, 2), (40.5, 5.5)], fill=bone_d, outline=g.OUTLINE)
        d.polygon([(42.5, 5.5), (44.5, 1.5), (45.5, 6)], fill=bone, outline=g.OUTLINE)
    return im


WING_COLORS = {
    'bat':   ((96, 60, 74), (64, 40, 54), (132, 92, 104)),
    'stone': ((104, 106, 126), (72, 74, 92), (140, 142, 160)),
}


def wings(g, style):
    """Bat-style wing rooted at the 'wings' bone pivot (37, 20.5 cell)."""
    im = g.new_part()
    d = g.SDraw(im)
    main, dark, finger = (rgba(c) for c in WING_COLORS[style])
    # Far wing — darker silhouette peeking behind the near one.
    d.polygon([(37, 20), (31.5, 11), (35, 16)], fill=dark, outline=g.OUTLINE)
    # Near wing — scalloped membrane between the finger bones.
    d.polygon([(37, 20.5), (34.5, 12), (30, 8.5), (31, 13.5),
               (33, 15.5), (34, 18.5), (36.5, 22.5)], fill=main, outline=g.OUTLINE)
    for tip in ((30, 8.5), (31, 13.5), (33, 15.5), (34, 18.5)):
        d.line([(37, 20.5), tip], fill=finger, width=.75)
    return im


def tail(g, style):
    """Skin-toned tail rooted at the 'tail' bone pivot (37.5, 26.5 cell)."""
    im = g.new_part()
    d = g.SDraw(im)
    if style == 'spade':  # hangs down-back, curls up into a spade tip
        d.line([(37.5, 26.5), (33.5, 30.5)], fill=g.SKIN_DARK, width=1.5)
        d.line([(33.5, 30.5), (31.5, 28)], fill=g.SKIN_DARK, width=1.5)
        d.line([(37.5, 26.5), (33.5, 30.5)], fill=g.SKIN_LIGHT, width=.5)
        d.polygon([(32.5, 28.5), (29.5, 26), (29, 29.5)], fill=g.SKIN, outline=g.OUTLINE)
    return im


def skin_variants(g, raw):
    """Recolor a SKIN-palette part for every skin tone (like the body slots)."""
    return {f'c{i}': recolor(raw, {g.SKIN: rgba(light), g.SKIN_DARK: rgba(dark),
                                 g.SKIN_LIGHT: shade(light, 1.12)})
            for i, (light, dark) in enumerate(SKINS, 1)}


def hair(g, style, color, back=False):
    im = g.new_part()
    d = g.SDraw(im)
    idx = int(style[1:]) - 1
    family = (idx + (2 if style[0] == 'f' else 0)) % 4
    main, light, dark = rgba(color), shade(color, 1.5), shade(color, .6)
    if back:
        # Long hair and ponytails stay behind the head and torso.
        if family == 1:
            length = 18 + idx % 4
            d.polygon([(35, 9), (39, 9), (39, length), (34, length - 1)], fill=dark, outline=g.OUTLINE)
        elif family == 2:
            length = 18 + idx % 3
            d.polygon([(35, 8), (46, 8), (47, length), (44, length + 1),
                       (42, length - 1), (35, length + 1)], fill=main, outline=g.OUTLINE)
            d.line([(36, 11), (36, length - 1)], fill=light, width=.5)
        return im
    crown = 3.5 + (idx // 4) * .5
    # Large stepped crown and side masses frame the face, matching the visual
    # weight of helmets and hoods instead of reading as a thin decal.
    d.polygon([(33, 9), (33.5, 6.5), (36, 6.5), (36, crown + 1),
               (39, crown), (43, crown), (46, 4.5), (48, 6.5),
               (48.5, 10), (47, 13.5), (44.5, 13.5), (44, 9),
               (42, 11), (40.5, 8.5), (38, 11), (37, 9),
               (36.5, 14), (34, 14), (32.5, 11)], fill=main, outline=g.OUTLINE)
    if family == 3:
        d.polygon([(36, 6), (37, 3.5), (39, 5), (41, 3), (43, 5),
                   (45, 4), (46, 7)], fill=main, outline=g.OUTLINE)
    d.polygon([(34.5, 7), (38, crown + 1), (43, crown + .5), (46.5, 6.5),
               (43, 6.5), (39, 7.5), (36, 9)], fill=light)
    # Different partings within a family; all existing style IDs remain usable.
    part = 38 + idx % 5
    d.line([(part, crown + 1), (part - 1, 8)], fill=dark, width=.5)
    d.polygon([(35, 9), (37, 9), (37, 12.5), (35.5, 12.5)], fill=dark)
    # Keep the leading eye readable in every style. The face layer is drawn
    # below foreground hair, so this shared transparent window prevents the
    # wide side-lock from erasing the eye while leaving the brow/bangs intact.
    im.paste((0, 0, 0, 0),
             (round(44 * g.DS), round(10 * g.DS),
              round(46 * g.DS), round(13.5 * g.DS)))
    return im


def outfit(g, part, style, color):
    im = g.new_part()
    d = g.SDraw(im)
    family = (style - 1) % 5
    main, light, dark = rgba(color), shade(color, 1.5), shade(color, .6)
    trim = (244, 204, 120, 255) if style % 2 else (200, 213, 220, 255)
    if part == 'torso':
        hem = 27 + (.5 if family in (1, 3) else 0)
        d.polygon([(35.5, 19), (39, 17.5), (42, 17.5), (45, 19),
                   (46, 23), (44, 24.5), (46, hem), (34, hem), (36, 23)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(35.5, 19.5), (38.5, 19), (38.5, 24),
                   (36.5, hem-1), (34.5, hem-1)], fill=dark)
        d.polygon([(40, 19), (42.5, 19), (43, 22), (40, 23)], fill=light)
        if family == 2:  # breastplate
            d.rectangle([38, 19, 43, 23], fill=shade(color, 1.2), outline=trim)
        elif family in (1, 3):  # open coat / robe trim
            d.line([(40, 19), (40, hem-1)], fill=trim, width=1)
        elif family == 4:  # vest neckline
            d.polygon([(39, 18), (43, 18), (41, 21)], fill=dark)
        d.rectangle([36.5, 24.5, 43.5, 25.5], fill=g.LEATHER, outline=g.OUTLINE)
        d.rectangle([40.5, 24.5, 42, 25.5], fill=trim)
        if family == 0:
            d.polygon([(38, 17.5), (42, 17.5), (44, 18.5), (42, 20),
                       (38, 19.5)], fill=g.RED, outline=g.OUTLINE)
        # Hem decorations distinguish the higher-numbered variants too.
        for i in range((style - 1) // 5 + 1):
            d.rectangle([37+i*1.5, hem-1, 37+i*1.5+.5, hem-1], fill=trim)
    elif part.startswith('arm'):
        side = part[3]
        sh, elbow, wrist = (g.SH_B, g.ELB_B, g.WRI_B) if side == 'B' else (g.SH_F, g.ELB_F, g.WRI_F)
        if part.endswith('_u'):
            if family != 4:
                g.capsule(d, sh, elbow, 3, main, g.OUTLINE, cap_r=2.1, tip=False)
                d.line([sh, (elbow[0], elbow[1]-1)], fill=light, width=.5)
        else:
            if family in (1, 3):
                g.capsule(d, elbow, wrist, 2.5, main, g.OUTLINE, cap_r=1.6)
            d.rectangle([wrist[0]-2, wrist[1]-1, wrist[0]+2, wrist[1]+1], fill=g.LEATHER, outline=g.OUTLINE)
            d.line([(wrist[0]-1, wrist[1]-.5), (wrist[0]+1, wrist[1]-.5)], fill=trim, width=.5)
    elif part.startswith('leg'):
        hip, knee, ankle = (g.HIP_B, g.KNEE_B, g.ANK_B) if part[3] == 'B' else (g.HIP_F, g.KNEE_F, g.ANK_F)
        if part.endswith('_u'):
            g.capsule(d, hip, knee, 3.5, dark, g.OUTLINE, cap_r=2.0, tip=False)
            d.line([(hip[0], hip[1]+1), (knee[0], knee[1]-1)], fill=main, width=1)
        else:
            g._shin(knee, ankle, g.SKIN, im)
            im = recolor(im, {g.SKIN: g.LEATHER, g.SKIN_LIGHT: g.LEATHER_LIGHT})
            d = g.SDraw(im)
            d.line([(knee[0]-1, knee[1]+1), (knee[0]+1, knee[1]+1)], fill=trim, width=.5)
    return im


def body_object(g, style, color):
    """Reference-style broad torso costume plate.

    These are intentionally larger than the old per-limb cloth decals: one
    attachment owns the main silhouette, then the existing limb cloth slots can
    add cuffs, sleeves or bare-arm variation underneath.
    """
    im = g.new_part()
    d = g.SDraw(im)
    main, light, dark = rgba(color), shade(color, 1.45), shade(color, .58)
    trim = (232, 202, 128, 255) if style % 2 else (204, 216, 225, 255)
    if style == 1:
        d.rounded_rectangle([34.5, 18.2, 45.8, 27.8], radius=2.0, fill=main, outline=g.OUTLINE)
        d.polygon([(35.2, 21), (38.2, 19), (38.0, 27.2), (34.8, 27.2)], fill=dark)
        d.polygon([(39.5, 18.8), (44.4, 19.2), (43.6, 22.4), (40.2, 23.2)], fill=light)
        d.rectangle([36, 25.6, 44.2, 26.7], fill=g.LEATHER, outline=g.OUTLINE)
        d.rectangle([40.4, 25.4, 42.1, 26.9], fill=trim)
    elif style == 2:
        d.polygon([(34.8, 18.5), (39.2, 17.5), (42.4, 17.5), (46.4, 19.5),
                   (46.8, 24.4), (44.4, 26.7), (36.5, 26.8), (34.2, 24)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(36, 20), (40, 18.4), (44.8, 19.7), (43.4, 23.4),
                   (40.4, 24.4), (37.2, 23.2)], fill=light)
        for y in (24.8, 26.4):
            d.line([(35.6, y), (45.2, y - .2)], fill=trim, width=.8)
    elif style == 3:
        d.polygon([(34.2, 18.8), (39, 17.4), (42.7, 17.8), (46.4, 19.8),
                   (45.4, 27.8), (42.4, 28.4), (40.5, 26.2),
                   (38.2, 28.2), (35.2, 27.4)], fill=main, outline=g.OUTLINE)
        d.polygon([(35, 20.5), (39.2, 18.3), (38.4, 27.2), (35.5, 26.5)], fill=dark)
        d.line([(40.5, 18.5), (40.5, 26.4)], fill=trim, width=1)
        d.line([(36.5, 25.2), (44.8, 25.2)], fill=g.LEATHER, width=1)
    elif style == 4:
        d.polygon([(33.8, 19.2), (37.8, 17.2), (43.2, 17.4), (47, 20.3),
                   (45.3, 25.4), (43, 27.8), (37.2, 27.8), (34.5, 25)],
                  fill=dark, outline=g.OUTLINE)
        d.polygon([(36.2, 18.8), (42.5, 18.8), (44.5, 21.5), (42.8, 24.4),
                   (38.4, 24.8), (35.8, 22.2)], fill=main)
        d.rectangle([37.2, 20, 43.4, 23.4], fill=shade(color, 1.18), outline=trim)
        d.line([(37.6, 24.4), (43.2, 24.2)], fill=trim, width=.8)
    else:
        d.polygon([(34.5, 18.6), (39.4, 17.4), (42.8, 17.8), (46.2, 19.2),
                   (46.2, 22.6), (44.2, 24.8), (45.4, 28.4), (35, 28.1),
                   (36.2, 24.8), (34, 22.8)], fill=main, outline=g.OUTLINE)
        d.polygon([(35.6, 19.8), (38.2, 18.8), (38.2, 27.2), (35.2, 27)], fill=dark)
        d.polygon([(40, 18.5), (44.5, 19.2), (43.2, 21.5), (39.5, 22.4)], fill=light)
        d.line([(37.2, 24.4), (44.5, 24.4)], fill=trim, width=1)
        d.line([(36.8, 26.8), (44.5, 26.8)], fill=trim, width=.8)
    return im


def cloak_object(g, style, color):
    im = g.new_part()
    d = g.SDraw(im)
    main, light, dark = rgba(color), shade(color, 1.35), shade(color, .48)
    if style == 1:
        d.polygon([(35.2, 18.6), (39.5, 17), (45.2, 19.4), (47.5, 31),
                   (44.5, 34), (39.8, 28.2), (36.2, 34), (32.5, 31.6)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(33.2, 21), (37.8, 18.4), (36.5, 32.4), (33.4, 30.6)], fill=dark)
        d.line([(41.2, 19), (45.8, 30.5)], fill=light, width=.8)
    elif style == 2:
        d.polygon([(34.2, 19), (39, 17.5), (44.8, 19.2), (46.2, 27.8),
                   (43.6, 30.5), (40, 28), (36.2, 30.6), (33.4, 27.8)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(34.2, 21.5), (38, 19), (37.2, 29.2), (34.2, 27.2)], fill=dark)
        d.line([(37.2, 19.2), (44, 19.8)], fill=light, width=.8)
    elif style == 3:
        d.polygon([(35.4, 18.8), (40.2, 17.2), (45, 19.4), (48, 30.8),
                   (44.4, 33.2), (41, 29.4), (37.8, 33), (34.2, 31)],
                  fill=dark, outline=g.OUTLINE)
        d.polygon([(37, 19), (43.5, 20), (45.6, 29), (41.2, 27.8), (37.6, 30)],
                  fill=main)
        d.line([(43.4, 21), (45.5, 28.2)], fill=light, width=.8)
    else:
        d.polygon([(33.8, 19.4), (38.5, 17.6), (44.4, 18.8), (45.6, 25.5),
                   (43, 26.8), (40.5, 24.8), (38.4, 27), (35.2, 25.8)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(34.4, 21.2), (38, 18.8), (37.2, 25.4), (35, 24.8)], fill=dark)
        d.line([(38.5, 18.8), (43.8, 19.5)], fill=light, width=.8)
    return im


def head_object(g, style, color):
    im = g.new_part()
    d = g.SDraw(im)
    main, light, dark = rgba(color), shade(color, 1.42), shade(color, .55)
    trim = (232, 202, 128, 255) if style % 2 else (204, 216, 225, 255)
    if style == 1:
        d.polygon([(33.5, 8), (36.2, 4.8), (42.8, 4.2), (47.2, 7.3),
                   (48.5, 10.4), (46.5, 12.4), (43.2, 9.4), (38, 10),
                   (35.4, 12.3), (33, 10.8)], fill=main, outline=g.OUTLINE)
        d.line([(36.5, 6.2), (45.2, 7)], fill=light, width=1)
    elif style == 2:
        d.polygon([(34.8, 9), (37.6, 4.8), (43.8, 5), (47.5, 8.2),
                   (47.2, 12.8), (44, 13.5), (40.5, 11.2), (37, 13.2),
                   (34, 12)], fill=dark, outline=g.OUTLINE)
        d.polygon([(36.5, 7), (42.8, 5.9), (46, 8.5), (44, 10.5), (38.2, 10.2)],
                  fill=main)
        d.line([(39, 6.2), (43.4, 9.5)], fill=trim, width=.8)
    elif style == 3:
        d.polygon([(33.5, 9.5), (36.8, 6), (42.6, 5.5), (47.8, 8.5),
                   (49.2, 11.8), (46, 14), (42.8, 12), (39.5, 13.6),
                   (35, 13.3)], fill=main, outline=g.OUTLINE)
        d.rectangle([35.4, 10.8, 48.2, 12.2], fill=trim, outline=g.OUTLINE)
    elif style == 4:
        d.polygon([(35.2, 7.5), (39.4, 3.4), (43.2, 4.8), (47, 7.8),
                   (47.4, 11.8), (44.4, 13.6), (39.5, 12.2), (35, 13)],
                  fill=main, outline=g.OUTLINE)
        d.polygon([(38.6, 4.4), (42, 3.8), (43.2, 7.8), (38, 8.4)], fill=light)
        d.line([(36, 10.6), (46.2, 10.6)], fill=dark, width=1)
    else:
        d.polygon([(34, 8.5), (37.5, 4.5), (43.5, 4.5), (48.2, 8),
                   (48.6, 12.4), (45, 14.2), (41.2, 12.8), (37.2, 14),
                   (33.6, 12.2)], fill=dark, outline=g.OUTLINE)
        d.polygon([(36.2, 7), (42, 5.4), (46.5, 8.2), (45.2, 10.4), (37.2, 10.6)],
                  fill=main)
        d.line([(37.2, 6.7), (45.4, 8.4)], fill=light, width=.8)
    return im


def hand_object(g, style, color, anchor=None):
    im = g.new_part()
    d = g.SDraw(im)
    x, y = anchor or g.HAND_F
    main, light, dark = rgba(color), shade(color, 1.35), shade(color, .55)
    trim = (232, 202, 128, 255) if style % 2 else (204, 216, 225, 255)
    if style == 1:
        d.rounded_rectangle([x - 2.8, y - 2.2, x + 3.2, y + 3.2], radius=1.2, fill=main, outline=g.OUTLINE)
        d.line([(x - 1.8, y - 1.2), (x + 2.2, y - 1.2)], fill=light, width=.7)
        d.rectangle([x - 2.4, y + 1.4, x + 2.7, y + 2.4], fill=trim)
    elif style == 2:
        d.polygon([(x - 3, y - 2), (x + 2.5, y - 3), (x + 4, y),
                   (x + 2.2, y + 3.4), (x - 2.6, y + 2.8), (x - 3.6, y)],
                  fill=main, outline=g.OUTLINE)
        d.line([(x - 1.8, y - 1.8), (x + 2.8, y)], fill=light, width=.8)
    elif style == 3:
        d.polygon([(x - 2.5, y - 2.5), (x + 2.8, y - 2.2), (x + 3.8, y + .6),
                   (x + 1.8, y + 4), (x - 2.6, y + 3.2), (x - 3.4, y)],
                  fill=dark, outline=g.OUTLINE)
        d.polygon([(x - 1.2, y - 1.4), (x + 2.1, y - 1.2), (x + 2.4, y + 1.5),
                   (x - 1, y + 2.4)], fill=main)
        d.line([(x - 1.6, y + 2.8), (x + 2, y + 3.2)], fill=trim, width=.8)
    elif style == 4:
        d.rounded_rectangle([x - 2.6, y - 1.8, x + 3.6, y + 3.8], radius=1.6, fill=main, outline=g.OUTLINE)
        d.polygon([(x - 1.8, y - 1), (x + 2.8, y - .8), (x + 1.5, y + 1.5),
                   (x - 2, y + 1.2)], fill=light)
        d.line([(x - 2.2, y + 2.2), (x + 3, y + 2.2)], fill=dark, width=.8)
    else:
        d.polygon([(x - 3.2, y - 2), (x + 3, y - 2.6), (x + 4.2, y + .4),
                   (x + 2.5, y + 3.8), (x - 2.4, y + 3.4), (x - 4, y + .6)],
                  fill=main, outline=g.OUTLINE)
        d.line([(x - 2, y - 1.2), (x + 2.8, y - .8)], fill=light, width=.8)
        d.line([(x - 2.5, y + 2.3), (x + 2.8, y + 2.6)], fill=trim, width=.8)
    return im


def weapon(g, style, color, anchor=None):
    im = g.new_part()
    d = g.SDraw(im)
    x, y = anchor or g.HAND_F
    d.line([(x, y+2), (x, y-3)], fill=g.OUTLINE, width=2)
    d.line([(x, y+2), (x, y-3)], fill=g.LEATHER_LIGHT, width=1)
    if style in (1, 3):
        length = 10 if style == 1 else 6
        d.polygon([(x-1,y-2), (x-1,y-length), (x,y-length-2),
                   (x+1,y-length), (x+1,y-2)], fill=(192,214,222,255), outline=g.OUTLINE)
        d.line([(x-2,y-2), (x+2,y-2)], fill=(239,191,99,255), width=1)
    elif style == 2:
        d.polygon([(x-1,y-5), (x-4,y-7), (x-4,y-11), (x+1,y-10), (x+2,y-6)],
                  fill=(170,191,207,255), outline=g.OUTLINE)
    elif style == 4:
        d.line([(x,y+5), (x,y-13)], fill=g.LEATHER_LIGHT, width=1)
        d.polygon([(x-1.5,y-12), (x,y-17), (x+1.5,y-12)], fill=(192,214,222,255), outline=g.OUTLINE)
    elif style == 6:  # pitchfork
        d.line([(x,y+5), (x,y-14)], fill=g.LEATHER_LIGHT, width=1)
        d.rectangle([x-2.5,y-14.5,x+2.5,y-13.5], fill=(170,191,207,255), outline=g.OUTLINE)
        for tine in (x-2, x, x+2):
            d.line([(tine,y-14), (tine,y-18)], fill=(192,214,222,255), width=.75)
    elif style == 7:  # heater shield — straps over the forearm, not gripped
        d.polygon([(x-3,y-6), (x+3.5,y-6), (x+5,y-4), (x+5,y+1),
                   (x+1,y+5.5), (x-1,y+5.5), (x-3,y+1)], fill=rgba(color),
                  outline=g.OUTLINE)
        d.line([(x-2.5,y-5.5), (x+3,y-5.5)], fill=shade(color,1.5), width=1)
        d.line([(x+4,y-3.5), (x+4,y+0.5)], fill=shade(color,1.5), width=1)
        d.line([(x-2,y+2), (x+4,y+2)], fill=shade(color,.6), width=.75)
        d.ellipse([x,y-2,x+2,y], fill=(200,213,220,255), outline=g.OUTLINE)
    else:
        d.line([(x,y+5), (x,y-11)], fill=g.LEATHER_LIGHT, width=1)
        d.ellipse([x-2,y-14,x+2,y-10], fill=rgba(color), outline=g.OUTLINE)
        d.rectangle([x-.5,y-13,x,y-12.5], fill=(255,255,239,255))
    return im


def build_layers(g):
    """Return ordered (slot, bone, default attachment, variant images,
    attachment rotations) tuples. Rotations pivot each attachment on its
    bone — weapon art is drawn blade-up through the grip, so a negative
    angle swings the blade forward/down into a natural carry."""
    styles = [f'{s}{i}' for s, n in [('f',9), ('m',14)] for i in range(1,n+1)]
    hair_variants = lambda back: {f'hair_{s}_c{c}': hair(g,s,color,back)
                                  for s in styles for c,color in enumerate(HAIR_COLORS,1)}
    # Extracted MapleStory faces + creature recolors — registered only when
    # the PNGs exist (tools/faces/ms<N>.png via fetch_ms_faces.py).
    faces = {}
    for key in MS_FACES:
        if os.path.exists(os.path.join(g.ROOT, "tools", "faces", f"{key}.png")):
            faces[f'face_{key}'] = ms_face(g, key)
            for kind in MS_CREATURE_TINTS:
                faces[f'face_{key}_{kind}'] = ms_face_creature(g, key, kind)
    ears_v = {f'ears_{s}_{k}': img for s in ('point','long')
              for k, img in skin_variants(g, ears(g,s)).items()}
    tail_v = {f'tail_{s}_{k}': img for s in ('spade',)
              for k, img in skin_variants(g, tail(g,s)).items()}
    layers = [
        # Creature features draw behind the body so limbs pass in front.
        ('wings_wings', 'wings', None, {f'wings_{s}': wings(g,s) for s in WING_COLORS}, {}),
        ('tail_tail', 'tail', None, tail_v, {}),
        ('hair_bot_head', 'head', 'hair_m1_c1', hair_variants(True), {}),
    ]
    # Weapon registry — (key, style, palette color, carry rotation, over_arm).
    # Every weapon mounts on both hand bones at their mid-fist pivot, so the
    # same variant can serve as a main or sub weapon. over_arm pieces (the
    # shield) strap on TOP of the body: on the far hand they mount in
    # weapon_over_* — over the torso, so a raised shield reads as guarding
    # the wearer — and on the near hand in weapon_front_*, the last slot,
    # so a raised shield overlaps everything including its own fist.
    weapon_defs = (
        [(f'weapon{i}', i, EYE_COLORS[0], rot, False) for i, rot in
         ((1, -120), (2, -110), (3, -120), (4, -95), (6, -95))]
        + [(f'weapon5_c{i}', 5, c, -85, False)
           for i, c in enumerate(EYE_COLORS[:4], 1)]
        + [(f'weapon7_c{i}', 7, c, -8, True)
           for i, c in enumerate(CLOTH_COLORS[:4], 1)]
    )
    main_v, main_r, bot_v, bot_r = {}, {}, {}, {}
    over_v, over_r, front_v, front_r = {}, {}, {}, {}
    for key, style, color, rot, over in weapon_defs:
        v, r = (front_v, front_r) if over else (main_v, main_r)
        v[key] = weapon(g, style, color, g.HAND_F)
        r[key] = rot
        v, r = (over_v, over_r) if over else (bot_v, bot_r)
        v[key] = weapon(g, style, color, g.HAND_B)
        r[key] = rot
    # weapon slots emit just before/after their forearm's skin/cloth pair, so
    # the fist and glove cuff paint over a grip — the weapon reads as held.
    weapon_layer = ('weapon_top_weapon', 'weapon', None, main_v, main_r)
    stave_layer = ('weapon_bot_weaponB', 'weaponB', None, bot_v, bot_r)
    over_layer = ('weapon_over_weaponB', 'weaponB', None, over_v, over_r)
    # Near-hand over_arm gear (shields) — the topmost slot, over everything.
    front_layer = ('weapon_front_weapon', 'weapon', None, front_v, front_r)
    body_object_v = {
        f'bodyObject_{s}_c{c}': body_object(g, s, color)
        for s in range(1, 6) for c, color in enumerate(CLOTH_COLORS, 1)
    }
    cloak_object_v = {
        f'cloakObject_{s}_c{c}': cloak_object(g, s, color)
        for s in range(1, 5) for c, color in enumerate(CLOTH_COLORS, 1)
    }
    head_object_v = {
        f'headObject_{s}_c{c}': head_object(g, s, color)
        for s in range(1, 6) for c, color in enumerate(CLOTH_COLORS, 1)
    }
    hand_object_f = {
        f'handObject_{s}_c{c}': hand_object(g, s, color, g.HAND_F)
        for s in range(1, 6) for c, color in enumerate(CLOTH_COLORS, 1)
    }
    hand_object_b = {
        f'handObject_{s}_c{c}': hand_object(g, s, color, g.HAND_B)
        for s in range(1, 6) for c, color in enumerate(CLOTH_COLORS, 1)
    }
    for part in g.SLOT_ORDER:
        if part == 'torso':
            layers.append(('cloak_object_torso', 'torso', None, cloak_object_v, {}))
        if part == 'armB_l':
            layers.append(stave_layer)
        if part == 'armF_l':
            layers.append(weapon_layer)
        raw = g.new_part()
        g.PARTS[part](raw)
        skins = {f'skin_c{i}': recolor(raw, {g.SKIN:rgba(light), g.SKIN_DARK:rgba(dark),
                                            g.SKIN_LIGHT:shade(light,1.12)})
                 for i,(light,dark) in enumerate(SKINS,1)}
        layers.append((f'skin_{part}', part, 'skin_c1', skins, {}))
        if part != 'head':
            variants = {f'cloth{s}_c{c}': outfit(g,part,s,color)
                        for s in range(1,18) for c,color in enumerate(CLOTH_COLORS,1)}
            layers.append((f'cloth_top_{part}', part, 'cloth1_c1', variants, {}))
        else:
            # Ears and horns draw over hair so styles can't hide them; they
            # ride their own head-child bones so shape keys can size them.
            layers.append(('face_head', 'head', 'face_ms1', faces, {}))
            layers.append(('hair_top_head', 'head', 'hair_m1_c1', hair_variants(False), {}))
            layers.append(('head_object_head', 'head', None, head_object_v, {}))
            layers.append(('ears_ears', 'ears', None, ears_v, {}))
            layers.append(('horns_horns', 'horns', None,
                           {f'horns_{s}': horns(g,s) for s in ('imp',)}, {}))
        if part == 'torso':
            layers.append(('body_object_torso', 'torso', None, body_object_v, {}))
            # Over-arm sub gear (shields) — over the torso and everything it
            # covers (head draws earlier too), while the near-side limbs and
            # main weapon still paint on top.
            layers.append(over_layer)
        if part == 'armB_l':
            layers.append(('hand_object_weaponB', 'weaponB', None, hand_object_b, {}))
        if part == 'armF_l':
            layers.append(('hand_object_weapon', 'weapon', None, hand_object_f, {}))
    layers.append(front_layer)
    return layers


# Creature presets assembled from the doll wardrobe — the paper-doll template
# reused for humanoid enemies. Mirrored by ENEMY_DOLL_PRESETS in
# wails/frontend/src/characters/enemies.ts — keep the two in sync.
CREATURE_PRESETS = {
    "goblin": {
        "scale": 0.85,
        "shape": {"head": 1.15, "height": 0.9, "ears": 1.35},
        "appearance": {"skin": "c7", "face": "ms6_gob", "hair": "", "cloth": "cloth5",
                       "cloth_color": "c3", "weapon": "weapon3", "ears": "point",
                       "sub_weapon": "weapon7", "sub_weapon_color": "c3"},
    },
    "imp": {
        "scale": 0.75,
        "shape": {"height": 0.9, "ears": 1.2, "horns": 1.15},
        "appearance": {"skin": "c8", "face": "ms9_imp", "hair": "", "cloth": "cloth10",
                       "cloth_color": "c8", "weapon": "weapon6", "ears": "long",
                       "horns": "imp", "wings": "bat", "tail": "spade"},
    },
    "stone_imp": {
        "scale": 0.75,
        "shape": {"chest": 1.2, "armWidth": 1.15, "legWidth": 1.1,
                  "height": 0.95, "head": 0.9, "horns": 1.2, "wings": 1.25},
        "appearance": {"skin": "c9", "face": "ms12_stone", "hair": "", "cloth": "",
                       "weapon": "", "ears": "long", "horns": "imp",
                       "wings": "stone", "tail": "spade"},
    },
    # Friendly townsfolk — service NPCs (job masters, quest givers) rendered
    # on the shared doll. Mirrored by NPC_DOLL_PRESETS in
    # wails/frontend/src/characters/npcs.ts — keep the two in sync.
    "npc": {
        "scale": 1.0,
        "appearance": {"skin": "c2", "face": "ms2", "hair": "m3",
                       "hair_color": "c1", "cloth": "cloth12",
                       "cloth_color": "c6", "weapon": ""},
    },
    "job_master": {
        "scale": 1.0,
        "appearance": {"skin": "c3", "face": "ms4", "hair": "m2",
                       "hair_color": "c5", "cloth": "cloth9",
                       "cloth_color": "c4", "weapon": "weapon5",
                       "weapon_color": "c3"},
    },
}
