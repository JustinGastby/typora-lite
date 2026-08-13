import { message, open, save } from "@tauri-apps/plugin-dialog";
import { dirname, join } from "@tauri-apps/api/path";
import { stat } from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";
import {
  buildFileTree,
  isMarkdownFile,
  loadMarkdownFile,
  persistBlobImages,
  saveMarkdownFile,
} from "./fsHelpers";
import { normalizeHtmlImages } from "./normalizeHtmlImages";
import { persistLastFolder } from "./settingsStore";

async function notifyUnsupportedFormat(fileName: string): Promise<void> {
  await message(`暂不支持打开「${fileName}」，目前仅支持 .md / .markdown 文件。`, {
    title: "Typora Lite",
    kind: "info",
  });
}

export async function loadFolder(dirPath: string): Promise<void> {
  const tree = await buildFileTree(dirPath);
  useEditorStore.getState().setRootDir(dirPath);
  useEditorStore.getState().setFileTree(tree);
  useEditorStore.getState().setSidebarView("files");
  persistLastFolder(dirPath).catch((err) => console.error("Failed to persist last folder:", err));
}

export async function openFolderDialog(): Promise<void> {
  const selected = await open({ directory: true, multiple: false, title: "打开文件夹" });
  if (!selected || Array.isArray(selected)) return;
  await loadFolder(selected);
}

export async function openFileAtPath(path: string): Promise<void> {
  const name = fileNameFromPath(path);
  if (!isMarkdownFile(name)) {
    await notifyUnsupportedFormat(name);
    return;
  }

  const raw = await loadMarkdownFile(path);
  // Typora-style HTML <img> tags aren't rendered by Crepe; convert to Markdown.
  const content = normalizeHtmlImages(raw);
  useEditorStore.getState().openFile(path, content);

  const dir = await dirname(path);
  if (useEditorStore.getState().rootDir !== dir) {
    try {
      await loadFolder(dir);
    } catch (err) {
      console.error("Failed to load sidebar folder for opened file:", err);
    }
  }
}

export async function openFileDialog(): Promise<void> {
  const selected = await open({
    multiple: false,
    title: "打开 Markdown 文件",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!selected || Array.isArray(selected)) return;
  await openFileAtPath(selected);
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Handles paths dropped on the window or opened via OS file association
 * (dock / "Open With" / double-click). Folders and Markdown files only.
 */
export async function openDroppedPaths(paths: string[]): Promise<void> {
  if (!paths.length) return;

  const unsupported: string[] = [];

  for (const path of paths) {
    try {
      const info = await stat(path);
      if (info.isDirectory) {
        await loadFolder(path);
        return;
      }
    } catch (err) {
      console.error("Failed to stat dropped path:", path, err);
      continue;
    }

    const name = fileNameFromPath(path);
    if (isMarkdownFile(name)) {
      await openFileAtPath(path);
      return;
    }
    unsupported.push(name);
  }

  if (unsupported.length) {
    await notifyUnsupportedFormat(unsupported[0]!);
  }
}

export function createNewFile(): void {
  useEditorStore.getState().newFile();
}

async function saveAsNewFile(content: string): Promise<void> {
  const rootDir = useEditorStore.getState().rootDir;
  const target = await save({
    title: "保存文件",
    defaultPath: rootDir ? await join(rootDir, "未命名.md") : "未命名.md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!target) return;

  const finalContent = await persistBlobImages(target, content);
  await saveMarkdownFile(target, finalContent);
  useEditorStore.getState().openFile(target, finalContent);

  const dir = await dirname(target);
  if (useEditorStore.getState().rootDir === dir) {
    await loadFolder(dir);
  }
}

export async function saveCurrentFile(): Promise<void> {
  const { currentFilePath, content, savedContent, isUntitled, markSaved } =
    useEditorStore.getState();

  if (isUntitled || !currentFilePath) {
    await saveAsNewFile(content);
    return;
  }

  if (content === savedContent) return;

  const finalContent = await persistBlobImages(currentFilePath, content);
  await saveMarkdownFile(currentFilePath, finalContent);
  if (finalContent !== content) {
    useEditorStore.getState().updateContent(finalContent);
  }
  markSaved();
}
