# Recursive MMORPG content editor strategy

## Purpose

The Game Designer should provide one Unity-style authoring workflow for the
content that makes up an MMORPG. Designers must be able to move naturally
between an NPC, its character rig, scene prefab, dialogue, vendor, quests,
loot, abilities, status effects, and VFX without copying identifiers between
unrelated forms or leaving the current context.

The editor already has working top-level Prefabs, Terrain, Characters,
Effects, and Content workspaces. This project embeds the existing character,
effect, and prefab management capabilities into Content and makes content an
asset graph with recursive navigation.

This document is the implementation contract for agents continuing the work.
Inspect the current working tree before editing: this is an active, dirty
workspace with changes from several tasks. Preserve all existing changes and
never reset or restore files wholesale.

## Product principles

1. **Assets, not forms.** NPCs, POIs, characters, effects, prefabs, dialogue,
   quests, vendors, loot tables, abilities, statuses, recipes, and spawn sets
   are assets with stable IDs, thumbnails, validation, and references.
2. **Edit linked assets in context.** A reference field displays an asset card
   with Open, Create and link, Embed, Replace, and Clear actions. Open pushes
   the target onto an inspector navigation stack instead of changing tabs.
3. **Preserve reuse.** A shared reference updates every consumer. Embedding is
   an explicit choice for content owned by one parent.
4. **Use existing specialist editors.** Character rigs, VFX profiles, and
   scene prefabs keep their current file formats, previews, save APIs, and
   detailed tools. Content adapters compose those tools; they do not create a
   second incompatible authoring system.
5. **Schema-driven inspectors.** Content types and behavior extensions declare
   their fields. Generic UI renders them. Adding an NPC feature must not
   require a new branch in the main Inspector component.
6. **Make recursion visible.** Breadcrumbs, asset type icons, ownership badges,
   backlink counts, and cycle errors must explain where the designer is and
   why a link is invalid.
7. **Keep drafts recoverable.** Content continues to autosave locally and can
   import/export JSON. Authenticated server Save/Load remains the durable path.

## Existing system and files

The unified content document is defined in:

- `wails/frontend/src/content/contentSchema.ts`
- `wails/frontend/src/content/contentRegistry.ts`
- `tools/editor/src/content/ContentWorkspace.tsx`
- `tools/editor/src/content/content.css`
- `tools/editor/src/content/storage.ts`

Server persistence already accepts the `gameplay` catalog through:

- `GET /api/admin/content/gameplay`
- `PUT /api/admin/content/gameplay`
- `internal/game/content_store.go`
- `internal/proxy/admin_content.go`

Existing specialist implementations to reuse:

- Character rigs: `tools/editor/src/ui/SceneCharacters.tsx`,
  `tools/editor/src/scene3d/rigsApi.ts`, and
  `wails/frontend/src/three/rig3d*.ts`.
- Effects: `tools/editor/src/ui/SceneEffects.tsx`,
  `tools/editor/src/ui/EffectProfileForm.tsx`,
  `tools/editor/src/model/effects.ts`, and
  `wails/frontend/src/vfx/battleVfxProfiles.ts`.
- Prefabs: `tools/editor/src/ui/PrefabEditor.tsx`,
  `tools/editor/src/scene3d/store.ts`,
  `wails/frontend/src/three/prefabs.ts`, and
  `wails/frontend/src/three/scene3d.ts`.

The following files were partially created immediately before this strategy
was documented. Treat them as untrusted work in progress: read their tests and
implementation, finish or revise them, and do not duplicate their names.

- `wails/frontend/src/content/recursiveAssets.ts`
- `wails/frontend/src/content/recursiveAssets.spec.ts`
- `tools/editor/src/content/recursiveNavigation.ts`
- `tools/editor/src/content/recursiveNavigation.spec.ts`
- `tools/editor/src/content/CharacterAssetEditor.tsx`
- `tools/editor/src/content/CharacterAssetEditor.css`
- `tools/editor/src/content/CharacterAssetEditor.helpers.ts`
- `tools/editor/src/content/CharacterAssetEditor.helpers.spec.ts`
- `tools/editor/src/content/assetEditors.spec.ts`

At the time of interruption, the recursive graph helpers and character adapter
had code, but full integration had not begun. Effect and prefab adapter files
may be absent or partially written. Run typecheck before assuming any partial
file compiles.

## Asset graph data model

Keep `ContentDocument.definitions` as the root collection. Support two explicit
slot values within `ContentValue`:

```ts
interface AssetReferenceValue {
  $kind: "assetRef";
  id: string;
}

interface EmbeddedAssetValue {
  $kind: "embedded";
  definition: ContentDefinition;
}
```

A reference points to a reusable root definition. An embedded value owns a
complete child definition under its parent. Do not serialize UI state,
breadcrumbs, previews, caches, resolved objects, or duplicate copies of a
referenced definition.

Legacy string reference fields must continue to load. The graph builder may
interpret strings as references when the schema says a field is a legacy
`reference`. Newly written recursive fields should use the marker objects.

### Schema field contract

Extend the inspector field registry with asset-aware fields:

```ts
type InspectorFieldType =
  | existingFieldTypes
  | "assetSlot"
  | "embeddedAsset"
  | "customEditor";

interface InspectorField {
  // existing properties
  referenceTypes?: ContentType[];
  slotMode?: "reference" | "embedded" | "either";
  editorId?: string;
  recursive?: boolean;
}
```

`assetSlot` provides reference/embedded choices. `embeddedAsset` always owns
the child. `customEditor` delegates to an editor adapter registry. The main
Inspector must not import every specialist editor and grow a type switch.

### Custom editor registry

Create an editor-side registry, for example
`tools/editor/src/content/contentEditorRegistry.tsx`:

```ts
interface ContentEditorContext {
  definition: ContentDefinition;
  field: InspectorField;
  value: ContentValue | undefined;
  document: ContentDocument;
  updateValue(value: ContentValue): void;
  openAsset(id: string): void;
  createAndLink(type: ContentType): void;
}

type ContentFieldEditor = React.ComponentType<ContentEditorContext>;

registerContentFieldEditor(id: string, editor: ContentFieldEditor): () => void;
getContentFieldEditor(id: string): ContentFieldEditor | undefined;
```

Register adapters during editor bootstrap or module initialization:

- `character` → `CharacterAssetEditor`
- `effect` → `EffectAssetEditor`
- `prefab` → `PrefabAssetEditor`

The generic Field renderer only knows how to look up `field.editorId`. It must
not know the adapter components by name.

## Recursive navigation

ContentWorkspace owns a navigation stack:

```ts
interface AssetNavigationEntry {
  key: string;               // root ID or stable embedded path
  label: string;
  definition: ContentDefinition;
  ownerPath?: string;        // present for embedded children
}
```

Behavior:

- Clicking a card starts a new stack with that root asset.
- Opening a linked asset pushes it.
- Opening an embedded child pushes it using its stable owner path.
- Breadcrumb clicks truncate the stack to that entry.
- Backspace or an explicit Back button pops one entry when an input is not
  focused.
- Opening an asset already in the stack truncates to its prior occurrence.
- Renaming an ID updates root references atomically or rejects the rename with
  a clear message. Never leave silent broken links.
- Browser selection and filters remain stable while drilling into references.

Display breadcrumbs above the inspector, for example:

`Guard Captain / Character / Humanoid Rig`

Each crumb includes the asset type icon. Embedded children display an Owned
badge; referenced assets display Shared and their backlink count.

## Graph validation

Build a graph containing root and embedded definitions. Every edge records
`from`, `to`, source `path`, and whether it is embedded.

Validation must report:

- missing referenced assets;
- duplicate root IDs;
- duplicate embedded sibling IDs when their owner path would collide;
- references to a disallowed content type;
- reference or embedded cycles;
- excessive nesting depth (limit 16 for editor safety);
- deleting an asset that still has backlinks;
- embedded definitions that are also present as roots;
- specialist references to missing rig, effect, or prefab files as warnings.

Cycle messages must show a useful path such as
`npc.guard → dialogue.intro → npc.guard`. Do not silently cut cycles during
save. Disable Save server while graph errors exist.

## Content schemas and intuitive composition

Add reusable slots to the existing schemas. Names may differ slightly to fit
the current registry, but preserve these relationships:

### NPC

- Character editor: rig, appearance, equipment presentation, animation map.
- Scene prefab editor/reference.
- Spawn set and faction/stat fields.
- Dialogue, vendor, quest, and loot-table slots.
- Ambient, interaction, combat, hit, death, and spawn effect slots.
- Behavior rule list using registered triggers, conditions, and actions.

### Point of interest

- Scene prefab editor/reference.
- Interaction radius and map placement metadata.
- Prompt, interaction, activation, and completion effect slots.
- Dialogue, vendor, quest, teleport destination, storage, and custom behavior
  slots.

### Item

- Scene/world prefab editor/reference.
- Inventory thumbnail and optional character attachment metadata.
- Use, equip, impact, and world-pickup effect slots.
- Recipe, ability, status, and loot relationships.

### Ability and status effect

- Cast, projectile, impact, area, aura, and expiration effect slots.
- Character animation reference.
- Composable condition/action lists for effect application.

### Dialogue, quest, vendor, recipe, loot, and spawn set

Their list rows should use asset slots instead of raw select boxes. A designer
must be able to create the required item, NPC, dialogue, or reward asset from
inside the row and return through breadcrumbs.

### Behavior extensions

Populate extension field schemas for built-in actions rather than using a
single opaque parameter input. Examples:

- `showDialogue` → dialogue asset slot
- `startQuest` / `advanceQuest` → quest slot and optional objective
- `giveItem` / `takeItem` → item slot and quantity
- `openVendor` → vendor slot
- `teleport` → map and destination fields
- `spawnSet` → spawn-set slot
- `playEffect` → effect custom editor/slot
- `applyStatus` → status-effect slot

Third-party extensions use the same registration functions and field renderer.

## Character adapter

`CharacterAssetEditor` should receive a content value and emit a serializable
configuration containing at least:

- `rigId`;
- thumbnail;
- appearance overrides;
- attachment/equipment presentation references;
- animation-state-to-clip mappings.

It must list built-in and saved rigs through `rigsApi`, create a new rig using
the existing `Rig3DDoc` helpers, and provide an Open full editor action. Reuse
the existing rig file API. Never copy the entire rig into a content document.

A lightweight thumbnail or generated avatar is acceptable inside the inspector;
the full Scene Characters mode remains the detailed bone/model/timeline editor.

## Effect adapter

`EffectAssetEditor` should use the current `EffectsDoc`, `VfxProfile`,
`fetchEffects`, `saveEffects`, `EffectProfileForm`, and preview conventions.
It should:

- show visual effect category cards;
- select an existing profile reference;
- duplicate/create a profile when supported by the current effect document;
- edit the selected profile inline through `EffectProfileForm`;
- save through the existing effect API;
- provide Open full editor navigation;
- emit only the stable effect/profile identifier into content.

Do not introduce a second VFX schema.

## Prefab adapter

`PrefabAssetEditor` should browse both compiled `PREFABS` and authored
`ScenePrefabAsset` entries with rendered thumbnails. It should:

- filter suggested assets by parent definition type (`npc`, `poi`, `item`);
- select a built-in or authored prefab ID;
- create an authored prefab from a compatible built-in definition;
- open the existing full `PrefabEditor` when a scene store is available;
- work in a read/select-only built-in mode when no map scene is loaded;
- emit only the stable prefab ID into content.

ContentWorkspace should eventually offer a map selector and load that map's
scene document so authored prefabs can be edited and saved from Content. Until
then, the adapter must degrade gracefully rather than blocking the workspace.

## ContentWorkspace layout

Retain the existing dark Unity-inspired shell and thumbnail browser. Add:

1. Breadcrumb bar above the inspector.
2. Inspector Back button and keyboard navigation.
3. Asset slot cards with thumbnail, type, name, Shared/Owned badge, Open,
   Replace, Embed/Create, and Clear actions.
4. A narrow relationship panel or foldout listing outgoing links and backlinks.
5. Inline specialist editors in collapsible sections so the inspector remains
   scannable.
6. Search results that can include referenced assets without changing the
   current breadcrumb context.
7. Validation rows that open the offending asset and field when clicked.

Avoid displaying raw JSON or requiring designers to know internal IDs during
ordinary workflows.

## Persistence and migrations

- Keep `CONTENT_DOCUMENT_VERSION` explicit. If serialization changes require
  migration, increment it and normalize older documents without losing data.
- `normalizeContentDocument` must recursively normalize embedded definitions
  and retain recognized marker values.
- Local recovery key remains `mmorpg-content:v1` unless the document version is
  incremented deliberately.
- Server saves continue using `/api/admin/content/gameplay` and the existing
  admin bearer token used by scene saves.
- Rig, VFX, and scene-prefab specialist assets continue using their existing
  persistence endpoints and files. A content save must not overwrite those
  assets implicitly.
- If an inline specialist editor has unsaved changes, show that state locally
  and require its own Save before navigating away or saving the content graph.

## Implementation phases

### Phase 1: finish and verify recursive core

Owners should complete `recursiveAssets.ts` and `recursiveNavigation.ts` first.
Tests must cover type guards, missing references, embedded edges, duplicate
edges, cycle detection, stable embedded keys, breadcrumb push/truncate/pop, and
depth limits. Then integrate graph validation with `validateContentDocument`.

### Phase 2: custom editor registry and generic asset slots

Add the editor-side component registry and implement generic `AssetSlotEditor`.
Update ContentWorkspace Field/ListEditor/BehaviorEditor to consume it. Add
breadcrumbs and immutable update helpers for embedded definitions. No specialist
editor imports belong in the generic Field implementation.

### Phase 3: character, effect, and prefab adapters

Finish each reusable adapter independently with pure helper tests. Register
them by ID. Add schema fields to NPC, POI, item, ability, and status assets.
Verify each adapter both with available server APIs and with its offline/fallback
state.

### Phase 4: relationship UX and destructive-operation guards

Add backlinks/outgoing links, validation navigation, rename propagation, and
delete protection. Deleting a referenced root requires the designer to unlink
or explicitly replace its consumers; never silently null many fields.

### Phase 5: visual and end-to-end verification

Run the editor against the game server. Exercise this chain:

1. Create an NPC.
2. Create or select its character rig inline.
3. Select or create its scene prefab.
4. Create an interaction effect.
5. Create and link a dialogue from a behavior action.
6. Open every child through breadcrumbs and return to the NPC.
7. Save, reload from server, and verify all links and specialist assets.
8. Attempt a cycle and a missing reference; verify Save server is blocked and
   the error opens the exact field.

## Required checks

Use fresh output before claiming completion:

```powershell
npx tsx wails/frontend/src/content/contentSchema.spec.ts
npx tsx wails/frontend/src/content/recursiveAssets.spec.ts
npx tsx tools/editor/src/content/recursiveNavigation.spec.ts
npx tsx tools/editor/src/content/CharacterAssetEditor.helpers.spec.ts
npx tsx tools/editor/src/content/assetEditors.spec.ts
npm run typecheck --prefix tools/editor
npm run build --prefix tools/editor
npm run test:3d --prefix wails/frontend
npm run build --prefix wails/frontend
go test ./...
git diff --check
```

Add focused tests for every new graph mutation helper and adapter selection
helper. Do not add shallow tests that merely reproduce implementation branches.

Finally inspect the live editor at `http://localhost:35215/?ws=content` at a
desktop viewport. Verify thumbnails, scroll behavior, breadcrumb clarity,
collapsed specialist sections, empty states, and the absence of console errors.

## Agent coordination and file ownership

When parallelizing, use these non-overlapping ownership areas:

- Core graph/schema agent: `wails/frontend/src/content/*`.
- Navigation/generic UI agent: `tools/editor/src/content/ContentWorkspace.tsx`,
  `content.css`, navigation and editor registry files.
- Character adapter agent: `CharacterAssetEditor*` only.
- Effect/prefab adapter agent: `EffectAssetEditor*`, `PrefabAssetEditor*` only.
- Integration owner: registry calls, schema field registration, documentation,
  browser verification, and final cross-project test pass.

Agents must communicate exported APIs before the integration owner edits shared
files. No agent should run cleanup commands over `dist`, generated assets, or
the dirty worktree. Do not commit unless the user requests it.

## Completion criteria

The work is complete when a designer can author an NPC or POI and recursively
create, select, inspect, edit, and revisit its linked character, prefab,
effects, dialogue, quests, items, and behaviors without typing IDs; the graph
rejects broken or cyclic data; specialist assets still use their established
formats and editors; server round-trip preserves the graph; all required checks
pass; and the live Content workspace has been visually inspected.
