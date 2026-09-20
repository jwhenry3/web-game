import { CATEGORY_VFX_PROFILES, type VfxParticleTexture, type VfxProfile } from "./battleVfxProfiles.ts";

const elementalKeys = ["fire", "ice", "thunder", "wind", "earth", "water", "holy", "dark", "poison"] as const;
const supportKeys = ["heal", "buff"] as const;

const hasTexture = (profile: VfxProfile, texture: VfxParticleTexture) =>
  profile.bursts.some((burst) => burst.texture === texture);

for (const key of elementalKeys) {
  const profile = CATEGORY_VFX_PROFILES[key];
  const hasLayeredPalette = profile.palette.length >= 3;
  const hasMixedParticles = new Set(profile.bursts.map((burst) => burst.texture)).size >= 2;
  if (!hasLayeredPalette || !hasMixedParticles) {
    throw new Error(`${key} VFX profile needs layered color and particle-shape variety`);
  }
}

for (const key of supportKeys) {
  const profile = CATEGORY_VFX_PROFILES[key];
  if (!profile.ring || !hasTexture(profile, "spark")) {
    throw new Error(`${key} VFX profile needs a readable ring and spark lift`);
  }
}

