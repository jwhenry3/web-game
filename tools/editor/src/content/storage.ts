import { defaultContentDocument, normalizeContentDocument, type ContentDocument } from '../../../../wails/frontend/src/content/contentSchema';

export const CONTENT_STORAGE_KEY = 'mmorpg-content:v1';

function adminHeaders(): HeadersInit {
  const token = sessionStorage.getItem('cm_scene_editor_token') || localStorage.getItem('cm_auth_token');
  if (!token) throw new Error('Sign in as an administrator from the Prefabs workspace first.');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function parseContentJson(json: string): ContentDocument {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { definitions?: unknown }).definitions)) {
    throw new Error('The JSON must contain a definitions array.');
  }
  return normalizeContentDocument(parsed);
}

export function loadContent(): ContentDocument {
  try { return parseContentJson(localStorage.getItem(CONTENT_STORAGE_KEY) ?? ''); }
  catch { return defaultContentDocument(); }
}

export function saveContent(doc: ContentDocument): void {
  localStorage.setItem(CONTENT_STORAGE_KEY, JSON.stringify(doc));
}

export function downloadContent(doc: ContentDocument): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'game-content.json'; anchor.click();
  URL.revokeObjectURL(url);
}

export async function loadServerContent(): Promise<ContentDocument> {
  const response = await fetch('/api/admin/content/gameplay', { headers: adminHeaders() });
  if (response.status === 404) return defaultContentDocument();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload: unknown = await response.json();
  const body = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: unknown }).data : payload;
  return normalizeContentDocument(body);
}

export async function saveServerContent(doc: ContentDocument): Promise<void> {
  const response = await fetch('/api/admin/content/gameplay', { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(doc) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
}
