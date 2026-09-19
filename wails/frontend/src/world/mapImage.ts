import { platformFetch } from "../net/platform";

function mapImagePath(mapId: string): string {
  return `/api/mapimg?id=${encodeURIComponent(mapId)}`;
}

const blobCache = new Map<string, Promise<Blob | null>>();
const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();
const urlCache = new Map<string, Promise<string | null>>();

/**
 * Fetches the server-baked terrain PNG through platformFetch so it works in
 * both the browser (plain fetch) and Wails (Go REST bridge — the webview
 * cannot reach the proxy URL directly). Resolves null when the endpoint is
 * missing or the map is unknown; callers keep a cell-array fallback.
 */
function fetchMapBlob(mapId: string): Promise<Blob | null> {
  let p = blobCache.get(mapId);
  if (!p) {
    p = platformFetch(mapImagePath(mapId))
      .then((res) => (res.ok ? res.blob() : null))
      .catch(() => null);
    blobCache.set(mapId, p);
  }
  return p;
}

/** Decoded terrain image for canvas drawImage (minimap). */
export function loadMapImage(mapId: string): Promise<ImageBitmap | null> {
  let p = bitmapCache.get(mapId);
  if (!p) {
    // Resolve null on decode failure — callers fall back to cell painting.
    p = fetchMapBlob(mapId).then((b) =>
      b ? createImageBitmap(b).catch(() => null) : null,
    );
    bitmapCache.set(mapId, p);
  }
  return p;
}

/** Object URL suitable for <img src> (world map window). */
export function loadMapImageURL(mapId: string): Promise<string | null> {
  let p = urlCache.get(mapId);
  if (!p) {
    p = fetchMapBlob(mapId).then((b) => (b ? URL.createObjectURL(b) : null));
    urlCache.set(mapId, p);
  }
  return p;
}
