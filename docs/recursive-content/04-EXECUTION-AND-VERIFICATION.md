# Execution and verification

## Phase queue

1. Finish recursive graph and navigation helpers and make their tests pass.
2. Add the custom editor registry and generic asset-slot UI.
3. Integrate breadcrumbs and immutable updates for root and embedded assets.
4. Finish and register character, effect, and prefab adapters.
5. Add recursive slots to NPC, POI, item, ability, status, dialogue, quest,
   vendor, recipe, loot, and spawn-set schemas.
6. Add relationships, backlink-aware rename/delete, and clickable validation.
7. Verify server round-trip and the live editor workflow.

## Implementation progress

The asset-graph portion of phase 1 is implemented in
`wails/frontend/src/content/recursiveAssets.ts`. It now indexes root and
embedded definitions, records typed edges and backlinks, detects missing
targets, cycles, invalid target types, excessive nesting, duplicate embedded
root IDs, and owner-path identity collisions. Atomic root-ID rename rewrites
marker references and schema-declared legacy string references. Root deletion
is backlink-safe by default and requires an explicit unlink option when the
asset is still in use.

Specialist adapter selections also appear in the graph as external asset
nodes. Character fields produce `character:<rigId>` nodes, effect fields
produce `effect:<profileId>` nodes, and prefab fields produce
`prefab:<prefabId>` nodes. These nodes expose outgoing/backlink relationships
without copying rig, VFX, or scene-prefab schemas into the gameplay content
document.

The Content workspace now bootstraps an empty gameplay CMS document from the
existing project catalogs and compiled specialist registries. Items, quests,
abilities, NPC/POI/entity templates, character rigs, effect profiles, and
prefabs are visible in the Content tab even before a saved gameplay document
exists. Empty local drafts are treated as uninitialized so an accidental blank
localStorage save no longer hides all content.

The focused graph and schema checks pass. Recursive navigation and editor
integration remain the next phase-1 work items.

## Parallel ownership

- Graph/schema: `wails/frontend/src/content/*`
- Generic navigation/UI: `ContentWorkspace.tsx`, `content.css`, navigation and
  editor-registry files
- Character adapter: `CharacterAssetEditor*`
- Effect/prefab adapters: `EffectAssetEditor*` and `PrefabAssetEditor*`
- Integration owner: registrations, schema composition, docs, full checks, and
  browser QA

Agents communicate exported APIs before the integration owner changes shared
files. No two agents edit ContentWorkspace concurrently.

## Required scenario

The final browser walkthrough must create an NPC, attach or create a character
rig, choose a prefab, choose or create an interaction effect, create a dialogue
from a behavior action, traverse all children with breadcrumbs, return to the
NPC, save to the server, reload, and verify every link.

Then deliberately create a missing reference and a cycle. The editor must
identify the source field, open it when clicked, and block server save.

## Commands

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

Because the Go binary embeds the frontend distribution, do not run `go test
./...` concurrently with the frontend production build. The build replaces
hashed files and can cause a transient missing-embed failure.

## Completion gate

Completion requires fresh passing output for every applicable command, a live
browser inspection at `http://localhost:35215/?ws=content`, no console errors,
and confirmation that the implementation matches the documented workflow.
Partial adapter code, typecheck alone, or a static screenshot is insufficient.
