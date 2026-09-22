import {
  applyVfxProfileOverrides,
  CATEGORY_COLORS,
  CATEGORY_VFX_PROFILES,
  resetVfxProfiles,
  VFX_CATEGORIES,
  type VfxBurstProfile,
  type VfxCastProfile,
  type VfxCategory,
  type VfxCircleProfile,
  type VfxParticleTexture,
  type VfxProfile,
  type VfxProjectileProfile,
  type VfxStreamProfile,
} from "../../../../wails/frontend/src/vfx/battleVfxProfiles";

export type {
  VfxBurstProfile,
  VfxCastProfile,
  VfxCategory,
  VfxCircleProfile,
  VfxParticleTexture,
  VfxProfile,
  VfxProjectileProfile,
  VfxStreamProfile,
};

/** Mirrors wails/frontend/public/assets/vfx/profiles.json — normalized to
 * complete profiles (the file is a sparse overlay; the editor edits the
 * merged result so compiled-in defaults are visible and tweakable). */
export interface EffectsDoc {
  colors: Record<string, number>;
  profiles: Record<string, VfxProfile>;
}

/** Snapshot of the live profile records as a fresh doc. */
export function liveDoc(): EffectsDoc {
  return {
    colors: Object.fromEntries(VFX_CATEGORIES.map((c) => [c, CATEGORY_COLORS[c]])),
    profiles: Object.fromEntries(
      VFX_CATEGORIES.map((c) => [c, structuredClone(CATEGORY_VFX_PROFILES[c])]),
    ),
  };
}

/** GET /editor-api/effects — throws when the dev server has no profiles.json.
 * The file's sparse overlay is applied to the live records first, then read
 * back — missing fields resolve to the compiled defaults, exactly like the
 * game's boot merge. */
export async function fetchEffects(): Promise<EffectsDoc> {
  const res = await fetch("/editor-api/effects");
  if (!res.ok) throw new Error(`effects fetch failed: ${res.status}`);
  const data = (await res.json()) as { colors?: unknown; profiles?: unknown };
  if (!data || typeof data !== "object" || typeof data.profiles !== "object" || !data.profiles) {
    throw new Error("effects fetch returned an unexpected shape");
  }
  resetVfxProfiles();
  applyVfxProfileOverrides(data);
  return liveDoc();
}

/** POST /editor-api/effects/save — writes the whole profiles.json. */
export async function saveEffects(doc: EffectsDoc): Promise<void> {
  const res = await fetch("/editor-api/effects/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `effects save failed: ${res.status}`);
  }
}

export const numToHex = (n: number): string =>
  `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

export const hexToNum = (hex: string, fallback = 0): number => {
  const v = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(v) ? v : fallback;
};
