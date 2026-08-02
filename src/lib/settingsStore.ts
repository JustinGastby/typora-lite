import { LazyStore } from "@tauri-apps/plugin-store";
import type { ThemeName } from "../store/useEditorStore";

const store = new LazyStore("settings.json");

const THEME_KEY = "theme";
const LAST_FOLDER_KEY = "lastFolder";

export async function loadPersistedTheme(): Promise<ThemeName | null> {
  const value = await store.get<ThemeName>(THEME_KEY);
  return value ?? null;
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
