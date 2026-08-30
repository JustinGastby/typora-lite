import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import { dirname, join, normalize, sep } from "@tauri-apps/api/path";
import { stat } from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";
import {
  buildFileTree,
  isMarkdownFile,
  loadMarkdownFile,
} from "./fsHelpers";
import { saveDocumentSnapshot } from "./documentPersistence";
import { normalizeHtmlImages } from "./normalizeHtmlImages";
import { persistLastFolder } from "./settingsStore";

let transitionQueue: Promise<void> = Promise.resolve();

function queueDocumentTransition<T>(operation: () => Promise<T>): Promise<T> {
  const result = transitionQueue.then(operation, operation);
  transitionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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
  await queueDocumentTransition(async () => {
    const name = fileNameFromPath(path);
    if (!isMarkdownFile(name)) {
      await notifyUnsupportedFormat(name);
      return;
    }

    if (useEditorStore.getState().currentFilePath === path) return;
    const raw = await loadMarkdownFile(path);
    // Typora-style HTML <img> tags aren't rendered by Crepe; convert to Markdown.
    const content = normalizeHtmlImages(raw);

    // Read the target first. The user can keep typing while disk I/O is in
    // flight; the transition gate below then flushes that latest content.
    if (!(await prepareForDocumentTransition())) return;
    useEditorStore.getState().openFile(path, content);

    const dir = await dirname(path);
    const rootDir = useEditorStore.getState().rootDir;
    if (!rootDir || !(await isPathInsideDirectory(path, rootDir))) {
      try {
        await loadFolder(dir);
      } catch (err) {
        console.error("Failed to load sidebar folder for opened file:", err);
      }
    }
  });
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

export async function createNewFile(): Promise<void> {
  await queueDocumentTransition(async () => {
    if (!(await prepareForDocumentTransition())) return;
    useEditorStore.getState().newFile();
  });
}

async function saveAsNewFile(
  content: string,
  documentRevision: number,
): Promise<boolean> {
  const rootDir = useEditorStore.getState().rootDir;
  const target = await save({
    title: "保存文件",
    defaultPath: rootDir ? await join(rootDir, "未命名.md") : "未命名.md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!target) return false;

  const { persistedContent, skipped } = await saveDocumentSnapshot(
    target,
    content,
    documentRevision,
  );
  if (skipped) return false;
  useEditorStore
    .getState()
    .applyUntitledSave(target, documentRevision, persistedContent);

  const dir = await dirname(target);
  if (useEditorStore.getState().rootDir === dir) {
    await loadFolder(dir);
  }
  return true;
}

export async function saveCurrentFile(): Promise<boolean> {
  const {
    currentFilePath,
    content,
    savedContent,
    isUntitled,
    documentRevision,
    externalFileChange,
  } = useEditorStore.getState();

  if (isUntitled) {
    return saveAsNewFile(content, documentRevision);
  }
  if (!currentFilePath) return false;

  if (content === savedContent) return true;
  if (externalFileChange?.path === currentFilePath) {
    throw new Error("文件已被外部修改，请先刷新后再保存。");
  }

  const { persistedContent, skipped } = await saveDocumentSnapshot(
    currentFilePath,
    content,
    documentRevision,
  );
  if (!skipped) {
    useEditorStore
      .getState()
      .applySavedSnapshot(currentFilePath, documentRevision, persistedContent);
  }
  return !skipped;
}

export function reloadExternallyChangedFile(): Promise<void> {
  return queueDocumentTransition(async () => {
    const initialState = useEditorStore.getState();
    const path = initialState.externalFileChange?.path;
    if (!path || initialState.currentFilePath !== path) return;

    try {
      // Read immediately before applying so repeated external changes do not
      // reload an older snapshot captured by a previous watcher event.
      const content = normalizeHtmlImages(await loadMarkdownFile(path));
      const currentState = useEditorStore.getState();
      if (
        currentState.currentFilePath !== path ||
        currentState.externalFileChange?.path !== path
      ) {
        return;
      }

      if (currentState.content !== currentState.savedContent) {
        const shouldReload = await confirm(
          "当前文档还有本地修改。刷新将丢弃这些修改并载入磁盘上的最新内容。",
          {
            title: "文件已在外部修改",
            kind: "warning",
            okLabel: "刷新",
            cancelLabel: "取消",
          },
        );
        if (!shouldReload) return;
      }

      if (useEditorStore.getState().currentFilePath !== path) return;
      useEditorStore.getState().openFile(path, content);
    } catch (err) {
      console.error("Failed to reload externally changed file:", err);
      await message(`无法刷新文件。\n\n${String(err)}`, {
        title: "Typora Lite",
        kind: "error",
      });
    }
  });
}

async function flushCurrentDocument(): Promise<boolean> {
  while (true) {
    const { currentFilePath, content, savedContent } = useEditorStore.getState();
    if (content === savedContent) return true;
    if (!currentFilePath) return false;
    await saveCurrentFile();
  }
}

/**
 * Flushes an existing document before leaving it. Untitled dirty documents
 * need an explicit save/discard/cancel choice because they have no disk path.
 */
async function prepareForDocumentTransition(): Promise<boolean> {
  const { currentFilePath, content, savedContent, isUntitled } =
    useEditorStore.getState();
  if (content === savedContent) return true;

  try {
    if (currentFilePath) {
      return await flushCurrentDocument();
    }
    if (!isUntitled) return true;

    const choice = await message("当前未命名文档尚未保存。要先保存吗？", {
      title: "Typora Lite",
      kind: "warning",
      buttons: "YesNoCancel",
    });
    if (choice === "Cancel") return false;
    if (choice === "No") return true;
    if (!(await saveCurrentFile())) return false;
    return await flushCurrentDocument();
  } catch (err) {
    console.error("Failed to save before leaving the document:", err);
    await message(`保存失败，已取消当前操作。\n\n${String(err)}`, {
      title: "Typora Lite",
      kind: "error",
    });
    return false;
  }
}

/** Runs the same save/confirm gate used by file switches before app shutdown. */
export function prepareToClose(): Promise<boolean> {
  return queueDocumentTransition(() => prepareForDocumentTransition());
}

async function isPathInsideDirectory(path: string, directory: string): Promise<boolean> {
  const [normalizedPath, normalizedDirectory, separator] = await Promise.all([
    normalize(path),
    normalize(directory),
    sep(),
  ]);
  const caseInsensitive = separator === "\\";
  const filePath = caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const rootPath = caseInsensitive
    ? normalizedDirectory.toLowerCase()
    : normalizedDirectory;
  const rootPrefix = rootPath.endsWith(separator)
    ? rootPath
    : `${rootPath}${separator}`;
  return filePath === rootPath || filePath.startsWith(rootPrefix);
}
