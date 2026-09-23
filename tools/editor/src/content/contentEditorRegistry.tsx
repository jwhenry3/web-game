import { createContext, useContext, type ComponentType } from 'react';
import type { ContentDefinition, ContentDocument, ContentType, ContentValue } from '../../../../wails/frontend/src/content/contentSchema.ts';
import type { InspectorField } from '../../../../wails/frontend/src/content/contentRegistry.ts';
import type { SceneStore } from '../scene3d/store';

/** Target for the workspace's scene panel: an authored scene-prefab asset or
 * a compiled prefab def opened as a draft. `assign` is called when the panel
 * saves a draft as a new authored asset so the launching field can store the
 * new prefab id. */
export interface PrefabPanelTarget {
  assetId?: string;
  defId?: string;
  /** Data-relative field path (ctx.path) that receives the new authored
   * prefab id when the panel saves a draft as a scene asset. */
  assignPath?: string;
}

/** Shared navigation services provided by ContentWorkspace — lets generic
 * fields and specialist adapters open/create assets without knowing how the
 * workspace manages its stack. */
export interface ContentNav {
  document: ContentDocument;
  /** Number of assets referencing `id` (used for “Shared · N” badges). */
  backlinkCount(id: string): number;
  /** Open a root asset — pushes or truncates the navigation stack. */
  open(id: string): void;
  /** Open an embedded child. `dataPath` is the path inside the owning root's
   * `data` to the embedded marker. */
  openEmbedded(dataPath: string, definition: ContentDefinition, label: string): void;
  /** Create a new root asset, wire it via `link`, then open it. */
  createAndLink(types: ContentType[], link: (id: string) => void): void;
  /** Create an embedded child, wire it via `link`, then open it. `path` is
   * the data-relative path of the slot marker receiving the child. */
  embedAndLink(types: ContentType[], path: string, link: (definition: ContentDefinition) => void): void;
  /** Append a definition to the root library (collision-safe id); returns the
   * final id. Used by “convert to shared”. */
  addRootAsset(definition: ContentDefinition): string;
  /** Scene store for the selected map (null until one is picked in the
   * toolbar) — prefab adapters read authored assets from it. */
  sceneStore?: SceneStore | null;
  sceneMapId?: string;
  /** Open the scene panel editing an authored asset or compiled prefab. */
  openPrefabEditor?: (target: PrefabPanelTarget) => void;
  /** Re-open the embedded effect panel for the viewed `effect` asset after
   * it was dismissed with ✕. */
  openEffectEditor?: () => void;
}

export const ContentNavContext = createContext<ContentNav | null>(null);
export function useContentNav(): ContentNav {
  const nav = useContext(ContentNavContext);
  if (!nav) throw new Error('ContentNavContext is missing — render inside ContentWorkspace.');
  return nav;
}

/** Props passed to specialist field editors (`field.editorId`). */
export interface ContentEditorContext {
  definition: ContentDefinition;
  field: InspectorField;
  value: ContentValue | undefined;
  document: ContentDocument;
  /** Data-relative path of this field's value inside the owning root. */
  path: string;
  updateValue(next: ContentValue | undefined): void;
  openAsset(id: string): void;
  createAndLink(type: ContentType, link: (id: string) => void): void;
}

export type ContentFieldEditorComponent = ComponentType<ContentEditorContext>;

const registry = new Map<string, ContentFieldEditorComponent>();

export function registerContentFieldEditor(id: string, component: ContentFieldEditorComponent): () => void {
  const previous = registry.get(id);
  registry.set(id, component);
  return () => { if (previous) registry.set(id, previous); else registry.delete(id); };
}
export function getContentFieldEditor(id: string): ContentFieldEditorComponent | undefined { return registry.get(id); }
