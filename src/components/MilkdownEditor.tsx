import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { useEditorStore } from "../store/useEditorStore";
import { saveImageFile } from "../lib/fsHelpers";
import { extractOutline } from "../lib/outline";
import { renderMermaidToSvg } from "../lib/mermaidPreview";

import "@milkdown/crepe/theme/common/style.css";

const ABSOLUTE_URL_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

function isAlreadyResolvable(url: string): boolean {
  return (
    ABSOLUTE_URL_RE.test(url) ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("asset:")
  );
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
      if (isAlreadyResolvable(url)) return url;
      const path = useEditorStore.getState().currentFilePath;
      if (!path) return url;
      try {
        const dir = await dirname(path);
        const absolute = await join(dir, url);
        return convertFileSrc(absolute);
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
