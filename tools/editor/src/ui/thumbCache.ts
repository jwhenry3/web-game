// Shared thumbnail cache — compiles an asset's preview image once per data
// change instead of on every explorer render.
//
// Cards call `useThumbnail(key, digest, compile)`: the digest is a cheap hash
// of whatever the thumbnail depends on (definition data, prefab revision,
// prop overrides). A cache entry stores {digest, url} — when the digest
// matches, the cached data URL is returned synchronously and no work happens.
// When it doesn't, the compile runs once (rAF-scheduled, deduped per key) and
// every subscribed card picks up the fresh image. While a recompile is in
// flight the previous image keeps showing, so edits never flicker thumbnails
// back to fallbacks.

import { useEffect, useState } from 'react';

interface ThumbEntry { digest: string; url: string | null }

const MAX_ENTRIES = 600;
const cache = new Map<string, ThumbEntry>();
const pending = new Map<string, Promise<void>>();

/** Cheap stable hash of the thumbnail's inputs — JSON + djb2. Collisions only
 * cost a stale image, and the length suffix makes those vanishingly rare for
 * same-id edits. */
export function thumbnailDigest(input: unknown): string {
  const text = JSON.stringify(input) ?? '';
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `${hash.toString(36)}:${text.length}`;
}

const store = (key: string, digest: string, url: string | null) => {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) cache.delete(cache.keys().next().value!);
  cache.set(key, { digest, url });
};

function schedule(key: string, digest: string, compile: () => string | null): Promise<void> {
  const running = pending.get(key);
  if (running) return running;
  const job = new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      try { store(key, digest, compile()); }
      catch { store(key, digest, null); }
      resolve();
    });
  }).finally(() => { if (pending.get(key) === job) pending.delete(key); });
  pending.set(key, job);
  return job;
}

/** Cached thumbnail for `key`. Recompiles only when `digest` changes — the
 * compile callback should produce the image (data URL) and may return null. */
export function useThumbnail(key: string, digest: string, compile: () => string | null): string | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const entry = cache.get(key);
    if (entry?.digest === digest) return;
    let live = true;
    void schedule(key, digest, compile).then(() => { if (live) bump(n => n + 1); });
    return () => { live = false; };
    // compile is intentionally excluded — it captures the same inputs the
    // digest already fingerprints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, digest]);
  return cache.get(key)?.url ?? null;
}

/** Drop a cached thumbnail (e.g. after the underlying asset is replaced
 * in-place without a data change the digest would catch). */
export function invalidateThumbnail(key: string): void { cache.delete(key); }
