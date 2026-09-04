const KEY = "cm_saved_credentials";

export interface SavedCredentials {
  username: string;
  password: string;
}

export function loadSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedCredentials>;
    if (typeof data.username !== "string" || typeof data.password !== "string") return null;
    if (!data.username || !data.password) return null;
    return { username: data.username, password: data.password };
  } catch {
    return null;
  }
}

export function saveCredentials(username: string, password: string): void {
  localStorage.setItem(KEY, JSON.stringify({ username, password }));
}

export function clearSavedCredentials(): void {
  localStorage.removeItem(KEY);
}
