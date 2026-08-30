import { persistBlobImages, saveMarkdownFile } from "./fsHelpers";

export interface SavedDocumentSnapshot {
  persistedContent: string;
  skipped: boolean;
}

let saveQueue: Promise<void> = Promise.resolve();
const latestRequestedRevision = new Map<string, number>();

/**
 * Serializes document writes so an older, slower save can never finish after
 * a newer save and overwrite it on disk.
 */
export function saveDocumentSnapshot(
  path: string,
  sourceContent: string,
  sourceRevision: number,
): Promise<SavedDocumentSnapshot> {
  const latest = latestRequestedRevision.get(path) ?? -1;
  latestRequestedRevision.set(path, Math.max(latest, sourceRevision));

  const write = saveQueue.then(async () => {
    if (sourceRevision < (latestRequestedRevision.get(path) ?? -1)) {
      return { persistedContent: sourceContent, skipped: true };
    }
    const persistedContent = await persistBlobImages(path, sourceContent);
    await saveMarkdownFile(path, persistedContent);
    return { persistedContent, skipped: false };
  });

  saveQueue = write.then(
    () => undefined,
    () => undefined,
  );

  return write;
}
