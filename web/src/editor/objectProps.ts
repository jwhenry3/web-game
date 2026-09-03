import type { EditorObject } from "./editorTypes";
import {
  formatNpcRoles,
  normalizeNpcObject,
  parseNpcRoles,
  parseNpcServiceRoles,
  toggleNpcServiceRole,
  type NpcRole,
  type NpcServiceRole,
} from "./npcEntity";

export { formatNpcRoles, normalizeNpcObject, parseNpcRoles, parseNpcServiceRoles, toggleNpcServiceRole };
export type { NpcRole, NpcServiceRole };

export function toggleNpcRole(obj: EditorObject, role: NpcServiceRole): EditorObject {
  return toggleNpcServiceRole(obj, role);
}

export function objectsMatch(a: EditorObject, b: EditorObject): boolean {
  if (a.id != null && b.id != null) return a.id === b.id;
  return a.name === b.name && a.type === b.type;
}
