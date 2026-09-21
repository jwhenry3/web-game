/**
 * Scene workspace data access. Terrain comes from the running game server
 * (proxied /api, see vite.config.ts) so the editor's heightmap is exactly the
 * one the client renders. Scene documents are local files for now: exported
 * and imported as JSON, autosaved to localStorage by the store.
 */
import type { MapSnapshot } from "../../../../wails/frontend/src/net/wire.gen";
import { normalizeScene, type Scene3DDoc } from "../../../../wails/frontend/src/three/scene3d";

const tokenKey='cm_scene_editor_token';
export function hasEditorSession() { return !!(sessionStorage.getItem(tokenKey)||localStorage.getItem('cm_auth_token')); }
function adminHeaders() {
  const token=sessionStorage.getItem(tokenKey)||localStorage.getItem('cm_auth_token');
  if(!token)throw new Error('Sign in with an administrator account to save the scene.');
  return {'Content-Type':'application/json',Authorization:`Bearer ${token}`};
}
async function responseJSON(res:Response) {
  const text=await res.text();let body:unknown;
  try {body=JSON.parse(text);}catch{throw new Error(`Server returned an invalid response (${res.status}). Check that the game server is running.`);}
  if(!res.ok)throw new Error((body as {error?:string}).error??`Request failed (${res.status})`);
  return body;
}
export async function loginSceneEditor(username:string,password:string) {
  const body=await responseJSON(await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})})) as {token?:string;is_admin?:boolean};
  if(!body.token||!body.is_admin)throw new Error('This account is not an administrator.');
  sessionStorage.setItem(tokenKey,body.token);
}
export async function loadScene(id:string, admin=false):Promise<Scene3DDoc> {
  const res=await fetch(`/api/${admin?'admin/':''}maps/${encodeURIComponent(id)}/scene3d`,admin?{headers:adminHeaders()}:undefined);
  return normalizeScene(await responseJSON(res),id);
}
export async function saveScene(doc:Scene3DDoc):Promise<Scene3DDoc> {
  const res=await fetch(`/api/admin/maps/${encodeURIComponent(doc.map)}/scene3d`,{method:'PUT',headers:adminHeaders(),body:JSON.stringify(doc)});
  return normalizeScene(await responseJSON(res),doc.map);
}

export interface SceneMapInfo { id: string; name: string }

export async function listSceneMaps(): Promise<SceneMapInfo[]> {
  const res = await fetch("/api/maps");
  if (!res.ok) throw new Error(`maps: ${res.status}`);
  const list = (await res.json()) as MapSnapshot[];
  return list.map(m => ({ id: m.id, name: m.name || m.id }));
}

export async function loadMapSnapshot(id: string): Promise<MapSnapshot> {
  const res = await fetch(`/api/maps/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`map ${id}: ${res.status}`);
  return (await res.json()) as MapSnapshot;
}

export function downloadScene(doc: Scene3DDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${doc.map}.scene3d.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickSceneFile(fallbackMap: string): Promise<Scene3DDoc | null> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve(normalizeScene(JSON.parse(await file.text()), fallbackMap)); }
      catch (e) { alert(`Could not read scene: ${e instanceof Error ? e.message : e}`); resolve(null); }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
