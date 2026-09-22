# Recursive editor workflow

## Navigation

ContentWorkspace owns a stack of navigation entries. Selecting a browser card
starts a stack. Opening a linked or embedded child pushes an entry. Breadcrumb
clicks truncate the stack; Back pops one entry.

Opening an asset already present in the stack truncates to its existing entry.
This prevents confusing duplicate crumbs and provides a UI guard against
cycles. Backspace may navigate only when focus is outside editable controls.

The browser's selected category, filters, search, and scroll position remain
stable while the designer drills into the inspector.

Breadcrumb example:

`Guard Captain / Character / Humanoid Rig`

Each crumb displays its type icon. Referenced children display **Shared** and a
backlink count. Embedded children display **Owned by Guard Captain**.

## Asset slot

An asset slot appears as a compact card rather than a raw select box. It shows
the thumbnail, icon, name, type, ownership, and validation state. Depending on
the schema, its actions are:

- Open
- Create and link
- Embed new
- Replace
- Convert to shared
- Make local copy
- Clear

Selection uses a searchable thumbnail picker filtered by `referenceTypes`.
Creating a child opens it immediately, with the parent preserved in the
breadcrumb trail.

## Generic field rendering

The generic inspector supports simple fields, lists, behavior lists, recursive
asset slots, embedded assets, and custom editor adapters. Specialist editors
are resolved through an editor registry:

```ts
registerContentFieldEditor("character", CharacterAssetEditor);
registerContentFieldEditor("effect", EffectAssetEditor);
registerContentFieldEditor("prefab", PrefabAssetEditor);
```

The generic Field component only resolves `field.editorId`. It must not import
or branch on those component names.

Behavior trigger, condition, and action extensions declare parameter fields in
the same schema format. Built-in actions must use typed asset slots:

- show dialogue → dialogue
- start or advance quest → quest
- give or take item → item and quantity
- open vendor → vendor
- spawn set → spawn set
- play effect → effect
- apply status → status effect

## Relationships and errors

The inspector includes a Relationships foldout containing outgoing links and
backlinks. Every row opens the related asset. Validation errors are clickable
and open the exact asset and field path.

Inline specialist editors live in collapsible sections. Only one heavy 3D
preview should run at a time. Collapsed panels suspend animation/render loops.

Empty states explain the next action in plain language. Ordinary workflows
must never expose raw JSON or require knowledge of internal IDs.

