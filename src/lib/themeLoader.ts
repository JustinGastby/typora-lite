import classicUrl from "@milkdown/crepe/theme/classic.css?url";
import classicDarkUrl from "@milkdown/crepe/theme/classic-dark.css?url";
import classicChromeUrl from "../themes/classic-chrome.css?url";
import githubUrl from "../themes/github.css?url";
import sepiaUrl from "../themes/sepia.css?url";
import forestUrl from "../themes/forest.css?url";
import midnightUrl from "../themes/midnight.css?url";
import type { ThemeName } from "../store/useEditorStore";

/**
 * Each theme maps to one or more stylesheets. Crepe built-ins only paint
 * `.milkdown`, so classic* also loads chrome tokens for the app shell.
 */
const THEME_URLS: Record<ThemeName, string[]> = {
  classic: [classicUrl, classicChromeUrl],
  "classic-dark": [classicDarkUrl, classicChromeUrl],
  github: [githubUrl],
  sepia: [sepiaUrl],
  forest: [forestUrl],
  midnight: [midnightUrl],
};

const DARK_THEMES = new Set<ThemeName>(["classic-dark", "midnight"]);

const LINK_PREFIX = "app-theme-stylesheet-";

export const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
  { value: "classic", label: "默认(暖白)" },
  { value: "classic-dark", label: "深色" },
  { value: "github", label: "GitHub(亮白)" },
  { value: "sepia", label: "羊皮纸" },
  { value: "forest", label: "森绿" },
  { value: "midnight", label: "午夜蓝" },
];

const VALID_THEMES = new Set<string>(THEME_OPTIONS.map((o) => o.value));

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && VALID_THEMES.has(value);
}

function clearThemeLinks(): void {
  document
    .querySelectorAll(`link[id^="${LINK_PREFIX}"]`)
    .forEach((node) => node.remove());
}

/** Swaps theme stylesheets and syncs app-shell tokens via data-theme. */
export function applyTheme(theme: ThemeName): void {
  clearThemeLinks();
  THEME_URLS[theme].forEach((href, index) => {
    const link = document.createElement("link");
    link.id = `${LINK_PREFIX}${index}`;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });

  const isDark = DARK_THEMES.has(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.appTheme = isDark ? "dark" : "light";
  // Keep native form controls (select/button) in sync with our chrome tokens.
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}
