import { create } from "zustand";

export type ThemeName =
  | "classic"
  | "classic-dark"
  | "github"
  | "sepia"
  | "forest"
  | "midnight";

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface ExternalFileChange {
  path: string;
  content: string;
}

export type SidebarView = "files" | "outline";

interface EditorState {
  rootDir: string | null;
  fileTree: FileNode[];
  currentFilePath: string | null;
  isUntitled: boolean;
  content: string;
  savedContent: string;
  documentRevision: number;
  editorInstanceId: number;
  externalFileChange: ExternalFileChange | null;
  theme: ThemeName;
  outline: HeadingItem[];
  sidebarView: SidebarView;
  sidebarVisible: boolean;
  sidebarWidth: number;

  setRootDir: (dir: string | null) => void;
  setFileTree: (tree: FileNode[]) => void;
  openFile: (path: string, content: string) => void;
  newFile: () => void;
  closeFile: () => void;
  updateContent: (markdown: string) => void;
  applySavedSnapshot: (
    path: string,
    sourceRevision: number,
    persistedContent: string,
  ) => void;
  applyUntitledSave: (
    path: string,
    sourceRevision: number,
    persistedContent: string,
  ) => void;
  setExternalFileChange: (change: ExternalFileChange) => void;
  clearExternalFileChange: (path?: string) => void;
  setTheme: (theme: ThemeName) => void;
  setOutline: (outline: HeadingItem[]) => void;
  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  rootDir: null,
  fileTree: [],
  currentFilePath: null,
  isUntitled: false,
  content: "",
  savedContent: "",
  documentRevision: 0,
  editorInstanceId: 0,
  externalFileChange: null,
  theme: "classic",
  outline: [],
  sidebarView: "files",
  sidebarVisible: true,
  sidebarWidth: 240,

  setRootDir: (dir) => set({ rootDir: dir }),
  setFileTree: (tree) => set({ fileTree: tree }),
  openFile: (path, content) =>
    set((state) => ({
      currentFilePath: path,
      isUntitled: false,
      content,
      savedContent: content,
      documentRevision: state.documentRevision + 1,
      editorInstanceId: state.editorInstanceId + 1,
      externalFileChange: null,
      outline: [],
    })),
  newFile: () =>
    set((state) => ({
      currentFilePath: null,
      isUntitled: true,
      content: "",
      savedContent: "",
      documentRevision: state.documentRevision + 1,
      editorInstanceId: state.editorInstanceId + 1,
      externalFileChange: null,
      outline: [],
    })),
  closeFile: () =>
    set((state) => ({
      currentFilePath: null,
      isUntitled: false,
      content: "",
      savedContent: "",
      documentRevision: state.documentRevision + 1,
      editorInstanceId: state.editorInstanceId + 1,
      externalFileChange: null,
      outline: [],
    })),
  updateContent: (markdown) =>
    set((state) =>
      state.content === markdown
        ? state
        : { content: markdown, documentRevision: state.documentRevision + 1 },
    ),
  applySavedSnapshot: (path, sourceRevision, persistedContent) =>
    set((state) => {
      if (state.currentFilePath !== path) return state;
      if (state.documentRevision === sourceRevision) {
        return { content: persistedContent, savedContent: persistedContent };
      }
      return { savedContent: persistedContent };
    }),
  applyUntitledSave: (path, sourceRevision, persistedContent) =>
    set((state) => {
      if (!state.isUntitled || state.currentFilePath) return state;
      return {
        currentFilePath: path,
        isUntitled: false,
        content:
          state.documentRevision === sourceRevision ? persistedContent : state.content,
        savedContent: persistedContent,
        externalFileChange: null,
        outline: [],
      };
    }),
  setExternalFileChange: (change) => set({ externalFileChange: change }),
  clearExternalFileChange: (path) =>
    set((state) => {
      if (!state.externalFileChange) return state;
      if (path && state.externalFileChange.path !== path) return state;
      return { externalFileChange: null };
    }),
  setTheme: (theme) => set({ theme }),
  setOutline: (outline) => set({ outline }),
  setSidebarView: (view) => set({ sidebarView: view, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
