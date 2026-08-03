import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";
import { saveImageFile } from "../lib/fsHelpers";
import { extractOutline } from "../lib/outline";
import { renderMermaidToSvg } from "../lib/mermaidPreview";

import "@milkdown/crepe/theme/common/style.css";

// http(s):// and protocol-relative URLs, plus embedded/already-served data.
// Note: `file://` URIs are intentionally NOT included here — Tauri's webview
// can't load raw `file://` resources, they still need to go through
// `convertFileSrc` below like any other local filesystem path.
const REMOTE_URL_RE = /^(https?:)?\/\//i;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

function isRemoteOrEmbedded(url: string): boolean {
  return (
    REMOTE_URL_RE.test(url) ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("asset:") ||
    url.startsWith("tauri:")
  );
}

/** Extracts a raw filesystem path from an already-absolute reference, if any. */
function toAbsoluteFsPath(url: string): string | null {
  if (url.startsWith("file://")) {
    const stripped = url.slice("file://".length);
    try {
      return decodeURIComponent(stripped);
    } catch {
      return stripped;
    }
  }
  if (url.startsWith("/") || WINDOWS_ABSOLUTE_RE.test(url)) return url;
  return null;
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Builds the list of candidate absolute paths a relative image reference
 * could point to: next to the current file (our own paste convention), and
 * relative to the opened folder root (common in other tools/vaults where
 * images are referenced relative to the workspace instead of the note).
 */
async function relativeImageCandidates(relativeUrl: string): Promise<string[]> {
  const { currentFilePath, rootDir } = useEditorStore.getState();
  const decoded = decodeMaybe(relativeUrl);
  const candidates: string[] = [];

  if (currentFilePath) {
    candidates.push(await join(await dirname(currentFilePath), decoded));
  }
  if (rootDir) {
    candidates.push(await join(rootDir, decoded));
  }
  return candidates;
}

/**
 * Mounts a Milkdown Crepe WYSIWYG instance bound to the currently open file.
 * The parent renders this with `key={currentFilePath}` so switching documents
 * fully remounts (and re-initializes) the editor instead of trying to patch
 * an existing ProseMirror view in place.
 */
export function MilkdownEditor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const initialContent = useEditorStore.getState().content;

    async function handleUpload(file: File): Promise<string> {
      const path = useEditorStore.getState().currentFilePath;
      if (!path) return URL.createObjectURL(file);
      try {
        return await saveImageFile(path, file);
      } catch (err) {
        console.error("Failed to save pasted image:", err);
        return URL.createObjectURL(file);
      }
    }

    async function handleProxyUrl(url: string): Promise<string> {
      if (isRemoteOrEmbedded(url)) return url;

      const absoluteFsPath = toAbsoluteFsPath(url);
      if (absoluteFsPath) return convertFileSrc(absoluteFsPath);

      try {
        const candidates = await relativeImageCandidates(url);
        for (const candidate of candidates) {
          if (await exists(candidate)) return convertFileSrc(candidate);
        }
        // None of the candidates exist on disk (broken link, or a check we
        // couldn't run) — still try the best-guess candidate so the browser
        // renders a broken-image icon instead of literally nothing.
        if (candidates[0]) return convertFileSrc(candidates[0]);
        return url;
      } catch (err) {
        console.error("Failed to resolve image path:", err);
        return url;
      }
    }

    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: initialContent,
      features: {
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.Latex]: true,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: handleUpload,
          inlineOnUpload: handleUpload,
          blockOnUpload: handleUpload,
          proxyDomURL: handleProxyUrl,
        },
        [Crepe.Feature.Placeholder]: {
          text: "开始写点什么…",
        },
        [Crepe.Feature.CodeMirror]: {
          previewOnlyByDefault: true,
          previewLabel: "预览",
          previewLoading: "渲染中…",
          renderPreview: (language, content, applyPreview) => {
            if (language.trim().toLowerCase() !== "mermaid" || !content.trim()) {
              return null;
            }
            renderMermaidToSvg(content)
              .then((svg) => applyPreview(svg))
              .catch((err) => {
                console.error("Mermaid render failed:", err);
                applyPreview(
                  '<div class="mermaid-render-error">Mermaid 图表渲染失败，请检查语法</div>',
                );
              });
            return undefined;
          },
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (disposed) return;
        useEditorStore.getState().updateContent(markdown);
        useEditorStore.getState().setOutline(extractOutline(markdown));
      });
    });

    crepe.create().then(() => {
      if (disposed) return;
      useEditorStore.getState().setOutline(extractOutline(initialContent));
    });

    return () => {
      disposed = true;
      void crepe.destroy();
    };
  }, []);

  return <div className="milkdown-editor-root" id="milkdown-editor-root" ref={containerRef} />;
}
