import classicUrl from "@milkdown/crepe/theme/classic.css?url";
import classicDarkUrl from "@milkdown/crepe/theme/classic-dark.css?url";
import nordUrl from "@milkdown/crepe/theme/nord.css?url";
import type { ThemeName } from "../store/useEditorStore";

const THEME_URLS: Record<ThemeName, string> = {
  classic: classicUrl,
  "classic-dark": classicDarkUrl,
  nord: nordUrl,
};

const DARK_THEMES = new Set<ThemeName>(["classic-dark"]);

const LINK_ID = "crepe-theme-stylesheet";

/** Swaps the active Crepe color theme stylesheet at runtime (no editor remount needed). */
export function applyTheme(theme: ThemeName): void {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = THEME_URLS[theme];
  document.documentElement.dataset.appTheme = DARK_THEMES.has(theme) ? "dark" : "light";
}

export const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
  { value: "classic", label: "默认(浅色)" },
  { value: "classic-dark", label: "深色" },
  { value: "nord", label: "Nord(冷色)" },
];
