# Paper-doll art style

The project uses an original 16-bit high-fantasy style informed by the visual
design principles of *Seiken Densetsu 3*: bold silhouettes, compact heroic
proportions, saturated material colors, and readable costume layers. Do not
copy its characters, costumes, emblems, or sprite pixels.

## Shape language

- Build every humanoid from the same head, shoulder, hip, hand, and foot
  landmarks in `tools/gen_paperdoll.py`.
- Use a broad head, tapered torso, large hands and feet, and stepped diagonals.
- Hair, hoods, helmets, pauldrons, sleeves, gloves, and boots should form large
  readable masses around a smaller face and core body. Avoid thin decal-like
  costume layers.
- Default to a squat 3/4-front read rather than a narrow profile: the face and
  chest are frontal enough to show both sides, while asymmetry communicates
  facing and supports horizontal mirroring.
- Give each species one silhouette hook: goblin ears, imp horns and wings,
  stone plates, or a quadruped's tail and muzzle. Keep the remaining anatomy
  on the shared rhythm so mixed parties look related.
- Keep joints centered on the actual Spine pivots. Never move a cap to conceal
  a seam; rounded child-part overlap handles rotation.

### Reference synthesis

- Use the larger 3/4-front references for anatomy: squat stance, separated
  boots, oversized hands, broad hair/hat/pauldron masses, and a compact face.
- Use the strict side-view references for directional readability: one clear
  leading edge, a visible nose/brow step, and gear that projects toward the
  facing direction.
- The production doll combines those ideas. It is neither fully frontal nor a
  thin profile, because it must mirror cleanly for left/right movement.

## Pixel language

- Work on the generator's two-pixels-per-cell grid. No antialiasing.
- Do not bake a contour around individual body or equipment parts. Phaser
  applies one dark-plum outline filter to the fully assembled character.
  This rule covers both the humanoid `paperdoll` and animal `quaddoll`
  rigs; only the legacy `h99doll` keeps its original baked treatment.
  Interior facial marks and material separations may still use the darkest
  ramp color where they communicate structure.
- Use three values per material: shadow, local color, and a small highlight.
- Hue-shift ramps instead of multiplying RGB: shadows move slightly cooler and
  stay saturated; highlights move slightly warmer and lose some saturation.
- Keep the face quieter than the costume. One eye cluster and a brow/nose step
  should establish direction; hair, hats and armor carry the larger shapes.
- Favor chunky 2–4 pixel clusters and staircase diagonals. Avoid isolated
  single-pixel noise except for eyes, glints, or a deliberate trim break.
- Highlights are clusters, not continuous airbrushed bands. Put them on the
  upper/front plane; shade far limbs and undersides.
- Preserve a readable one-pixel gap or value break between overlapping gear.

## Color and detail budget

- Keep skin, cloth, leather, metal, hair, and creature hide in distinct hue
  families even when they share a similar value.
- Reserve the brightest value for face, hair, metal edge, and spell accents.
- At gameplay scale a face gets an eye cluster, a mouth mark, and at most one
  extra species feature. Costume detail gets one focal accent per region.
- Test silhouettes against both the editor charcoal background and a mid-value
  field tile.

## Review checklist

1. Readable facing and role at 1x.
2. No exposed seams through the full animation set.
3. Near limbs are clearer/brighter than far limbs.
4. Every material follows a consistent three-value ramp.
5. No borrowed character-specific costume, emblem, or pixel arrangement.
6. Preview and atlas regenerated from source; generator tests pass.
