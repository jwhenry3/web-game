/** Platform HTTP — browser uses relative fetch; Wails replaces with Go REST proxy. */

export type PlatformFetch = (path: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: PlatformFetch = (path, init) => fetch(path, init);

export function setPlatformFetch(fn: PlatformFetch): void {
  fetchImpl = fn;
}

export function platformFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetchImpl(path, init);
}

/** Resolve API path — desktop client prefixes the configured server URL. */
let apiBase = "";

export function setApiBase(base: string): void {
  apiBase = base.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return apiBase ? `${apiBase}${path}` : path;
}
