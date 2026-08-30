/**
 * Keeps clipboard/object-URL images alive long enough to write them to disk.
 * `fetch(blob:http://tauri.localhost/…)` is unreliable in Tauri's webview, so
 * persist must use this map instead of re-fetching the object URL.
 */

const blobs = new Map<string, Blob>();
const persisted = new Map<string, string>();
let captureInstalled = false;

const BLOB_URL_RE = /blob:[^\s)<>"']+/g;

/** Record every object URL so save can write the bytes without fetch(). */
export function installBlobUrlCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = ((obj: Blob | MediaSource) => {
    const url = original(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  }) as typeof URL.createObjectURL;
}

export function rememberImageBlob(file: Blob): string {
  const url = URL.createObjectURL(file);
  blobs.set(url, file);
  return url;
}

export function rememberPersistedBlob(blobUrl: string, relativePath: string): void {
  persisted.set(blobUrl, relativePath);
}

export function getPersistedBlobPath(blobUrl: string): string | undefined {
  return persisted.get(blobUrl);
}

export function getRememberedImageBlob(blobUrl: string): Blob | undefined {
  return blobs.get(blobUrl);
}

export function extractBlobUrls(markdown: string): string[] {
  const found = markdown.match(BLOB_URL_RE);
  if (!found) return [];
  return [...new Set(found)];
}

/** Replace blob URLs we already flushed to disk (and `<blob:…>` wrappers). */
export function rewritePersistedBlobUrls(markdown: string): string {
  if (!markdown.includes("blob:")) return markdown;
  let updated = markdown;
  for (const [blobUrl, relativePath] of persisted) {
    updated = updated.split(`<${blobUrl}>`).join(relativePath);
    updated = updated.split(blobUrl).join(relativePath);
  }
  return updated;
}
