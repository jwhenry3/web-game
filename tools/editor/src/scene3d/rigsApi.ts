import { normalizeRig, type Rig3DDoc } from "../../../../wails/frontend/src/three/rig3d";

export interface RigInfo { id: string; label: string }
export interface ModelInfo { name: string; url: string }

export async function listRigFiles(): Promise<RigInfo[]> {
  const res = await fetch("/editor-api/rigs3d");
  if (!res.ok) throw new Error(`rig list failed (${res.status})`);
  return ((await res.json()) as { rigs?: RigInfo[] }).rigs ?? [];
}

/** Saved doc for `id`, or null when only the compiled-in default exists. */
export async function loadRigFile(id: string): Promise<Rig3DDoc | null> {
  const res = await fetch(`/editor-api/rigs3d/rig?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`rig load failed (${res.status})`);
  return normalizeRig(await res.json(), id);
}

export async function saveRigFile(doc: Rig3DDoc): Promise<void> {
  const res = await fetch("/editor-api/rigs3d/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: doc.id, doc }),
  });
  if (!res.ok) throw new Error(`rig save failed (${res.status})`);
}

export async function deleteRigFile(id: string): Promise<void> {
  const res = await fetch("/editor-api/rigs3d/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`rig delete failed (${res.status})`);
}

export async function listModels(): Promise<ModelInfo[]> {
  try {
    const res = await fetch("/editor-api/rigs3d/models");
    if (!res.ok) return [];
    return ((await res.json()) as { models?: ModelInfo[] }).models ?? [];
  } catch {
    return [];
  }
}
