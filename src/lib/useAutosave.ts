import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { saveMarkdownFile } from "./fsHelpers";

const AUTOSAVE_DELAY_MS = 800;

/** Debounced write-back to disk whenever the open document's content changes. */
export function useAutosave(): void {
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const content = useEditorStore((s) => s.content);
  const savedContent = useEditorStore((s) => s.savedContent);
  const markSaved = useEditorStore((s) => s.markSaved);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!currentFilePath) return;
    if (content === savedContent) return;

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      saveMarkdownFile(currentFilePath, content)
        .then(() => markSaved())
        .catch((err) => {
          console.error("Autosave failed:", err);
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timerRef.current);
  }, [content, savedContent, currentFilePath, markSaved]);
}
