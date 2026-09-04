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

/** Square hotbar-style ghost shown while dragging consumables onto the hotbar. */
export function setHotbarDragImage(e: DragEvent, iconSrc: string, qty?: number) {
  const ghost = document.createElement("div");
  ghost.className = "hotbar-slot hotbar-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");

  const iconWrap = document.createElement("span");
  iconWrap.className = "hotbar-icon";
  const img = document.createElement("img");
  img.className = "cm-icon";
  img.src = iconSrc;
  img.width = 34;
  img.height = 34;
  img.alt = "";
  iconWrap.appendChild(img);
  ghost.appendChild(iconWrap);

  if (qty != null && qty > 1) {
    const qtyEl = document.createElement("span");
    qtyEl.className = "hotbar-qty";
    qtyEl.textContent = `×${qty}`;
    ghost.appendChild(qtyEl);
  }

  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 28, 28);
  window.setTimeout(() => ghost.remove(), 0);
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
