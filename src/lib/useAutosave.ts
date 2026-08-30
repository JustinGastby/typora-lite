import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { saveDocumentSnapshot } from "./documentPersistence";

const AUTOSAVE_DELAY_MS = 800;

/** Debounced write-back to disk whenever the open document's content changes. */
export function useAutosave(): void {
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const content = useEditorStore((s) => s.content);
  const savedContent = useEditorStore((s) => s.savedContent);
  const documentRevision = useEditorStore((s) => s.documentRevision);
  const externalFilePath = useEditorStore(
    (s) => s.externalFileChange?.path ?? null,
  );
  const applySavedSnapshot = useEditorStore((s) => s.applySavedSnapshot);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!currentFilePath) return;
    if (content === savedContent) return;
    if (externalFilePath === currentFilePath) return;

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      saveDocumentSnapshot(currentFilePath, content, documentRevision)
        .then(({ persistedContent, skipped }) => {
          if (!skipped) {
            applySavedSnapshot(currentFilePath, documentRevision, persistedContent);
          }
        })
        .catch((err) => {
          console.error("Autosave failed:", err);
        });
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timerRef.current);
  }, [
    content,
    savedContent,
    currentFilePath,
    documentRevision,
    externalFilePath,
    applySavedSnapshot,
  ]);
}
