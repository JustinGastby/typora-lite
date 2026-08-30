import {
  readDir,
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { join, dirname } from "@tauri-apps/api/path";
import type { FileNode } from "../store/useEditorStore";
import {
  extractBlobUrls,
  getPersistedBlobPath,
  getRememberedImageBlob,
  rememberPersistedBlob,
} from "./imageBlobRegistry";

const IGNORED_ENTRIES = new Set([".git", ".DS_Store", "node_modules", ".idea", ".vscode"]);

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

/** `.md` / `.markdown` are treated as editable documents. */
export function isMarkdownFile(name: string): boolean {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return false;
  return MARKDOWN_EXTENSIONS.has(name.slice(idx + 1).toLowerCase());
}

/** Recursively walks a directory and returns a sorted tree (directories first, then files). */
export async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const entries = await readDir(dirPath);
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || IGNORED_ENTRIES.has(entry.name)) continue;

    const fullPath = await join(dirPath, entry.name);
    if (entry.isDirectory) {
      const children = await buildFileTree(fullPath);
      nodes.push({ name: entry.name, path: fullPath, isDirectory: true, children });
    } else if (isMarkdownFile(entry.name)) {
      nodes.push({ name: entry.name, path: fullPath, isDirectory: false });
    }
  }

  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  return nodes;
}

export async function loadMarkdownFile(path: string): Promise<string> {
  return readTextFile(path);
}

export async function saveMarkdownFile(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

async function ensureAssetsDir(markdownFilePath: string): Promise<string> {
  const dir = await dirname(markdownFilePath);
  const assetsDir = await join(dir, "assets");
  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }
  return assetsDir;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "image";
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
};

/**
 * Saves a pasted/dropped image next to the current markdown file's `assets/` folder
 * and returns a markdown-relative path (e.g. `assets/foo-171234.png`) suitable for
 * storing directly in the document source.
 */
export async function saveImageFile(markdownFilePath: string, file: File | Blob): Promise<string> {
  const assetsDir = await ensureAssetsDir(markdownFilePath);
  const buffer = new Uint8Array(await file.arrayBuffer());

  const nameFromFile = file instanceof File ? file.name : "";
  const dotIndex = nameFromFile.lastIndexOf(".");
  const ext = dotIndex !== -1 ? nameFromFile.slice(dotIndex) : EXT_BY_MIME[file.type] ?? ".png";
  const rawBase = dotIndex !== -1 ? nameFromFile.slice(0, dotIndex) : nameFromFile || "image";
  const baseName = sanitizeFileName(rawBase);
  const fileName = `${baseName}-${Date.now()}${ext}`;

  const destPath = await join(assetsDir, fileName);
  await writeFile(destPath, buffer);

  return `assets/${fileName}`;
}

/**
 * Rewrites markdown that still references transient `blob:` object URLs
 * into real files under `assets/`. Prefer the in-memory clipboard registry;
 * fetching `blob:http://tauri.localhost/…` often fails in the WebView.
 */
export async function persistBlobImages(
  markdownFilePath: string,
  content: string,
): Promise<string> {
  if (!content.includes("blob:")) return content;

  const blobUrls = extractBlobUrls(content);
  if (!blobUrls.length) return content;

  let updated = content;
  const failures: Array<{ url: string; error: unknown }> = [];
  for (const blobUrl of blobUrls) {
    try {
      const persistedPath = getPersistedBlobPath(blobUrl);
      if (persistedPath) {
        updated = updated.split(`<${blobUrl}>`).join(persistedPath);
        updated = updated.split(blobUrl).join(persistedPath);
        continue;
      }

      const remembered = getRememberedImageBlob(blobUrl);
      const blob = remembered ?? (await (await fetch(blobUrl)).blob());
      if (!blob || blob.size === 0) {
        throw new Error("empty blob");
      }
      const relPath = await saveImageFile(markdownFilePath, blob);
      rememberPersistedBlob(blobUrl, relPath);
      updated = updated.split(`<${blobUrl}>`).join(relPath);
      updated = updated.split(blobUrl).join(relPath);
    } catch (err) {
      console.error("Failed to persist pasted image before save:", blobUrl, err);
      failures.push({ url: blobUrl, error: err });
    }
  }

  if (failures.length) {
    const first = failures[0]!;
    throw new Error(
      `无法保存 ${failures.length} 张粘贴图片（${first.url}）：${String(first.error)}`,
    );
  }
  return updated;
}
