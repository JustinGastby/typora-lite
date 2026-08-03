import { create } from "zustand";

export type ThemeName = "classic" | "classic-dark" | "nord";

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

export type SidebarView = "files" | "outline";

interface EditorState {
  rootDir: string | null;
  fileTree: FileNode[];
  currentFilePath: string | null;
  isUntitled: boolean;
  content: string;
  savedContent: string;
  theme: ThemeName;
  outline: HeadingItem[];
  sidebarView: SidebarView;
  sidebarVisible: boolean;

  setRootDir: (dir: string | null) => void;
  setFileTree: (tree: FileNode[]) => void;
  openFile: (path: string, content: string) => void;
  newFile: () => void;
  closeFile: () => void;
  updateContent: (markdown: string) => void;
  markSaved: () => void;
  setTheme: (theme: ThemeName) => void;
  setOutline: (outline: HeadingItem[]) => void;
  setSidebarView: (view: SidebarView) => void;
  toggleSidebar: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  rootDir: null,
  fileTree: [],
  currentFilePath: null,
  isUntitled: false,
  content: "",
  savedContent: "",
  theme: "classic",
  outline: [],
  sidebarView: "files",
  sidebarVisible: true,

  setRootDir: (dir) => set({ rootDir: dir }),
  setFileTree: (tree) => set({ fileTree: tree }),
  openFile: (path, content) =>
    set({ currentFilePath: path, isUntitled: false, content, savedContent: content, outline: [] }),
  newFile: () =>
    set({
      currentFilePath: null,
      isUntitled: true,
      content: "",
      savedContent: "",
      outline: [],
    }),
  closeFile: () =>
    set({ currentFilePath: null, isUntitled: false, content: "", savedContent: "", outline: [] }),
  updateContent: (markdown) => set({ content: markdown }),
  markSaved: () => set((s) => ({ savedContent: s.content })),
  setTheme: (theme) => set({ theme }),
  setOutline: (outline) => set({ outline }),
  setSidebarView: (view) => set({ sidebarView: view, sidebarVisible: true }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
}));
