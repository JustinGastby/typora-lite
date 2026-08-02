import { open } from "@tauri-apps/plugin-dialog";
import { dirname } from "@tauri-apps/api/path";
import { useEditorStore } from "../store/useEditorStore";
import { buildFileTree, loadMarkdownFile, saveMarkdownFile } from "./fsHelpers";
import { persistLastFolder } from "./settingsStore";

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
  const content = await loadMarkdownFile(path);
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

export async function saveCurrentFile(): Promise<void> {
  const { currentFilePath, content, savedContent, markSaved } = useEditorStore.getState();
  if (!currentFilePath || content === savedContent) return;
  await saveMarkdownFile(currentFilePath, content);
  markSaved();
}
