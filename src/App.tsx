import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEditorStore } from "./store/useEditorStore";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { OutlinePanel } from "./components/OutlinePanel";
import { MilkdownEditor } from "./components/MilkdownEditor";
import { useAutosave } from "./lib/useAutosave";
import { useExternalFileWatcher } from "./lib/useExternalFileWatcher";
import {
  createNewFile,
  loadFolder,
  openDroppedPaths,
  openFileDialog,
  openFolderDialog,
  prepareToClose,
  reloadExternallyChangedFile,
  saveCurrentFile,
} from "./lib/actions";
import {
  loadLastFolder,
  loadPersistedTheme,
  loadPersistedSidebarWidth,
  persistSidebarWidth,
  clampSidebarWidth,
} from "./lib/settingsStore";
import "./App.css";

const MENU_ACTIONS: Record<string, () => void> = {
  "menu-new-file": () => createNewFile().catch((err) => console.error(err)),
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
        <button onClick={() => createNewFile().catch((err) => console.error(err))}>
          新建文件
        </button>
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
  useExternalFileWatcher();

  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const isUntitled = useEditorStore((s) => s.isUntitled);
  const editorInstanceId = useEditorStore((s) => s.editorInstanceId);
  const externalFilePath = useEditorStore(
    (s) => s.externalFileChange?.path ?? null,
  );
  const hasLocalChanges = useEditorStore(
    (s) => s.content !== s.savedContent,
  );
  const sidebarView = useEditorStore((s) => s.sidebarView);
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const sidebarWidth = useEditorStore((s) => s.sidebarWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let closing = false;
    const cleanups: Array<() => void> = [];
    const appWindow = getCurrentWindow();

    loadPersistedSidebarWidth()
      .then((width) => useEditorStore.getState().setSidebarWidth(width))
      .catch((err) => console.error("Failed to load sidebar width:", err));

    loadPersistedTheme()
      .then((theme) => {
        if (theme) useEditorStore.getState().setTheme(theme);
      })
      .catch((err) => console.error("Failed to load saved theme:", err));

    // Prefer OS-provided open paths over restoring the last folder.
    const restoreFolderUnlessOpening = (async () => {
      try {
        // Small yield so OS-open drain can claim priority first.
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        const { currentFilePath, isUntitled } = useEditorStore.getState();
        if (currentFilePath || isUntitled) return;
        const folder = await loadLastFolder();
        if (cancelled || !folder) return;
        const state = useEditorStore.getState();
        if (state.currentFilePath || state.isUntitled) return;
        await loadFolder(folder);
      } catch (err) {
        console.error("Failed to restore last folder:", err);
      }
    })();
    void restoreFolderUnlessOpening;

    Object.entries(MENU_ACTIONS).forEach(([event, handler]) => {
      listen(event, () => handler()).then((unlisten) => {
        if (cancelled) unlisten();
        else cleanups.push(unlisten);
      });
    });

    appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          if (await prepareToClose()) {
            await appWindow.destroy();
          }
        } catch (err) {
          console.error("Failed to prepare window close:", err);
        } finally {
          closing = false;
        }
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else cleanups.push(unlisten);
      });

    // Drag Markdown / folder onto the app window.
    appWindow
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        openDroppedPaths(event.payload.paths).catch((err) =>
          console.error("Failed to open dropped paths:", err),
        );
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else cleanups.push(unlisten);
      });

    // OS "Open With" / dock drop / double-click.
    // Rust only pings `app-open-paths`; paths always come from take_pending
    // so cold-start emits (before JS listens) are not lost, and we never
    // double-open from emit payload + take.
    (async () => {
      async function drainPendingOpenPaths() {
        const paths = await invoke<string[]>("take_pending_open_paths");
        if (!paths.length || cancelled) return;
        await openDroppedPaths(paths);
      }

      const unlisten = await listen("app-open-paths", () => {
        drainPendingOpenPaths().catch((err) =>
          console.error("Failed to open OS-provided paths:", err),
        );
      });
      if (cancelled) {
        unlisten();
        return;
      }
      cleanups.push(unlisten);

      try {
        await drainPendingOpenPaths();
      } catch (err) {
        console.error("Failed to read pending open paths:", err);
      }

      // macOS Opened can arrive slightly after the first drain on cold start.
      const retryId = window.setTimeout(() => {
        drainPendingOpenPaths().catch((err) =>
          console.error("Failed to retry pending open paths:", err),
        );
      }, 400);
      cleanups.push(() => window.clearTimeout(retryId));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="app-shell">
      <Toolbar />
      <div className="app-body">
        {sidebarVisible && (
          <div className="app-sidebar-wrap" style={{ width: sidebarWidth }}>
            <aside className="app-sidebar">
              {sidebarView === "files" ? <Sidebar /> : <OutlinePanel />}
            </aside>
            <div
              className="sidebar-resize-handle"
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
                document.documentElement.classList.add("is-resizing-sidebar");
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag) return;
                const next = clampSidebarWidth(drag.startWidth + event.clientX - drag.startX);
                useEditorStore.getState().setSidebarWidth(next);
              }}
              onPointerUp={(event) => {
                if (!dragRef.current) return;
                dragRef.current = null;
                document.documentElement.classList.remove("is-resizing-sidebar");
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  /* already released */
                }
                persistSidebarWidth(useEditorStore.getState().sidebarWidth).catch((err) =>
                  console.error("Failed to persist sidebar width:", err),
                );
              }}
              onPointerCancel={() => {
                dragRef.current = null;
                document.documentElement.classList.remove("is-resizing-sidebar");
              }}
            />
          </div>
        )}
        <main className="app-main">
          {currentFilePath && externalFilePath === currentFilePath && (
            <div className="external-file-change-banner" role="status">
              <span>
                文件已被外部修改
                {hasLocalChanges ? "，自动保存已暂停" : ""}
              </span>
              <button
                type="button"
                onClick={() =>
                  reloadExternallyChangedFile().catch((err) =>
                    console.error(err),
                  )
                }
              >
                刷新
              </button>
            </div>
          )}
          {currentFilePath || isUntitled ? (
            <MilkdownEditor
              key={`${editorInstanceId}:${currentFilePath ?? "untitled"}`}
            />
          ) : (
            <WelcomeScreen />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
