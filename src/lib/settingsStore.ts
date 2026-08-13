import { LazyStore } from "@tauri-apps/plugin-store";
import type { ThemeName } from "../store/useEditorStore";
import { isThemeName } from "./themeLoader";

const store = new LazyStore("settings.json");

const THEME_KEY = "theme";
const LAST_FOLDER_KEY = "lastFolder";
const SIDEBAR_WIDTH_KEY = "sidebarWidth";

export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 400;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

export async function loadPersistedTheme(): Promise<ThemeName | null> {
  const value = await store.get<unknown>(THEME_KEY);
  return isThemeName(value) ? value : null;
}

export async function persistTheme(theme: ThemeName): Promise<void> {
  await store.set(THEME_KEY, theme);
  await store.save();
}

export async function loadLastFolder(): Promise<string | null> {
  const value = await store.get<string>(LAST_FOLDER_KEY);
  return value ?? null;
}

export async function persistLastFolder(path: string): Promise<void> {
  await store.set(LAST_FOLDER_KEY, path);
  await store.save();
}

export async function loadPersistedSidebarWidth(): Promise<number> {
  const value = await store.get<unknown>(SIDEBAR_WIDTH_KEY);
  return typeof value === "number" && Number.isFinite(value)
    ? clampSidebarWidth(value)
    : SIDEBAR_WIDTH_DEFAULT;
}

export async function persistSidebarWidth(width: number): Promise<void> {
  await store.set(SIDEBAR_WIDTH_KEY, clampSidebarWidth(width));
  await store.save();
}
