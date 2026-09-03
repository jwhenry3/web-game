import { getAdminToken, setAdminToken } from "./adminMaps";

export type ContentKind = "entities" | "prefabs" | "tileset" | "items" | "quests" | "jobs" | "skills";

interface ContentResponse<T> {
  kind: ContentKind;
  data: T;
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const token = getAdminToken();
  if (!token) throw new Error("Admin session expired — sign in again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      setAdminToken(null);
      throw new Error("Admin session expired — sign in again.");
    }
    const text = (await res.text()).trim();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchAdminContent<T>(kind: ContentKind): Promise<T> {
  const body = (await adminFetch(`/admin/content/${kind}`)) as ContentResponse<T>;
  return body.data;
}

export async function saveAdminContent(kind: ContentKind, data: unknown): Promise<void> {
  await adminFetch(`/admin/content/${kind}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  });
}
