import { APIGet, APIDelete, APIPost, APIPut } from "../wailsjs/go/app/App";

function bearerToken(init?: RequestInit): string {
  const headers = init?.headers;
  if (!headers) return "";
  if (headers instanceof Headers) {
    return (headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  }
  const rec = headers as Record<string, string>;
  const raw = rec.Authorization ?? rec.authorization ?? "";
  return raw.replace(/^Bearer\s+/i, "");
}

/** Go's API* methods already prepend the server base — only pass path+query. */
function apiPathOnly(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const u = new URL(path);
      return `${u.pathname}${u.search}`;
    } catch {
      /* keep original */
    }
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export async function wailsPlatformFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const token = bearerToken(init);
  const body = init?.body != null ? String(init.body) : "";
  const apiPath = apiPathOnly(path);

  try {
    let text: string;
    if (method === "GET") {
      text = await APIGet(apiPath, token);
    } else if (method === "POST") {
      text = await APIPost(apiPath, body, token);
    } else if (method === "PUT") {
      text = await APIPut(apiPath, body, token);
    } else if (method === "DELETE") {
      text = await APIDelete(apiPath, token);
    } else {
      throw new Error(`Unsupported method ${method}`);
    }
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
