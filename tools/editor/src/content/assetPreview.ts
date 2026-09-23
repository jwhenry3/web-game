/**
 * 3D previews for content assets — builds the same objects the runtime
 * would spawn so selecting an asset in the Content browser shows what it
 * looks like in the scene. Returned previews are disposable and may carry a
 * per-frame `update` (rig locomotion, looping VFX).
 */
import * as THREE from 'three';
import type { ContentDefinition, ContentDocument, ContentValue } from '../../../../wails/frontend/src/content/contentSchema.ts';
import { isAssetReference, isEmbeddedAsset } from '../../../../wails/frontend/src/content/recursiveAssets.ts';
import { instantiatePrefab, PREFAB_BY_ID } from '../../../../wails/frontend/src/three/prefabs.ts';
import type { SceneObject } from '../../../../wails/frontend/src/three/scene3d.ts';
import { DEFAULT_RIGS } from '../../../../wails/frontend/src/three/rig3dDefaults.ts';
import { buildRig, getRig, type RigInstance } from '../../../../wails/frontend/src/three/rigBuilder.ts';
import { buildEnemyRig } from '../../../../wails/frontend/src/three/actors.ts';
import { ENEMY_KIND_BY_NAME, ENEMY_KINDS, type EnemyKind } from '../../../../wails/frontend/src/characters/enemies.ts';
import { npcAppearance, type NpcKind } from '../../../../wails/frontend/src/characters/npcs.ts';
import type { CharacterAppearance } from '../../../../wails/frontend/src/characters/heroes99.ts';
import { disposeObject } from '../../../../wails/frontend/src/three/terrain.ts';
import { WorldVfx } from '../../../../wails/frontend/src/three/vfx3d.ts';
import { CATEGORY_COLORS, CATEGORY_VFX_PROFILES, vfxCategoryForAction, vfxProfilePart, type VfxCategory, type VfxPart, type VfxProfile } from '../../../../wails/frontend/src/vfx/battleVfxProfiles.ts';
import { RIG_ANIM_NAMES, type RigAnimName } from '../../../../wails/frontend/src/three/rig3d.ts';
import { rigClipForAction } from '../../../../wails/frontend/src/editor/skillAnimations.ts';
import { fetchEffects } from '../model/effects.ts';
import type { SceneStore } from './sceneStore.ts';
import { normalizeCharacterAsset } from './CharacterAssetEditor.helpers.ts';
import { prefabReferenceFromValue, effectAssetSpec, effectPartFromValue, itemEquipmentSpec } from './references.ts';
import { attachEquipment, equipmentModel, equipmentMounts } from '../../../../wails/frontend/src/three/equipmentModels.ts';
import { loadRigFile } from '../scene3d/rigsApi.ts';

const DEG = Math.PI / 180;
const VFX_REPLAY_SECONDS = 1.2;
const SPAWN_PREVIEW_MAX = 4;
const SPAWN_PREVIEW_SPACING = 1.7;

export interface AssetPreview {
  root: THREE.Object3D;
  update?: (dt: number, time: number) => void;
  dispose(): void;
}

/** Rebuilds an authored scene prefab as a detached group — same instancing
 * PrefabPreview/SceneView use, without writing into the scene doc. */
function prefabAssetGroup(objects: SceneObject[]): THREE.Group {
  const group = new THREE.Group();
  const instances = new Map<string, THREE.Object3D>();
  for (const node of objects) {
    const object = instantiatePrefab(node.prefab, node.props);
    const { position: p, rotation: r, scale: s } = node.transform;
    object.position.set(p[0], p[1], p[2]);
    object.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    object.scale.set(s[0], s[1], s[2]);
    object.visible = node.visible;
    instances.set(node.id, object);
  }
  for (const node of objects) {
    const object = instances.get(node.id)!;
    ((node.parent && instances.get(node.parent)) || group).add(object);
  }
  return group;
}

/** Resolves a `data.prefab` value to a compiled prefab or an authored scene
 * prefab from the loaded map's store. `props` only apply to compiled defs —
 * authored assets carry their own. */
function prefabObject(id: string, store: SceneStore | null, props: Record<string, unknown> = {}): THREE.Object3D | null {
  if (PREFAB_BY_ID.has(id)) return instantiatePrefab(id, props);
  const asset = store?.getState().doc.prefabs.find(item => item.id === id);
  return asset ? prefabAssetGroup(asset.objects) : null;
}

function prefabPreview(id: string, store: SceneStore | null, props: Record<string, unknown> = {}): AssetPreview | null {
  const root = prefabObject(id, store, props);
  return root ? { root, dispose: () => disposeObject(root) } : null;
}

/** Item record → its procedural model; equipment additionally stages a
 * humanoid mannequin wearing/holding the piece at its slot's bone. */
function itemPreview(definition: ContentDefinition, standalone = false): AssetPreview {
  const spec = itemEquipmentSpec(definition);
  const root = new THREE.Group();
  const model = equipmentModel(spec);
  root.add(model);
  let rig: RigInstance | null = null;
  // Inspecting stages the model next to a mannequin wearing it; world
  // placements show only the model.
  if (!standalone && spec.slot && spec.slot in EQUIPMENT_SLOTS) {
    model.position.x = -1.1;
    rig = buildRig(getRig('humanoid'), { appearance: { clothColor: 'c4' } });
    rig.root.position.x = 1.1;
    attachEquipment(rig.bones, equipmentMounts(spec));
    root.add(rig.root);
  }
  return {
    root,
    update: rig ? (dt, time) => rig!.update(dt, time, false, true) : undefined,
    dispose: () => { rig?.dispose(); disposeObject(root); },
  };
}
const EQUIPMENT_SLOTS: Record<string, true> = { weapon: true, head: true, chest: true, legs: true, hands: true, feet: true, back: true };

/** A character value (`{rigId, appearance, …}`) as a live rig. Saved rig
 * files win over compiled defaults so custom rigs preview correctly. */
async function characterPreview(value: ContentValue | undefined): Promise<AssetPreview | null> {
  const character = normalizeCharacterAsset(value);
  if (!character.rigId && !Object.keys(character.appearance).length) return null;
  const saved = character.rigId ? await loadRigFile(character.rigId).catch(() => null) : null;
  const doc = saved ?? (character.rigId ? DEFAULT_RIGS[character.rigId] : undefined) ?? DEFAULT_RIGS.humanoid ?? Object.values(DEFAULT_RIGS)[0];
  if (!doc) return null;
  const appearance = Object.fromEntries(Object.entries(character.appearance).map(([key, v]) => [key, String(v)]));
  const inst = buildRig(doc, { appearance });
  return { root: inst.root, update: (dt, time) => inst.update(dt, time, false, true), dispose: () => inst.dispose() };
}

/** Looping playback of a single effect part — an effect asset is one stage
 * of the sequence, so the preview shows only that segment (never the
 * category's combined profile):
 *  - cast: a rig holds the cast pose with the channel running continuously
 *  - projectile: the shot flies between two anchor points on repeat
 *  - impact / area: the one-shot burst / ground effect replays at a point */
async function effectPreview(spec: { category: VfxCategory; part: VfxPart } | null): Promise<AssetPreview | null> {
  if (!spec) return null;
  const fxDoc = await fetchEffects().catch(() => null);
  const profile = fxDoc?.profiles[spec.category] ?? CATEGORY_VFX_PROFILES[spec.category];
  if (!profile) return null;
  const slice = vfxProfilePart(profile, spec.part);

  const root = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 40),
    new THREE.MeshStandardMaterial({ color: 0x22303e, roughness: 1 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  disc.receiveShadow = true;
  root.add(disc);
  const vfx = new WorldVfx();
  root.add(vfx.group);

  let rig: RigInstance | null = null;
  let castStop: (() => void) | null = null;
  let elapsed = VFX_REPLAY_SECONDS; // fire on the first frame

  if (spec.part === 'cast') {
    const humanoid = DEFAULT_RIGS.humanoid;
    if (humanoid) {
      rig = buildRig(humanoid, { appearance: { clothColor: 'c4' } });
      rig.root.position.set(0, 0, 0);
      root.add(rig.root);
      rig.holdClip('cast');
    }
    castStop = vfx.startCast(profile.cast, rig?.root ?? root);
  }

  const target = new THREE.Vector3(spec.part === 'projectile' ? ABILITY_TARGET_X : 0, spec.part === 'projectile' ? 0.9 : 0.1, 0);
  const from = new THREE.Vector3(ABILITY_ACTOR_X, 0.9, 0);
  return {
    root,
    update: (dt, time) => {
      elapsed += dt;
      if (spec.part !== 'cast' && elapsed >= VFX_REPLAY_SECONDS) {
        elapsed = 0;
        vfx.playProfile(slice, target, spec.part === 'projectile' ? from : undefined);
      }
      vfx.update(dt);
      rig?.update(dt, time, false, true);
    },
    dispose: () => { castStop?.(); rig?.dispose(); vfx.dispose(); disposeObject(root); },
  };
}

/** Fallback marker for an effect-type asset with no profile bound yet. */
function effectPlaceholder(): AssetPreview {
  const color = 0xe6b66d;
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 20, 14),
    new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 1.2, roughness: 0.35 }),
  );
  orb.position.y = 1.1;
  return { root: orb, dispose: () => disposeObject(orb) };
}

function composite(previews: AssetPreview[]): AssetPreview {
  const root = new THREE.Group();
  previews.forEach((p, i) => {
    p.root.position.set((i - (previews.length - 1) / 2) * SPAWN_PREVIEW_SPACING, 0, 0);
    root.add(p.root);
  });
  return {
    root,
    update: (dt, time) => previews.forEach(p => p.update?.(dt, time)),
    dispose: () => previews.forEach(p => p.dispose()),
  };
}

/** Slot values (`assetRef` | `embedded` | plain id) → a definition. */
function resolveSlot(value: ContentValue | undefined, doc: ContentDocument): ContentDefinition | undefined {
  if (isEmbeddedAsset(value)) return value.definition;
  const id = isAssetReference(value) ? value.id : typeof value === 'string' ? value : '';
  return id ? doc.definitions.find(item => item.id === id) : undefined;
}

function npcPreviewSlots(entries: ContentValue | undefined, doc: ContentDocument): ContentDefinition[] {
  if (!Array.isArray(entries)) return [];
  const out: ContentDefinition[] = [];
  for (const entry of entries.slice(0, SPAWN_PREVIEW_MAX)) {
    const npc = resolveSlot(entry && typeof entry === 'object' ? (entry as Record<string, ContentValue>).npc : undefined, doc);
    if (npc) out.push(npc);
  }
  return out;
}

/** NPCs with no authored character or prefab still have a runtime body —
 * combat kinds render through the enemy rig library (actors.ts
 * buildEnemyRig) and service townsfolk use the shared humanoid doll
 * (WorldRenderer job masters). Mirrors that so selecting any NPC stages
 * what the world would spawn. */
function npcFallbackPreview(definition: ContentDefinition, overrides?: Record<string, ContentValue>): AssetPreview {
  const legacy = String(definition.data.legacyKind ?? '');
  const faction = String(definition.data.faction ?? '');
  const service = legacy === 'npc_service' || faction === 'job_master' || faction === 'quest_giver';
  const kind = service ? undefined
    : ENEMY_KINDS.includes(definition.id as EnemyKind)
      ? (definition.id as EnemyKind)
      : ENEMY_KIND_BY_NAME[definition.name];
  const npcKind: NpcKind = faction === 'job_master' || definition.id === 'job_master' ? 'job_master' : 'npc';
  // Overrides are ContentValues — keep structured entries (shape) and
  // string the rest, matching how doll presets compose.
  const patch = overrides
    ? Object.fromEntries(Object.entries(overrides).map(([key, v]) => [key, v && typeof v === 'object' ? v : String(v)]))
    : undefined;
  const inst = kind
    ? buildEnemyRig(kind, patch as Partial<CharacterAppearance>).rig
    : buildRig(getRig('humanoid'), { appearance: { ...npcAppearance(npcKind), ...patch } });
  return { root: inst.root, update: (dt, time) => inst.update(dt, time, false, true), dispose: () => inst.dispose() };
}

// --- ability preview ------------------------------------------------------------

const ABILITY_ACTOR_X = -1.7;
const ABILITY_TARGET_X = 1.7;
const ABILITY_REPLAY_GAP = 1.4; // floor when the ability has no cooldown

/** Text on a canvas texture, shown as a billboard sprite. */
function textSprite(text: string, css: string, size = 1): { sprite: THREE.Sprite; dispose(): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(8,10,14,.9)';
  ctx.strokeText(text, 80, 24);
  ctx.fillStyle = css;
  ctx.fillText(text, 80, 24);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7 * size, 0.5 * size, 1);
  return { sprite, dispose: () => { texture.dispose(); material.dispose(); } };
}

/** Thin cast bar billboard — fill grows over the channel, label shows the
 * ability's cast time. Redrawn per frame only while channeling. */
function castBar(): { sprite: THREE.Sprite; draw(fill: number, seconds: number): void; dispose(): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.15, 0.19, 1);
  const draw = (fill: number, seconds: number) => {
    ctx.clearRect(0, 0, 96, 16);
    ctx.fillStyle = 'rgba(10,14,20,.85)';
    ctx.fillRect(0, 0, 96, 16);
    ctx.fillStyle = '#e8b45a';
    ctx.fillRect(1, 1, 94 * THREE.MathUtils.clamp(fill, 0, 1), 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${seconds.toFixed(1)}s`, 48, 9);
    texture.needsUpdate = true;
  };
  draw(0, 0);
  return { sprite, draw, dispose: () => { texture.dispose(); material.dispose(); } };
}

interface AbilityRoll { amount: number; heal: boolean }

/** Example numbers from the ability's effect list — `power` is the fallback
 * when no per-effect override is set. Status kinds surface as name tags. */
function abilityRolls(data: Record<string, ContentValue>): { rolls: AbilityRoll[]; statuses: string[] } {
  const power = Number(data.power) || 0;
  const rolls: AbilityRoll[] = [];
  const statuses: string[] = [];
  const entries = Array.isArray(data.effects) ? data.effects : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const effect = entry as Record<string, ContentValue>;
    const amount = Math.round(Number(effect.power) || power);
    if (effect.kind === 'damage' && amount > 0) rolls.push({ amount, heal: false });
    else if (effect.kind === 'heal' && amount > 0) rolls.push({ amount, heal: true });
    else if (effect.kind === 'status') {
      const status = effect.status;
      const kind = status && typeof status === 'object' ? (status as Record<string, ContentValue>).kind : undefined;
      if (typeof kind === 'string' && kind) statuses.push(kind);
    }
  }
  if (!rolls.length && power > 0) {
    rolls.push({ amount: Math.round(power), heal: data.target === 'self' || data.target === 'ally' });
  }
  return { rolls, statuses };
}

/** Source→target ability preview mirroring the Effects tab: a caster rig
 * channels `castTimeMs` under a cast bar + intent ribbon, then the bound
 * projectile/impact/area profiles resolve on the target rig with floating
 * example numbers. Loops forever. */
async function abilityPreview(definition: ContentDefinition, doc: ContentDocument): Promise<AssetPreview | null> {
  const data = definition.data;
  const { rolls, statuses } = abilityRolls(data);
  const healFlag = rolls.some(roll => roll.heal);
  // Each slot binds one per-part effect asset; a bound asset contributes its
  // category's segment for that slot. Legacy category strings and unbound
  // slots fall back to the runtime-derived category — the same resolution
  // the game performs on the action id.
  const castRef = effectPartFromValue(data.castEffect, doc, 'cast');
  const projRef = effectPartFromValue(data.projectileEffect, doc, 'projectile');
  const impactRef = effectPartFromValue(data.impactEffect, doc, 'impact');
  const areaRef = effectPartFromValue(data.areaEffect, doc, 'area');
  const derived = vfxCategoryForAction(definition.id, healFlag ? 1 : 0);

  // Live profiles.json overlays win when the dev server is up; compiled
  // defaults otherwise (CATEGORY_VFX_PROFILES already reflect the boot merge).
  const fxDoc = await fetchEffects().catch(() => null);
  const profileFor = (cat: VfxCategory | ''): VfxProfile | undefined =>
    cat ? fxDoc?.profiles[cat] ?? CATEGORY_VFX_PROFILES[cat] : undefined;
  const primary = impactRef?.category ?? projRef?.category ?? castRef?.category ?? areaRef?.category ?? derived;
  const castProfile = profileFor(castRef?.category ?? derived)?.cast;
  const impactProfile = vfxProfilePart(profileFor(impactRef?.category ?? derived)!, 'impact');
  const fireProfile: VfxProfile = {
    ...impactProfile,
    projectile: profileFor(projRef?.category ?? derived)?.projectile,
  };
  const areaProfile = vfxProfilePart(profileFor(areaRef?.category ?? derived)!, 'area');
  const hasArea = !!(areaProfile.circle || areaProfile.stream);

  // The caster's clip: authored `data.animation` wins; otherwise derive the
  // same clip the world would play for this action id.
  const animName = (RIG_ANIM_NAMES as readonly string[]).includes(String(data.animation ?? ''))
    ? (data.animation as RigAnimName)
    : rigClipForAction(definition.id, healFlag ? 1 : 0);

  const castSec = Math.max(0, Number(data.castTimeMs) || 0) / 1000;
  const cost = Number(data.cost) || 0;
  const selfTarget = data.target === 'self' || data.target === 'ally';
  const color = CATEGORY_COLORS[primary] ?? 0xffffff;
  // Reuse pace follows the ability's cooldown, capped so long recasts stay
  // watchable instead of stalling the preview.
  const replayGap = THREE.MathUtils.clamp((Number(data.cooldown) || 0) / 1000, 0.9, 3.5);

  const root = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshStandardMaterial({ color: 0x22303e, roughness: 1 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  disc.receiveShadow = true;
  root.add(disc);

  const rigs: RigInstance[] = [];
  let caster: THREE.Object3D = root;
  let targetObj: THREE.Object3D = root;
  const humanoid = DEFAULT_RIGS.humanoid;
  if (humanoid) {
    const actor = buildRig(humanoid, { appearance: { clothColor: 'c4' } });
    actor.root.position.set(ABILITY_ACTOR_X, 0, 0);
    actor.root.rotation.y = Math.PI / 2;
    const target = buildRig(humanoid, { appearance: { clothColor: 'c8' } });
    target.root.position.set(ABILITY_TARGET_X, 0, 0);
    target.root.rotation.y = -Math.PI / 2;
    root.add(actor.root, target.root);
    rigs.push(actor, target);
    caster = actor.root;
    targetObj = selfTarget ? actor.root : target.root;
  }

  const vfx = new WorldVfx();
  root.add(vfx.group);

  const bar = castBar();
  bar.sprite.position.set(0, 2.1, 0);
  bar.sprite.visible = false;
  caster.add(bar.sprite);

  interface Float { sprite: THREE.Sprite; t: number; dispose(): void }
  const floats: Float[] = [];
  const spawnText = (x: number, y: number, text: string, css: string, size = 1) => {
    const { sprite, dispose } = textSprite(text, css, size);
    sprite.position.set(x, y, 0);
    floats.push({ sprite, t: 0, dispose });
    root.add(sprite);
  };
  const spawnRolls = () => {
    const x = selfTarget ? ABILITY_ACTOR_X : ABILITY_TARGET_X;
    rolls.forEach((roll, i) =>
      spawnText(x, 1.55 + i * 0.42, roll.heal ? `+${roll.amount}` : `${roll.amount}`, roll.heal ? '#7fe08a' : '#ffd27f'));
    statuses.forEach((status, i) =>
      spawnText(x, 1.55 + (rolls.length + i) * 0.42, status, '#e6b66d', 0.62));
  };

  let phase: 'cast' | 'recover' = 'cast';
  let t = 0;
  let castStop: (() => void) | null = null;
  let tetherStop: (() => void) | null = null;
  // Seconds until the hit lands — numbers and the flinch clip wait for the
  // projectile (or the swing's contact frame for melee) instead of popping
  // the instant the swing starts.
  let impactIn = -1;
  const casterRig = rigs[0];
  const targetRig = selfTarget ? rigs[0] : rigs[1];

  const fire = () => {
    phase = 'recover';
    t = 0;
    castStop?.();
    castStop = null;
    tetherStop?.();
    tetherStop = null;
    bar.sprite.visible = false;
    casterRig?.holdClip(null);
    casterRig?.playClip(animName);
    const to = new THREE.Vector3(selfTarget ? ABILITY_ACTOR_X : ABILITY_TARGET_X, 0.9, 0);
    const from = new THREE.Vector3(ABILITY_ACTOR_X, 0.9, 0);
    if (castSec <= 0 && !selfTarget) vfx.flashTether(caster, targetObj, color);
    vfx.playProfile(fireProfile, to, selfTarget ? undefined : from);
    if (hasArea) vfx.playProfile(areaProfile, to);
    impactIn = selfTarget ? 0.3 : fireProfile.projectile ? (fireProfile.projectile.duration ?? 220) / 1000 + 0.1 : 0.26;
  };
  const beginCast = () => {
    phase = 'cast';
    t = 0;
    if (castSec > 0) {
      casterRig?.holdClip('cast');
      castStop = vfx.startCast(castProfile, caster);
      if (!selfTarget) tetherStop = vfx.startTether(caster, targetObj, color);
      bar.sprite.visible = true;
      if (cost > 0) spawnText(ABILITY_ACTOR_X, 1.85, `${cost} MP`, '#9db8ff', 0.68);
    } else {
      fire();
    }
  };
  beginCast();

  return {
    root,
    update: (dt, time) => {
      vfx.update(dt);
      for (const rig of rigs) rig.update(dt, time, false, true);
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.t += dt;
        f.sprite.position.y += dt * 0.85;
        f.sprite.material.opacity = Math.max(0, 1 - f.t / 0.95);
        if (f.t > 0.95) { root.remove(f.sprite); f.dispose(); floats.splice(i, 1); }
      }
      t += dt;
      if (impactIn >= 0) {
        impactIn -= dt;
        if (impactIn < 0) {
          if (!selfTarget) targetRig?.playClip('hit');
          spawnRolls();
        }
      }
      if (phase === 'cast') {
        bar.draw(castSec > 0 ? t / castSec : 1, castSec);
        if (t >= castSec) fire();
      } else if (t >= Math.max(ABILITY_REPLAY_GAP, replayGap)) {
        beginCast();
      }
    },
    dispose: () => {
      castStop?.();
      tetherStop?.();
      bar.dispose();
      for (const f of floats) f.dispose();
      vfx.dispose();
      for (const rig of rigs) rig.dispose();
      disposeObject(root);
    },
  };
}

/**
 * Builds the 3D representation for a definition, or null when the type has
 * none (dialogue, quest, recipe, …). Async because rigs may load from disk.
 */
export async function buildAssetPreview(
  definition: ContentDefinition,
  doc: ContentDocument,
  store: SceneStore | null,
  depth = 0,
  opts: { standalone?: boolean } = {},
): Promise<AssetPreview | null> {
  const data = definition.data;
  switch (definition.type) {
    case 'character':
      return characterPreview(data.character);
    case 'npc': {
      const linked = resolveSlot(data.character, doc);
      const charValue = linked?.type === 'character' ? linked.data.character : data.character;
      const character = normalizeCharacterAsset(charValue);
      // An explicit rig id means the character value fully owns the look.
      if (character.rigId) {
        const rig = await characterPreview(charValue);
        if (rig) return rig;
      }
      // Appearance overrides without a rig belong on the NPC's natural
      // body (its enemy kind or service doll) — building a bare humanoid
      // here would replace the goblin/wolf with a villager.
      if (Object.keys(character.appearance).length)
        return npcFallbackPreview(definition, character.appearance);
      const id = prefabReferenceFromValue(data.prefab);
      const prefab = id ? prefabPreview(id, store) : null;
      return prefab ?? npcFallbackPreview(definition);
    }
    case 'item':
      // Item presentation is the record's own 3D model (data.model or the
      // slot-derived default), not a prefab.
      return itemPreview(definition, opts.standalone);
    case 'poi':
    case 'prefab': {
      const id = prefabReferenceFromValue(data.prefab);
      const preview = id ? prefabPreview(id, store) : null;
      if (preview) return preview;
      if (definition.type === 'poi')
        return prefabPreview(data.storage ? 'storage' : 'poi', store);
      return null;
    }
    case 'effect': {
      const spec = effectAssetSpec(definition);
      return (spec.category ? await effectPreview({ category: spec.category, part: spec.part }) : null) ?? effectPlaceholder();
    }
    case 'ability':
      return abilityPreview(definition, doc);
    case 'statusEffect': {
      for (const [key, part] of [['auraEffect', 'cast'], ['expirationEffect', 'impact']] as const) {
        const preview = await effectPreview(effectPartFromValue(data[key], doc, part));
        if (preview) return preview;
      }
      return null;
    }
    case 'spawnSet': {
      if (depth > 0) return null;
      const previews = (await Promise.all(
        npcPreviewSlots(data.entries, doc).map(npc => buildAssetPreview(npc, doc, store, depth + 1)),
      )).filter((p): p is AssetPreview => !!p);
      return previews.length ? composite(previews) : null;
    }
    default:
      return null;
  }
}

/**
 * Mounts the selected definition's 3D preview on a SceneView's `stage`:
 * anchors to the camera pivot, frames the object, and drives `update` via
 * `view.onFrame`. Returns a cleanup that restores the view hooks and clears
 * the stage. Async builders are cancelled if this unmounts first.
 */
export function mountAssetPreview(
  view: { stage: THREE.Group; getPivot(): THREE.Vector3; groundHeight(x: number, z: number): number; frameObject(o: THREE.Object3D, d?: number): void; onFrame: (dt: number, time: number) => void; onMapLoaded: () => void },
  definition: ContentDefinition | null,
  doc: ContentDocument,
  store: SceneStore | null,
): () => void {
  const stage = view.stage;
  let cancelled = false;
  let preview: AssetPreview | null = null;
  const anchor = () => {
    const p = view.getPivot();
    stage.position.set(p.x, view.groundHeight(p.x, p.z), p.z);
  };
  const frame = () => {
    if (!preview) return;
    const box = new THREE.Box3().setFromObject(preview.root);
    const size = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length();
    view.frameObject(preview.root, THREE.MathUtils.clamp(size * 1.6 + 0.8, 2.4, 42));
  };
  void (async () => {
    if (!definition) return;
    const built = await buildAssetPreview(definition, doc, store);
    if (cancelled) { built?.dispose(); return; }
    if (!built) return;
    preview = built;
    anchor();
    stage.add(built.root);
    // Recentre horizontally: frameObject moves the camera pivot to the
    // bounds centre, so without this each remount re-anchors at the offset
    // centre and the preview walks backwards a step per inspector edit.
    const box = new THREE.Box3().setFromObject(built.root);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      built.root.position.x -= center.x - stage.position.x;
      built.root.position.z -= center.z - stage.position.z;
    }
    view.onFrame = (dt, time) => built.update?.(dt, time);
    view.onMapLoaded = () => { anchor(); frame(); };
    frame();
  })();
  return () => {
    cancelled = true;
    view.onFrame = () => {};
    view.onMapLoaded = () => {};
    if (preview) { stage.remove(preview.root); preview.dispose(); }
    while (stage.children.length) { const c = stage.children[0]; stage.remove(c); disposeObject(c); }
    stage.position.set(0, 0, 0);
  };
}
