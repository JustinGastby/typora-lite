import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import type { ExternalFileChange } from "../store/useEditorStore";
import { persistBlobImages, saveMarkdownFile } from "./fsHelpers";
import { normalizeHtmlImages } from "./normalizeHtmlImages";

export interface SavedDocumentSnapshot {
  persistedContent: string;
  skipped: boolean;
  conflict?: ExternalFileChange;
}

let saveQueue: Promise<void> = Promise.resolve();
const latestRequestedRevision = new Map<string, number>();
const activeWrites = new Set<string>();
const lastInternalTransitions = new Map<
  string,
  { before: string | null; after: string }
>();

export function isInternalDocumentWriteInProgress(path: string): boolean {
  return activeWrites.has(path);
}

export function isKnownInternalDocumentSnapshot(
  path: string,
  content: string,
): boolean {
  return (
    lastInternalTransitions.get(path)?.after === normalizeHtmlImages(content)
  );
}

async function detectDiskConflict(
  path: string,
  expectedDiskContent: string | null,
): Promise<{
  diskContent?: string | null;
  conflict?: ExternalFileChange;
}> {
  if (expectedDiskContent === null) {
    const pathExists = await exists(path);
    if (!pathExists) return { diskContent: null };
  }

  try {
    const diskContent = normalizeHtmlImages(await readTextFile(path));
    const expected =
      expectedDiskContent === null
        ? null
        : normalizeHtmlImages(expectedDiskContent);
    const previousInternalWrite = lastInternalTransitions.get(path);
    if (diskContent === expected) {
      return { diskContent };
    }
    if (
      previousInternalWrite?.before === expected &&
      previousInternalWrite.after === diskContent
    ) {
      return { diskContent };
    }
    return {
      conflict: { kind: "modified", path, content: diskContent },
    };
  } catch (err) {
    const pathExists = await exists(path).catch(() => true);
    if (!pathExists) {
      return { conflict: { kind: "missing", path } };
    }
    throw err;
  }
}

/**
 * Serializes document writes so an older, slower save can never finish after
 * a newer save and overwrite it on disk.
 */
export function saveDocumentSnapshot(
  path: string,
  sourceContent: string,
  sourceRevision: number,
  expectedDiskContent?: string | null,
): Promise<SavedDocumentSnapshot> {
  const latest = latestRequestedRevision.get(path) ?? -1;
  latestRequestedRevision.set(path, Math.max(latest, sourceRevision));

  const write = saveQueue.then(async () => {
    if (sourceRevision < (latestRequestedRevision.get(path) ?? -1)) {
      return { persistedContent: sourceContent, skipped: true };
    }
    const persistedContent = await persistBlobImages(path, sourceContent);
    let diskContentBeforeWrite: string | null | undefined;
    if (expectedDiskContent !== undefined) {
      const diskCheck = await detectDiskConflict(path, expectedDiskContent);
      if (diskCheck.conflict) {
        return {
          persistedContent: sourceContent,
          skipped: true,
          conflict: diskCheck.conflict,
        };
      }
      diskContentBeforeWrite = diskCheck.diskContent;
    }

    activeWrites.add(path);
    try {
      await saveMarkdownFile(path, persistedContent);
      if (diskContentBeforeWrite !== undefined) {
        lastInternalTransitions.set(path, {
          before: diskContentBeforeWrite,
          after: normalizeHtmlImages(persistedContent),
        });
      }
    } finally {
      activeWrites.delete(path);
    }
    return { persistedContent, skipped: false };
  });

  saveQueue = write.then(
    () => undefined,
    () => undefined,
  );

  return write;
}
