import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { dirname, join, tempDir } from "@tauri-apps/api/path";
import { useEditorStore } from "../store/useEditorStore";
import { renderExportHtml } from "./markdownExport";

function titleFromPath(path: string | null): string {
  if (!path) return "Untitled";
  const name = path.split(/[\\/]/).pop() ?? "Untitled";
  return name.replace(/\.(md|markdown)$/i, "");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_") || "export";
}

/** Prompts for a destination and writes a fully self-contained HTML export of the current document. */
export async function exportCurrentFileToHtml(): Promise<void> {
  const { currentFilePath, content } = useEditorStore.getState();
  if (!currentFilePath) return;

  const title = titleFromPath(currentFilePath);
  const html = await renderExportHtml(content, title, {
    sourcePath: currentFilePath,
  });

  const defaultDir = await dirname(currentFilePath);
  const target = await save({
    title: "导出为 HTML",
    defaultPath: await join(defaultDir, `${title}.html`),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!target) return;

  await writeTextFile(target, html);
}

/**
 * Writes a print-ready HTML file to a temp folder and opens it with the
 * system's default browser, which auto-triggers the native print dialog.
 * The user can then choose "Save as PDF" from there (macOS/Windows both
 * ship this as a built-in printer option).
 */
export async function exportCurrentFileToPdf(): Promise<void> {
  const { currentFilePath, content } = useEditorStore.getState();
  if (!currentFilePath) return;

  const title = titleFromPath(currentFilePath);
  const html = await renderExportHtml(content, title, {
    autoPrint: true,
    sourcePath: currentFilePath,
  });

  const printDir = await join(await tempDir(), "typora-lite-print");
  if (!(await exists(printDir))) {
    await mkdir(printDir, { recursive: true });
  }
  const tempPath = await join(printDir, `${sanitizeFileName(title)}-${Date.now()}.html`);
  await writeTextFile(tempPath, html);
  await openPath(tempPath);
}
