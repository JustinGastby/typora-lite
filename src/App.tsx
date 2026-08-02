import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "./store/useEditorStore";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { OutlinePanel } from "./components/OutlinePanel";
import { MilkdownEditor } from "./components/MilkdownEditor";
import { useAutosave } from "./lib/useAutosave";
import { loadFolder, openFileDialog, openFolderDialog, saveCurrentFile } from "./lib/actions";
import { loadLastFolder, loadPersistedTheme } from "./lib/settingsStore";
import "./App.css";

const MENU_ACTIONS: Record<string, () => void> = {
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
      <p>打开一个文件夹或 Markdown 文件开始写作</p>
    </div>
  );
}

function App() {
  useAutosave();

  const currentFilePath = useEditorStore((s) => s.currentFilePath);
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

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
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
          {currentFilePath ? <MilkdownEditor key={currentFilePath} /> : <WelcomeScreen />}
        </main>
      </div>
    </div>
  );
}

export default App;
