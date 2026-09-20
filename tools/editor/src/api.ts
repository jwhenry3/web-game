import type { HairDoc } from "./model/hair";
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

// --- rigged hair docs (tools/hairs/*.hair.json) ------------------------------

export interface HairInfo {
  id: string;
  label: string;
  preset: boolean;
}

export async function listHairs(): Promise<HairInfo[]> {
  const res = await fetch("/editor-api/hairs");
  if (!res.ok) throw new Error(`hairs: ${res.status}`);
  return (await res.json()).hairs as HairInfo[];
}

export async function loadHair(id: string): Promise<HairDoc | null> {
  const res = await fetch(`/editor-api/hair?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return (await res.json()).hair as HairDoc;
}

export async function saveHair(doc: HairDoc): Promise<void> {
  const res = await fetch("/editor-api/hair/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hair: doc }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `save failed: ${res.status}`);
}

// --- saved parts library (tools/parts/*.part.json) ---------------------------

import type { Attachment } from "./model/types";

/** A reusable part: attachment mount metadata + its atlas pixels as a
 * base64 PNG. Mountable onto any character's slots from the Parts dock. */
export interface PartDoc {
  id: string;
  label?: string;
  /** Source context — hints for which layer/slot it mounts on. */
  char?: string;
  layer?: string;
  slot?: string;
  /** Attachment fields in skeleton units (x/y/rotation/scale/width/height). */
  attachment: Attachment;
  /** The part's pixels — a PNG data-URL payload (no prefix). */
  pngBase64: string;
  /** Atlas px per skeleton unit at save time — lets the mount rescale
   * attachment width/height if the target rig's density differs. */
  pxPerUnit?: number;
}

export interface PartInfo {
  id: string;
  label: string;
  layer: string;
  slot: string;
}

export async function listParts(): Promise<PartInfo[]> {
  const res = await fetch("/editor-api/parts");
  if (!res.ok) throw new Error(`parts: ${res.status}`);
  return (await res.json()).parts as PartInfo[];
}

export async function loadPart(id: string): Promise<PartDoc | null> {
  const res = await fetch(`/editor-api/part?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return (await res.json()).part as PartDoc;
}

export async function savePart(doc: PartDoc): Promise<void> {
  const res = await fetch("/editor-api/part/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ part: doc }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `save failed: ${res.status}`);
}

export async function deletePart(id: string): Promise<void> {
  const res = await fetch("/editor-api/part/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `delete failed: ${res.status}`);
}

export async function deleteHair(id: string): Promise<void> {
  const res = await fetch("/editor-api/hair/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `delete failed: ${res.status}`);
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
