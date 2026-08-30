import { useEffect } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { createNewFile, openFolderDialog, openFileDialog, saveCurrentFile } from "../lib/actions";
import { applyTheme, THEME_OPTIONS } from "../lib/themeLoader";
import { persistTheme } from "../lib/settingsStore";
import type { ThemeName } from "../store/useEditorStore";

export function Toolbar() {
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const isUntitled = useEditorStore((s) => s.isUntitled);
  const isDirty = useEditorStore((s) => s.content !== s.savedContent);
  const sidebarView = useEditorStore((s) => s.sidebarView);
  const setSidebarView = useEditorStore((s) => s.setSidebarView);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme).catch((err) => console.error("Failed to persist theme:", err));
  }, [theme]);

  const fileName = currentFilePath
    ? currentFilePath.split(/[\\/]/).pop()
    : isUntitled
      ? "未命名.md"
      : null;
  const canSave = isUntitled || (currentFilePath !== null && isDirty);

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={toggleSidebar} title="切换侧边栏">☰</button>
        <button onClick={() => createNewFile().catch((e) => console.error(e))}>
          新建文件
        </button>
        <button onClick={() => openFolderDialog().catch((e) => console.error(e))}>
          打开文件夹
        </button>
        <button onClick={() => openFileDialog().catch((e) => console.error(e))}>
          打开文件
        </button>
        <button
          onClick={() => saveCurrentFile().catch((e) => console.error(e))}
          disabled={!canSave}
        >
          保存
        </button>
        <button
          onClick={() =>
            import("../lib/exportActions")
              .then((m) => m.exportCurrentFileToHtml())
              .catch((e) => console.error(e))
          }
          disabled={!currentFilePath}
        >
          导出 HTML
        </button>
        <button
          onClick={() =>
            import("../lib/exportActions")
              .then((m) => m.exportCurrentFileToPdf())
              .catch((e) => console.error(e))
          }
          disabled={!currentFilePath}
        >
          导出 PDF
        </button>
      </div>

      <div className="toolbar-title">
        {fileName ? (
          <span>
            {fileName}
            {isDirty ? " •" : ""}
          </span>
        ) : (
          <span className="toolbar-title-placeholder">Typora Lite</span>
        )}
      </div>

      <div className="toolbar-group">
        <div className="sidebar-tabs">
          <button
            className={sidebarView === "files" ? "active" : ""}
            onClick={() => setSidebarView("files")}
          >
            文件
          </button>
          <button
            className={sidebarView === "outline" ? "active" : ""}
            onClick={() => setSidebarView("outline")}
          >
            大纲
          </button>
        </div>
        <select
          className="theme-select"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeName)}
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
