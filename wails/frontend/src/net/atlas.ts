import type { AtlasPayload } from "../types";
import { apiUrl, platformFetch } from "./platform";

export async function fetchAtlas(): Promise<AtlasPayload> {
  const res = await platformFetch(apiUrl("/api/atlas"));
  if (!res.ok) throw new Error("Failed to load map atlas");
  return (await res.json()) as AtlasPayload;
}
