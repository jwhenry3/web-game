# Specialist editor adapters

## Shared adapter contract

Every adapter accepts the selected definition, serialized field value, a
change callback, and optional navigation callbacks. It emits only stable,
serializable references or configuration owned by gameplay content.

Adapters must provide a useful fallback when a development file API or map
scene is unavailable. A failed preview may show a clear placeholder; it must
not crash the Content workspace.

## Character

Reuse the rig types, defaults, builders, and `rigsApi`. Store only:

- rig ID;
- thumbnail;
- appearance overrides;
- attachment/equipment presentation selections;
- animation-state-to-clip mappings.

Support selecting built-in and saved rigs, creating a new rig through the
existing file API, and opening the full Characters workspace. The inline view
may use a lightweight thumbnail/avatar; detailed bones, parts, models, and
timeline editing stay in the full editor.

NPC schemas embed the character adapter. Abilities may reference a character
animation slot without embedding a full character.

## Effects

Reuse `EffectsDoc`, `VfxProfile`, `fetchEffects`, `saveEffects`,
`EffectProfileForm`, and the existing preview player. Store only the stable
profile/category identifier in gameplay content.

The inline adapter shows effect cards, selection, duplication/creation where
supported, inline profile fields, preview, specialist Save, and Open full
editor. There must be no second VFX schema.

Use effect slots for NPC spawn/ambient/interact/combat/hit/death, POI prompt or
activation, item use/equip/pickup, ability cast/projectile/impact/area, and
status aura/expiration.

## Prefabs

Browse compiled `PREFABS` and authored `ScenePrefabAsset` values using rendered
thumbnails. Filter recommendations from the parent type: NPC, POI, item, or
decoration.

When ContentWorkspace has a map scene, allow creation and full editing through
the existing SceneStore and PrefabEditor. Without one, allow selection of
compiled prefabs and explain that authored prefab editing requires choosing a
map. Store only the prefab ID.

The later map-selector integration loads the selected map's scene through the
existing scene API. It must preserve unsaved scene changes and never write a
scene as a side effect of saving gameplay content.

