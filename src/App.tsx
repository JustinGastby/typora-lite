import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEditorStore } from "./store/useEditorStore";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { OutlinePanel } from "./components/OutlinePanel";
import { MilkdownEditor } from "./components/MilkdownEditor";
import { useAutosave } from "./lib/useAutosave";
import {
  createNewFile,
  loadFolder,
  openDroppedPaths,
  openFileDialog,
  openFolderDialog,
  saveCurrentFile,
} from "./lib/actions";
import { loadLastFolder, loadPersistedTheme } from "./lib/settingsStore";
import "./App.css";

const MENU_ACTIONS: Record<string, () => void> = {
  "menu-new-file": () => createNewFile(),
  "menu-open-file": () => openFileDialog().catch((err) => console.error(err)),
  "menu-open-folder": () => openFolderDialog().catch((err) => console.error(err)),
  "menu-save": () => saveCurrentFile().catch((err) => console.error(err)),
  "menu-export-html": () =>
    import("./lib/exportActions")
      .then((m) => m.exportCurrentFileToHtml())
      .catch((err) => console.error(err)),
  "menu-export-pdf": () =>
    import("./lib/exportActions")
      .then((m) => m.exportCurrentFileToPdf())
      .catch((err) => console.error(err)),
  "menu-toggle-sidebar": () => useEditorStore.getState().toggleSidebar(),
};

function WelcomeScreen() {
  return (
    <div className="welcome-screen">
      <h1>Typora Lite</h1>
      <p>新建、打开，或把 Markdown 文件 / 文件夹拖进窗口开始写作</p>
      <div className="welcome-actions">
        <button onClick={() => createNewFile()}>新建文件</button>
        <button onClick={() => openFolderDialog().catch((err) => console.error(err))}>
          打开文件夹
        </button>
        <button onClick={() => openFileDialog().catch((err) => console.error(err))}>
          打开文件
        </button>
      </div>
    </div>
  );
}

function App() {
  useAutosave();

  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const isUntitled = useEditorStore((s) => s.isUntitled);
  const sidebarView = useEditorStore((s) => s.sidebarView);
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);

  useEffect(() => {
    loadPersistedTheme()
      .then((theme) => {
        if (theme) useEditorStore.getState().setTheme(theme);
      })
      .catch((err) => console.error("Failed to load saved theme:", err));

    loadLastFolder()
      .then((folder) => (folder ? loadFolder(folder) : undefined))
      .catch((err) => console.error("Failed to restore last folder:", err));

    const unlistenPromises = Object.entries(MENU_ACTIONS).map(([event, handler]) =>
      listen(event, () => handler()),
    );

    // Drag Markdown / folder onto the app window.
    const unlistenDragDrop = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      openDroppedPaths(event.payload.paths).catch((err) =>
        console.error("Failed to open dropped paths:", err),
      );
    });

    // OS "Open With" / dock drop / double-click (and Windows argv).
    const unlistenOpened = listen<string[]>("app-open-paths", (event) => {
      openDroppedPaths(event.payload).catch((err) =>
        console.error("Failed to open OS-provided paths:", err),
      );
    });

    invoke<string[]>("take_pending_open_paths")
      .then((paths) => (paths.length ? openDroppedPaths(paths) : undefined))
      .catch((err) => console.error("Failed to read pending open paths:", err));

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
      unlistenDragDrop.then((unlisten) => unlisten());
      unlistenOpened.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        {sidebarVisible && (
          <aside className="app-sidebar">
            {sidebarView === "files" ? <Sidebar /> : <OutlinePanel />}
          </aside>
        )}
        <main className="app-main">
          {currentFilePath || isUntitled ? (
            <MilkdownEditor key={currentFilePath ?? "untitled"} />
          ) : (
            <WelcomeScreen />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
