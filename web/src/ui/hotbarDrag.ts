import type { DragEvent } from "react";

export const HOTBAR_MIME = "application/x-ff5-hotbar";

export interface HotbarDrag {
  kind: "skill" | "item";
  id: string;
  slot?: string;
}

export function writeHotbarDrag(e: DragEvent, payload: HotbarDrag) {
  e.dataTransfer.setData(HOTBAR_MIME, JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", `${payload.kind}:${payload.id}`);
  e.dataTransfer.effectAllowed = payload.slot ? "move" : "copy";
}

export function readHotbarDrag(e: DragEvent): HotbarDrag | null {
  const raw = e.dataTransfer.getData(HOTBAR_MIME) || e.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return JSON.parse(raw) as HotbarDrag;
    const [kind, id] = raw.split(":");
    if ((kind === "skill" || kind === "item") && id) return { kind, id };
  } catch {
    return null;
  }
  return null;
}
