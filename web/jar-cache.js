const cacheName = "j2me-content-v1";

export async function loadCachedJar(source, frameWindow, signal, download) {
  let cache, key;
  try {
    const sourceUrl = new URL(source.url ?? frameWindow.location.href,
      frameWindow.document?.baseURI ?? frameWindow.location.href);
    key = new URL(`/__j2me_content_v1__/${source.sha256}`, sourceUrl.origin).href;
    cache = await frameWindow.caches?.open(cacheName);
    const response = await cache?.match(key);
    if (response) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (await matches(bytes, source, frameWindow.crypto)) {
        signal.throwIfAborted();
        return bytes;
      }
      await cache.delete(key);
    }
  } catch { /* Storage may be unavailable; network remains authoritative. */ }
  signal.throwIfAborted();
  const bytes = await download();
  signal.throwIfAborted();
  if (cache) {
    try { await cache.put(key, new frameWindow.Response(bytes, {headers: {"content-length": String(bytes.length)}})); }
    catch { /* Quota or storage failures must not prevent play. */ }
  }
  return bytes;
}

async function matches(bytes, source, cryptoObject) {
  if (bytes.length !== source.sizeBytes) return false;
  const digest = new Uint8Array(await cryptoObject.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("") === source.sha256;
}
