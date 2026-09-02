import type { AtlasPayload } from "../types";

export async function fetchAtlas(): Promise<AtlasPayload> {
  const res = await fetch("/api/atlas");
  if (!res.ok) throw new Error("Failed to load map atlas");
  return (await res.json()) as AtlasPayload;
}
