import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { exists, readFile } from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";

const REMOTE_URL_RE = /^(https?:)?\/\//i;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;
const blobCache = new Map<string, string>();

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  heic: "image/heic",
};

export function isRemoteOrEmbedded(url: string): boolean {
  return (
    REMOTE_URL_RE.test(url) ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("asset:") ||
    url.startsWith("http://asset.localhost") ||
    url.startsWith("https://asset.localhost") ||
    url.startsWith("tauri:")
  );
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Normalize separators; keep a Windows drive letter if present. */
function normalizeFsPath(path: string): string {
  let p = decodeMaybe(path.trim()).replace(/\\/g, "/");
  // "C:/Users/..." already fine; "//server/share" UNC keep as-is
  return p;
}

/**
 * Convert file:// / absolute / Windows paths into a real filesystem path.
 * Handles common Typora/Windows variants:
 * - file:///C:/Users/...
 * - file://C:/Users/...   (drive letter as URL host)
 * - file:///C:\Users\...  (backslashes)
 * - C:\Users\... / C:/Users/...
 */
export function toAbsoluteFsPath(url: string): string | null {
  let trimmed = url.trim();
  if (!trimmed) return null;

  // Normalize backslashes early so URL()/path logic is consistent
  if (/^file:/i.test(trimmed) && trimmed.includes("\\")) {
    trimmed = trimmed.replace(/\\/g, "/");
  }

  if (/^file:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol.toLowerCase() !== "file:") return null;

      let pathname = decodeMaybe(parsed.pathname);

      // file:///C:/Users/...  → pathname "/C:/Users/..."
      if (/^\/[a-zA-Z]:\//.test(pathname)) {
        return normalizeFsPath(pathname.slice(1));
      }

      // file://C:/Users/... → hostname "C:", pathname "/Users/..."
      if (/^[a-zA-Z]:$/i.test(parsed.hostname)) {
        return normalizeFsPath(`${parsed.hostname}${pathname}`);
      }

      // file://localhost/C:/Users/... or file://localhost/Users/...
      if (
        !parsed.hostname ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1"
      ) {
        if (/^\/[a-zA-Z]:\//.test(pathname)) {
          return normalizeFsPath(pathname.slice(1));
        }
        return normalizeFsPath(pathname);
      }

      // UNC: file://server/share/path
      return normalizeFsPath(`//${parsed.hostname}${pathname}`);
    } catch {
      // file:///C:/... style that URL rejects
      const stripped = trimmed.replace(/^file:\/*/i, "");
      if (WINDOWS_ABSOLUTE_RE.test(stripped)) {
        return normalizeFsPath(stripped);
      }
      return normalizeFsPath(`/${stripped}`);
    }
  }

  if (WINDOWS_ABSOLUTE_RE.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\\\")) {
    return normalizeFsPath(trimmed);
  }

  return null;
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function fsPathVariants(fsPath: string): string[] {
  const key = normalizeFsPath(fsPath);
  const variants = [key];
  if (WINDOWS_ABSOLUTE_RE.test(key) || key.startsWith("//")) {
    variants.push(key.replace(/\//g, "\\"));
  }
  return variants;
}

async function readImageBlob(fsPath: string): Promise<Blob> {
  let lastErr: unknown;
  for (const candidate of fsPathVariants(fsPath)) {
    try {
      const bytes = await readFile(candidate);
      return new Blob([bytes], { type: mimeForPath(candidate) });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image conversion did not produce a data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

async function pathToBlobUrl(fsPath: string): Promise<string> {
  const key = normalizeFsPath(fsPath);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const blob = await readImageBlob(key);
  const url = URL.createObjectURL(blob);
  blobCache.set(key, url);
  return url;
}

async function relativeImageCandidates(relativeUrl: string): Promise<string[]> {
  const { currentFilePath, rootDir } = useEditorStore.getState();
  const decoded = normalizeFsPath(relativeUrl);
  const candidates: string[] = [];
  if (currentFilePath) {
    candidates.push(await join(await dirname(currentFilePath), decoded));
  }
  if (rootDir) {
    candidates.push(await join(rootDir, decoded));
  }
  return candidates;
}

async function pathExists(fsPath: string): Promise<boolean> {
  const key = normalizeFsPath(fsPath);
  for (const candidate of fsPathVariants(key)) {
    try {
      if (await exists(candidate)) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Converts a local image reference into an export-safe data URL.
 * Returns null for remote HTTP(S) images, which intentionally stay external.
 */
export async function localImageToDataUrl(
  url: string,
  markdownFilePath: string,
): Promise<string | null> {
  let raw = url.trim();
  if (!raw) return null;
  if (raw.startsWith("<") && raw.endsWith(">")) {
    raw = raw.slice(1, -1).trim();
  }
  if (raw.startsWith("data:")) return raw;

  const isResolvedLocalUrl =
    raw.startsWith("blob:") ||
    raw.startsWith("asset:") ||
    raw.startsWith("http://asset.localhost") ||
    raw.startsWith("https://asset.localhost") ||
    raw.startsWith("tauri:");
  if (isResolvedLocalUrl) {
    const response = await fetch(raw);
    if (!response.ok) {
      throw new Error(`Failed to read resolved image URL (${response.status})`);
    }
    return blobToDataUrl(await response.blob());
  }
  if (REMOTE_URL_RE.test(raw)) return null;

  let fsPath = toAbsoluteFsPath(raw);
  if (!fsPath) {
    fsPath = await join(await dirname(markdownFilePath), normalizeFsPath(raw));
  }
  return blobToDataUrl(await readImageBlob(fsPath));
}

/**
 * Resolve a markdown/HTML image reference into a WebView-displayable URL.
 * Prefers reading the file into a blob URL (works for any path we can read);
 * falls back to convertFileSrc when needed.
 */
export async function resolveLocalImageUrl(url: string): Promise<string> {
  if (!url) return url;
  // CommonMark destination may arrive still wrapped: <file:///C:/...>
  let raw = url.trim();
  if (raw.startsWith("<") && raw.endsWith(">")) {
    raw = raw.slice(1, -1).trim();
  }
  if (isRemoteOrEmbedded(raw)) return raw;

  let fsPath = toAbsoluteFsPath(raw);

  if (!fsPath) {
    const candidates = await relativeImageCandidates(raw);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        fsPath = candidate;
        break;
      }
    }
    if (!fsPath && candidates[0]) fsPath = candidates[0];
  }

  if (!fsPath) return raw;
  fsPath = normalizeFsPath(fsPath);

  try {
    // Even if exists() fails under a strict scope match, try reading —
    // Windows drive scopes are finicky and readFile is the real gate.
    return await pathToBlobUrl(fsPath);
  } catch (err) {
    console.warn("Blob load failed, falling back to convertFileSrc:", fsPath, err);
  }

  try {
    // convertFileSrc on Windows prefers a normalized path with drive letter
    const forAsset =
      WINDOWS_ABSOLUTE_RE.test(fsPath) || fsPath.startsWith("//")
        ? fsPath.replace(/\//g, "\\")
        : fsPath;
    return convertFileSrc(forAsset);
  } catch (err) {
    console.error("convertFileSrc failed:", fsPath, err);
    return raw;
  }
}
