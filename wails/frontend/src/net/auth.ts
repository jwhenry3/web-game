const TOKEN_KEY = "cm_auth_token";
export const MAX_CHARACTERS = 8;

export interface CharacterSummary {
  name: string;
  race: string;
  main_job: string;
  sub_job: string;
}

export interface AuthResult {
  token: string;
  username: string;
  has_character: boolean;
  is_admin?: boolean;
  characters: CharacterSummary[];
  character?: CharacterSummary;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function readJSON<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`Request failed (${res.status}).`);
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 404) {
      throw new Error("Server endpoint not found — restart the game server.");
    }
    throw new Error(`Server returned invalid JSON (${res.status}).`);
  }
}

import { apiUrl, platformFetch } from "./platform";

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await platformFetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJSON<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function normalizeAuth(data: Omit<AuthResult, "token"> & { token?: string }): Omit<AuthResult, "token"> {
  const characters = data.characters ?? (data.character ? [data.character] : []);
  return {
    username: data.username,
    has_character: data.has_character ?? characters.length > 0,
    is_admin: data.is_admin ?? false,
    characters,
    character: data.character ?? characters[0],
  };
}

export async function register(username: string, password: string): Promise<AuthResult> {
  const data = await postJSON<AuthResult>("/api/register", { username, password });
  return { ...normalizeAuth(data), token: data.token };
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const data = await postJSON<AuthResult>("/api/login", { username, password });
  return { ...normalizeAuth(data), token: data.token };
}

export async function fetchMe(token: string): Promise<Omit<AuthResult, "token">> {
  const res = await platformFetch(apiUrl("/api/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await readJSON<Omit<AuthResult, "token"> & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? "Session expired.");
  }
  return normalizeAuth(data);
}

export async function deleteCharacter(
  token: string,
  name: string,
): Promise<{ characters: CharacterSummary[]; has_character: boolean }> {
  const res = await platformFetch(apiUrl("/api/me"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "delete_character", name }),
  });
  const data = await readJSON<{
    characters?: CharacterSummary[];
    has_character?: boolean;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error ?? "Delete failed.");
  }
  return {
    characters: data.characters ?? [],
    has_character: data.has_character ?? false,
  };
}
