import type { Skeleton, Spec } from "./model/types";

export interface CharacterInfo {
  id: string;
  hasSpec: boolean;
  hasAssets: boolean;
  regenerable: boolean;
}

export async function listCharacters(): Promise<CharacterInfo[]> {
  const res = await fetch("/editor-api/characters");
  if (!res.ok) throw new Error(`characters: ${res.status}`);
  return (await res.json()).characters as CharacterInfo[];
}

export async function loadSpec(char: string): Promise<Spec | null> {
  const res = await fetch(`/editor-api/spec?char=${encodeURIComponent(char)}`);
  if (!res.ok) return null;
  return (await res.json()).spec as Spec;
}

export async function loadText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

export async function loadImage(path: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = path;
  await img.decode();
  return img;
}

export interface SavePayload {
  spec?: Spec;
  skeleton?: Skeleton;
  atlas?: string;
  pngBase64?: string;
  /** Asset stem the rig files write to — differs from `char` for preset
   * specs that share a rig (e.g. paperdoll_imp -> paperdoll.*). */
  assets?: string;
}

export async function save(char: string, payload: SavePayload): Promise<void> {
  const res = await fetch("/editor-api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ char, ...payload }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `save failed: ${res.status}`);
}

export async function regenerate(char: string): Promise<string> {
  const res = await fetch("/editor-api/regenerate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ char }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "regenerate failed");
  return body.output as string;
}

export async function deleteCharacter(id: string): Promise<void> {
  const res = await fetch("/editor-api/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ char: id }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `delete failed: ${res.status}`);
}

/** Create a character. With `assets` the doc is duplicated as-is; without
 * them a blank single-bone rig is written (regenerable if spec.generator). */
export async function createCharacter(
  id: string,
  spec?: Spec,
  assets?: { skeleton: Skeleton; atlas: string; pngBase64: string },
): Promise<void> {
  const res = await fetch("/editor-api/new", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, spec, ...assets }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `create failed: ${res.status}`);
}
