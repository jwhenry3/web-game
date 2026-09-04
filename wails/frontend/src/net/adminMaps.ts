import { login } from "./auth";
import type { MapTileOverrides, MapTerrainLayers } from "../types";
import type { EditorObject } from "../editor/editorTypes";
import { apiUrl, platformFetch } from "./platform";

const ADMIN_TOKEN_KEY = "cm_admin_token";
export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminLogin(username: string, password: string) {
  const result = await login(username, password);
  if (!result.is_admin) {
    throw new Error("This account does not have Game Designer access.");
  }
  setAdminToken(result.token);
  return result;
}

export interface AdminMapInfo {
  id: string;
  name: string;
  overworld: string;
  cols: number;
  rows: number;
  tile_size: number;
  enabled: boolean;
  running: boolean;
  default: boolean;
  base_terrain_layers: MapTerrainLayers;
  terrain_layers: MapTerrainLayers;
  base_objects: EditorObject[];
  objects: EditorObject[];
  has_override: boolean;
  overrides?: MapTileOverrides;
}
async function adminFetch(path: string, init: RequestInit = {}) {
  const token = getAdminToken();
  if (!token) throw new Error("Admin session expired — sign in again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await platformFetch(apiUrl(`/api${path}`), { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      setAdminToken(null);
      throw new Error("Admin session expired — sign in again.");
    }
    const text = (await res.text()).trim();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchAdminMaps(): Promise<AdminMapInfo[]> {
  return adminFetch("/admin/maps");
}

export async function createAdminMap(body: {
  id: string;
  name: string;
  cols?: number;
  rows?: number;
}): Promise<AdminMapInfo> {
  return adminFetch("/admin/maps", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function enableAdminMap(id: string): Promise<AdminMapInfo> {
  return adminFetch(`/admin/maps/${encodeURIComponent(id)}/enable`, { method: "POST" });
}

export async function disableAdminMap(id: string): Promise<AdminMapInfo> {
  return adminFetch(`/admin/maps/${encodeURIComponent(id)}/disable`, { method: "POST" });
}

export async function removeAdminMap(id: string): Promise<void> {
  await adminFetch(`/admin/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function saveMapOverrides(id: string, overrides: MapTileOverrides): Promise<void> {
  await adminFetch(`/admin/maps/${id}/overrides`, {
    method: "PUT",
    body: JSON.stringify(overrides),
  });
}

export async function clearMapOverrides(id: string): Promise<void> {
  await adminFetch(`/admin/maps/${id}/overrides`, { method: "DELETE" });
}

export interface MapServerInfo {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
  default: boolean;
  config_path: string;
  overworld: string;
  addr: string;
  battle_speed: number;
  combat: string;
  combat_options: string[];
}

export type MapServerUpdate = {
  enabled?: boolean;
  name?: string;
  addr?: string;
  battle_speed?: number;
  combat?: string;
};

export async function fetchMapServerConfig(id: string): Promise<MapServerInfo> {
  return adminFetch(`/admin/maps/${encodeURIComponent(id)}/server`);
}

export async function updateMapServerConfig(id: string, body: MapServerUpdate): Promise<MapServerInfo> {
  return adminFetch(`/admin/maps/${encodeURIComponent(id)}/server`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function diffLayers(
  mapId: string,
  base: Record<string, number[]>,
  current: Record<string, number[]>,
): MapTileOverrides {
  const layers: Record<string, Record<string, number>> = {};
  for (const [layerName, cur] of Object.entries(current)) {
    const baseLayer = base[layerName];
    if (!baseLayer || baseLayer.length !== cur.length) continue;
    const patches: Record<string, number> = {};
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== baseLayer[i]) patches[String(i)] = cur[i];
    }
    if (Object.keys(patches).length > 0) layers[layerName] = patches;
  }
  return { map_id: mapId, layers };
}

export function applyLayerPatches(data: number[], patches?: Record<string, number>): number[] {
  const out = [...data];
  if (!patches) return out;
  for (const [idxStr, gid] of Object.entries(patches)) {
    const idx = parseInt(idxStr, 10);
    if (idx >= 0 && idx < out.length) out[idx] = gid;
  }
  return out;
}

export function clearAdminSession() {
  setAdminToken(null);
}
