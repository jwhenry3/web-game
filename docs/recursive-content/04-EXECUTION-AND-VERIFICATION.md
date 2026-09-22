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

