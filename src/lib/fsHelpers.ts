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

/**
 * Saves a pasted/dropped image next to the current markdown file's `assets/` folder
 * and returns a markdown-relative path (e.g. `assets/foo-171234.png`) suitable for
 * storing directly in the document source.
 */
export async function saveImageFile(markdownFilePath: string, file: File): Promise<string> {
  const assetsDir = await ensureAssetsDir(markdownFilePath);
  const buffer = new Uint8Array(await file.arrayBuffer());

  const dotIndex = file.name.lastIndexOf(".");
  const ext = dotIndex !== -1 ? file.name.slice(dotIndex) : ".png";
  const rawBase = dotIndex !== -1 ? file.name.slice(0, dotIndex) : file.name || "image";
  const baseName = sanitizeFileName(rawBase);
  const fileName = `${baseName}-${Date.now()}${ext}`;

  const destPath = await join(assetsDir, fileName);
  await writeFile(destPath, buffer);

  return `assets/${fileName}`;
}
