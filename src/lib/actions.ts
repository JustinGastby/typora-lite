import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import { dirname, join, normalize, sep } from "@tauri-apps/api/path";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";
import type { ExternalFileChange } from "../store/useEditorStore";
import {
  buildFileTree,
  isMarkdownFile,
  loadMarkdownFile,
} from "./fsHelpers";
import { saveDocumentSnapshot } from "./documentPersistence";
import { normalizeHtmlImages } from "./normalizeHtmlImages";
import { persistLastFolder } from "./settingsStore";

let transitionQueue: Promise<void> = Promise.resolve();
let folderLoadGeneration = 0;

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
  const generation = ++folderLoadGeneration;
  const tree = await buildFileTree(dirPath);
  if (generation !== folderLoadGeneration) return;
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
    // Invalidate a slower startup-folder restore before reading the OS-opened
    // file. A later loadFolder call for this path receives a newer generation.
    folderLoadGeneration += 1;
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

async function readSaveTargetBaseline(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  return normalizeHtmlImages(await loadMarkdownFile(path));
}

async function saveAsNewFile(): Promise<boolean> {
  const rootDir = useEditorStore.getState().rootDir;
  const target = await save({
    title: "保存文件",
    defaultPath: rootDir ? await join(rootDir, "未命名.md") : "未命名.md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!target) return false;

  // Re-read after the dialog — the user may keep typing while it is open.
  const { content, documentRevision, isUntitled } = useEditorStore.getState();
  if (!isUntitled) return false;

  const targetBaseline = await readSaveTargetBaseline(target);
  const { persistedContent, skipped, conflict } = await saveDocumentSnapshot(
    target,
    content,
    documentRevision,
    targetBaseline,
  );
  if (conflict) {
    await message("目标文件在保存过程中发生了变化，请重新选择保存位置。", {
      title: "保存已取消",
      kind: "warning",
    });
    return false;
  }
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
    return saveAsNewFile();
  }
  if (!currentFilePath) return false;

  if (content === savedContent) return true;
  if (externalFileChange?.path === currentFilePath) {
    throw new Error(
      externalFileChange.kind === "missing"
        ? "文件已被外部删除或移动，请先另存为。"
        : "文件已被外部修改，请先刷新后再保存。",
    );
  }

  const { persistedContent, skipped, conflict } = await saveDocumentSnapshot(
    currentFilePath,
    content,
    documentRevision,
    savedContent,
  );
  if (conflict) {
    useEditorStore.getState().setExternalFileChange(conflict);
    throw new Error(
      conflict.kind === "missing"
        ? "文件已被外部删除或移动，请先另存为。"
        : "文件已被外部修改，请先刷新后再保存。",
    );
  }
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
    const change = initialState.externalFileChange;
    const path = change?.path;
    if (!path || initialState.currentFilePath !== path) return;
    if (change.kind !== "modified") return;

    try {
      if (initialState.content !== initialState.savedContent) {
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

      // Read only after the user confirms so a late external write is not missed.
      const content = normalizeHtmlImages(await loadMarkdownFile(path));
      const currentState = useEditorStore.getState();
      if (
        currentState.currentFilePath !== path ||
        currentState.externalFileChange?.path !== path ||
        currentState.externalFileChange.kind !== "modified"
      ) {
        return;
      }
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

export function saveMissingFileAs(): Promise<void> {
  return queueDocumentTransition(async () => {
    const state = useEditorStore.getState();
    const change = state.externalFileChange;
    const sourcePath = state.currentFilePath;
    if (
      !sourcePath ||
      change?.kind !== "missing" ||
      change.path !== sourcePath
    ) {
      return;
    }

    const target = await save({
      title: "文件已被删除或移动，请另存为",
      defaultPath: sourcePath,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (!target) return;

    // Re-read after the dialog — the user may keep typing while it is open.
    const latest = useEditorStore.getState();
    if (
      latest.currentFilePath !== sourcePath ||
      latest.externalFileChange?.kind !== "missing" ||
      latest.externalFileChange.path !== sourcePath
    ) {
      return;
    }

    const targetBaseline = await readSaveTargetBaseline(target);
    const { persistedContent, skipped, conflict } = await saveDocumentSnapshot(
      target,
      latest.content,
      latest.documentRevision,
      targetBaseline,
    );
    if (conflict) {
      await message("目标文件在保存过程中发生了变化，请重新选择保存位置。", {
        title: "另存为已取消",
        kind: "warning",
      });
      return;
    }
    if (skipped) return;

    useEditorStore
      .getState()
      .applyFileSaveAs(
        sourcePath,
        target,
        latest.documentRevision,
        persistedContent,
      );

    const dir = await dirname(target);
    const rootDir = useEditorStore.getState().rootDir;
    if (rootDir && (await isPathInsideDirectory(target, rootDir))) {
      await loadFolder(rootDir);
    } else {
      await loadFolder(dir);
    }
  });
}

export function closeMissingFile(): Promise<void> {
  return queueDocumentTransition(async () => {
    const state = useEditorStore.getState();
    const change = state.externalFileChange;
    if (
      !state.currentFilePath ||
      change?.kind !== "missing" ||
      change.path !== state.currentFilePath
    ) {
      return;
    }

    if (state.content !== state.savedContent) {
      const shouldClose = await confirm(
        "当前文件已被删除或移动，关闭将丢弃本地尚未保存的修改。",
        {
          title: "关闭当前文档",
          kind: "warning",
          okLabel: "关闭",
          cancelLabel: "取消",
        },
      );
      if (!shouldClose) return;
    }
    useEditorStore.getState().closeFile();
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

function confirmDiscardExternalConflict(
  change: ExternalFileChange,
): Promise<boolean> {
  return confirm(
    change.kind === "missing"
      ? "当前文件已被外部删除或移动。要丢弃本地修改并继续吗？"
      : "当前文件已被外部修改。要丢弃本地修改并继续吗？",
    {
      title: "未保存的本地修改",
      kind: "warning",
      okLabel: "丢弃并继续",
      cancelLabel: "取消",
    },
  );
}

/**
 * Flushes an existing document before leaving it. Untitled dirty documents
 * need an explicit save/discard/cancel choice because they have no disk path.
 */
async function prepareForDocumentTransition(): Promise<boolean> {
  const {
    currentFilePath,
    content,
    savedContent,
    isUntitled,
    externalFileChange,
  } =
    useEditorStore.getState();
  if (content === savedContent) return true;

  try {
    if (
      currentFilePath &&
      externalFileChange?.path === currentFilePath
    ) {
      return confirmDiscardExternalConflict(externalFileChange);
    }
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
    // The write preflight may discover a conflict before the watcher does.
    // Offer the same discard/cancel choice on this first transition attempt.
    const latest = useEditorStore.getState();
    if (
      latest.currentFilePath &&
      latest.content !== latest.savedContent &&
      latest.externalFileChange?.path === latest.currentFilePath
    ) {
      return confirmDiscardExternalConflict(latest.externalFileChange);
    }
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
