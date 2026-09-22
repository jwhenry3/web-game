# Asset graph and persistence

## Root document

`ContentDocument.definitions` remains the root asset library. Every root asset
has a stable ID, content type, name, description, optional thumbnail, tags, and
schema-owned data.

Two explicit values create graph edges:

```ts
type AssetReferenceValue = { $kind: "assetRef"; id: string };
type EmbeddedAssetValue = {
  $kind: "embedded";
  definition: ContentDefinition;
};
```

Use a reference when an asset is reusable. Use an embedded definition when it
belongs exclusively to its parent. UI state and resolved copies never belong
in serialized content.

Legacy string references remain readable when a schema field has type
`reference`. New recursive slots write marker objects.

## Graph construction

The graph builder returns:

```ts
interface AssetGraphEdge {
  from: string;
  to: string;
  path: string;
  embedded: boolean;
}

interface AssetGraph {
  nodes: Map<string, ContentDefinition>;
  edges: AssetGraphEdge[];
}
```

Root node keys are their asset IDs. Embedded node keys are deterministic owner
paths, such as `npc.guard::behaviors.0.dialogue`. Reordering unrelated fields
must not change an embedded key.

Walk arrays and objects recursively. Also walk schema-declared legacy reference
and list fields. Deduplicate identical edges without losing the source path
needed for validation navigation.

## Validation

Report a structured issue with an actionable path for:

- missing targets;
- references to disallowed content types;
- root ID duplication;
- embedded path collision;
- reference and embedded cycles;
- nesting deeper than 16 assets;
- a root definition also embedded as a copied definition;
- specialist references whose rig, effect, or prefab no longer exists.

Graph cycle errors show the human-readable chain. Saving to the server is
disabled while graph errors exist.

Before deleting a root, calculate backlinks. A referenced asset cannot be
silently removed. The editor should offer Cancel, Replace references, or Unlink
references with an explicit consumer list.

Renaming a root ID is an atomic graph operation that rewrites every matching
`assetRef` and schema-declared legacy reference. If the destination ID exists,
reject the rename.

## Normalization and migration

`normalizeContentDocument` recursively normalizes embedded definitions and
retains known marker values. Invalid markers become `null` plus a validation
issue rather than arbitrary objects.

Increment `CONTENT_DOCUMENT_VERSION` only when persisted representation
changes. Add an explicit migration for each previous version and verify that a
round trip preserves unknown extension data.

The gameplay graph persists through `/api/admin/content/gameplay`. Specialist
assets retain their established files and endpoints. Saving gameplay content
never implicitly saves a modified rig, VFX profile, or scene prefab.

