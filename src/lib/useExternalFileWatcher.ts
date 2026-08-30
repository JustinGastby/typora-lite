import { useEffect } from "react";
import { dirname } from "@tauri-apps/api/path";
import {
  readTextFile,
  watch,
  type UnwatchFn,
  type WatchEvent,
} from "@tauri-apps/plugin-fs";
import { useEditorStore } from "../store/useEditorStore";
import { normalizeHtmlImages } from "./normalizeHtmlImages";

function comparablePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function affectsCurrentFile(event: WatchEvent, path: string): boolean {
  if (typeof event.type === "object" && "access" in event.type) return false;

  const target = comparablePath(path);
  if (event.paths.some((eventPath) => comparablePath(eventPath) === target)) {
    return true;
  }

  // Atomic-save implementations often rename a temporary sibling over the
  // target. Some platforms only report the temporary path for that event.
  return (
    typeof event.type === "object" &&
    "modify" in event.type &&
    event.type.modify.kind === "rename"
  );
}

/** Watches the current document and records disk changes made outside the app. */
export function useExternalFileWatcher(): void {
  const currentFilePath = useEditorStore((state) => state.currentFilePath);

  useEffect(() => {
    if (!currentFilePath) return;

    let cancelled = false;
    let unwatch: UnwatchFn | undefined;
    let inspectionRevision = 0;

    const inspectDiskContent = async () => {
      const revision = ++inspectionRevision;
      try {
        const diskContent = normalizeHtmlImages(
          await readTextFile(currentFilePath),
        );
        if (cancelled || revision !== inspectionRevision) return;

        const state = useEditorStore.getState();
        if (state.currentFilePath !== currentFilePath) return;

        // Internal saves eventually make disk content equal to the current or
        // last-saved snapshot and therefore never surface as external changes.
        if (
          diskContent === state.content ||
          diskContent === state.savedContent
        ) {
          state.clearExternalFileChange(currentFilePath);
          return;
        }

        state.setExternalFileChange({
          path: currentFilePath,
          content: diskContent,
        });
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to inspect externally changed file:", err);
        }
      }
    };

    const startWatching = async () => {
      const parentDir = await dirname(currentFilePath);
      const stop = await watch(
        parentDir,
        (event) => {
          if (affectsCurrentFile(event, currentFilePath)) {
            void inspectDiskContent();
          }
        },
        { recursive: false, delayMs: 250 },
      );

      if (cancelled) {
        stop();
        return;
      }
      unwatch = stop;

      // Closes the small gap between opening the file and installing the watch.
      await inspectDiskContent();
    };

    void startWatching().catch((err) => {
      if (!cancelled) {
        console.error("Failed to watch current file:", err);
      }
    });

    return () => {
      cancelled = true;
      inspectionRevision += 1;
      unwatch?.();
    };
  }, [currentFilePath]);
}
