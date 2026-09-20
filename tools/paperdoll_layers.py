"""Original pixel-art appearance layers, using the game's existing variant IDs.

All drawing stays in the generator's shared cell coordinates so every variant
uses the same bone pivots. The base never contains face, hair or clothing art.
"""
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
    return tuple(max(0, min(255, round(c * factor))) for c in rgb[:3]) + (255,)


def recolor(image, mapping):
    out = image.copy()
    out.putdata([mapping.get(pixel, pixel) for pixel in image.getdata()])
    return out


def face(g, variant):
    im = g.new_part()
    d = g.SDraw(im)
    iris = rgba(EYE_COLORS[variant - 1])
    # Sclera, colored iris, dark upper lash, pupil and a tiny catchlight.
    # Expression changes eyelid/brow angles without repainting the skin.
    for x in (39, 43.5):
        top = 10.5 + (.5 if variant in (3, 5) else 0)
        d.rectangle([x, top, x + 2, 13], fill=(255, 241, 209, 255))
        d.rectangle([x + .5, top + .5, x + 1.5, 13], fill=iris)
        d.rectangle([x + 1, top + .5, x + 1, 12.5], fill=g.OUTLINE)
        d.line([(x, top), (x + 2, top + (.5 if variant == 3 else 0))], fill=g.OUTLINE, width=.5)
        d.rectangle([x + .5, top + .5, x + .5, top + .5], fill=(255, 255, 239, 255))
        brow = -.5 if variant in (2, 6) else (.5 if variant in (3, 5) else 0)
        d.line([(x, 9.5), (x + 2, 9.5 + brow)], fill=g.OUTLINE, width=.5)
    d.line([(42, 15), (43.5, 15 + (.5 if variant == 7 else 0))], fill=(149, 80,  70, 255), width=.5)
    return im


def monster_face(g, variant):
    """Creature faces c8+: glowing eyes, angry brows, tusked grins."""
    im = g.new_part()
    d = g.SDraw(im)
    iris, core = {
        8:  ((255, 217, 74), (20, 20, 10)),     # goblin amber
        9:  ((255, 160, 60), (140, 24, 18)),    # imp ember
        10: ((143, 242, 255), (232, 253, 255)), # stone hollow glow
    }[variant]
    for x in (39, 43.5):
        d.rectangle([x, 10.5, x + 2, 13], fill=rgba(iris))
        d.rectangle([x + 1, 11, x + 1, 12.5], fill=rgba(core))
        d.line([(x - .5, 9.5), (x + 2.5, 10)], fill=g.OUTLINE, width=.75)
    # Wide toothy grin; tusks point up from the lower lip.
    d.line([(40, 15), (45.5, 15)], fill=g.OUTLINE, width=1)
    teeth = (244, 240, 221, 255)
    d.polygon([(41, 15), (41.8, 16.6), (42.6, 15)], fill=teeth, outline=g.OUTLINE)
    d.polygon([(43.6, 15), (44.4, 16.6), (45.2, 15)], fill=teeth, outline=g.OUTLINE)
    d.line([(42.5, 15), (44, 15)], fill=teeth, width=.5)
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
    crown = 4 + (idx // 4) * .5
    d.polygon([(35, 8), (35, 6), (37, 6), (37, crown + .5), (40, crown),
               (43, crown), (46, 5.5), (47, 7), (47, 9), (45, 9),
               (44, 8), (42, 10), (41, 8.5), (39, 10), (38, 9),
               (37.5, 13), (35.5, 13), (34.5, 10)], fill=main, outline=g.OUTLINE)
    if family == 3:
        d.polygon([(36, 6), (37, 3.5), (39, 5), (41, 3), (43, 5),
                   (45, 4), (46, 7)], fill=main, outline=g.OUTLINE)
    d.polygon([(36, 7), (38, crown + 1), (42, crown + .5), (45, 6.5),
               (42, 6.5), (39, 7.5), (37, 9)], fill=light)
    # Different partings within a family; all existing style IDs remain usable.
    part = 38 + idx % 5
    d.line([(part, crown + 1), (part - 1, 8)], fill=dark, width=.5)
    d.polygon([(35, 9), (37, 9), (37, 12.5), (35.5, 12.5)], fill=dark)
    return im


def outfit(g, part, style, color):
    im = g.new_part()
    d = g.SDraw(im)
    family = (style - 1) % 5
    main, light, dark = rgba(color), shade(color, 1.5), shade(color, .6)
    trim = (244, 204, 120, 255) if style % 2 else (200, 213, 220, 255)
    if part == 'torso':
        hem = 27 + (.5 if family in (1, 3) else 0)
        d.polygon([(37, 18), (41, 17.5), (44, 19), (44, 23),
                   (43, 24), (44.5, hem), (35.5, hem), (37, 23)], fill=main, outline=g.OUTLINE)
        d.polygon([(37, 19), (39, 19), (39, 24), (37, hem-1), (36, hem-1)], fill=dark)
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
                g.capsule(d, sh, elbow, 2.5, main, g.OUTLINE, cap_r=1.8)
                d.line([sh, (elbow[0], elbow[1]-1)], fill=light, width=.5)
        else:
            if family in (1, 3):
                g.capsule(d, elbow, wrist, 2, main, g.OUTLINE, cap_r=1.5)
            d.rectangle([wrist[0]-1.5, wrist[1]-1, wrist[0]+1.5, wrist[1]+.5], fill=g.LEATHER, outline=g.OUTLINE)
            d.line([(wrist[0]-1, wrist[1]-.5), (wrist[0]+1, wrist[1]-.5)], fill=trim, width=.5)
    elif part.startswith('leg'):
        hip, knee, ankle = (g.HIP_B, g.KNEE_B, g.ANK_B) if part[3] == 'B' else (g.HIP_F, g.KNEE_F, g.ANK_F)
        if part.endswith('_u'):
            g.capsule(d, hip, knee, 3, dark, g.OUTLINE, cap_r=2)
            d.line([(hip[0], hip[1]+1), (knee[0], knee[1]-1)], fill=main, width=1)
        else:
            g._shin(knee, ankle, g.SKIN, im)
            im = recolor(im, {g.SKIN: g.LEATHER, g.SKIN_LIGHT: g.LEATHER_LIGHT})
            d = g.SDraw(im)
            d.line([(knee[0]-1, knee[1]+1), (knee[0]+1, knee[1]+1)], fill=trim, width=.5)
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
    faces = {f'face_c{i}': face(g,i) for i in range(1,8)}
    faces.update({f'face_c{i}': monster_face(g,i) for i in (8,9,10)})
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
    for part in g.SLOT_ORDER:
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
            layers.append(('face_head', 'head', 'face_c1', faces, {}))
            layers.append(('hair_top_head', 'head', 'hair_m1_c1', hair_variants(False), {}))
            layers.append(('ears_ears', 'ears', None, ears_v, {}))
            layers.append(('horns_horns', 'horns', None,
                           {f'horns_{s}': horns(g,s) for s in ('imp',)}, {}))
        if part == 'torso':
            # Over-arm sub gear (shields) — over the torso and everything it
            # covers (head draws earlier too), while the near-side limbs and
            # main weapon still paint on top.
            layers.append(over_layer)
    layers.append(front_layer)
    return layers


# Creature presets assembled from the doll wardrobe — the paper-doll template
# reused for humanoid enemies. Mirrored by ENEMY_DOLL_PRESETS in
# wails/frontend/src/characters/enemies.ts — keep the two in sync.
CREATURE_PRESETS = {
    "goblin": {
        "scale": 0.85,
        "shape": {"head": 1.15, "height": 0.9, "ears": 1.35},
        "appearance": {"skin": "c7", "face": "c8", "hair": "", "cloth": "cloth5",
                       "cloth_color": "c3", "weapon": "weapon3", "ears": "point",
                       "sub_weapon": "weapon7", "sub_weapon_color": "c3"},
    },
    "imp": {
        "scale": 0.75,
        "shape": {"height": 0.9, "ears": 1.2, "horns": 1.15},
        "appearance": {"skin": "c8", "face": "c9", "hair": "", "cloth": "cloth10",
                       "cloth_color": "c8", "weapon": "weapon6", "ears": "long",
                       "horns": "imp", "wings": "bat", "tail": "spade"},
    },
    "stone_imp": {
        "scale": 0.75,
        "shape": {"chest": 1.2, "armWidth": 1.15, "legWidth": 1.1,
                  "height": 0.95, "head": 0.9, "horns": 1.2, "wings": 1.25},
        "appearance": {"skin": "c9", "face": "c10", "hair": "", "cloth": "",
                       "weapon": "", "ears": "long", "horns": "imp",
                       "wings": "stone", "tail": "spade"},
    },
}
