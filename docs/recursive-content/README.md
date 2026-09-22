# Recursive content editor

This folder breaks the recursive MMORPG content-editor strategy into focused
agent handoffs. Read this page first, then only the document that owns the work
being performed.

## Reading order

1. [`01-ASSET-GRAPH.md`](01-ASSET-GRAPH.md) — serialization, references,
   embedding, graph validation, and migrations.
2. [`02-EDITOR-WORKFLOW.md`](02-EDITOR-WORKFLOW.md) — recursive navigation,
   generic fields, breadcrumbs, relationship UX, and destructive operations.
3. [`03-SPECIALIST-ADAPTERS.md`](03-SPECIALIST-ADAPTERS.md) — character, VFX,
   and prefab editor integration contracts.
4. [`04-EXECUTION-AND-VERIFICATION.md`](04-EXECUTION-AND-VERIFICATION.md) —
   phased implementation, ownership boundaries, checks, and completion gates.

The full product rationale and consolidated contract remain in
[`../RECURSIVE_CONTENT_EDITOR.md`](../RECURSIVE_CONTENT_EDITOR.md).

## Current state

The prior implementation pass was deliberately paused to write documentation.
Several files are partially implemented and must be inspected before work
resumes:

- `wails/frontend/src/content/recursiveAssets.ts`
- `wails/frontend/src/content/recursiveAssets.spec.ts`
- `tools/editor/src/content/recursiveNavigation.ts`
- `tools/editor/src/content/recursiveNavigation.spec.ts`
- `tools/editor/src/content/CharacterAssetEditor*`
- `tools/editor/src/content/assetEditors.spec.ts`

Effect and prefab adapter files may not exist yet. Partial code is not evidence
of completion. Run the focused tests and editor typecheck before relying on it.

## Constraints

- Preserve the dirty worktree and concurrent user changes.
- Use the current specialist formats and save APIs; do not duplicate rig, VFX,
  or scene-prefab schemas inside the gameplay document.
- Keep the main content inspector schema-driven.
- Do not require designers to copy or type IDs during normal workflows.
- Do not commit, publish, or clean generated files unless the user requests it.

