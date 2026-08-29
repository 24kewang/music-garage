import { config } from "../config";
import { isImagePath, normalizePath } from "./paths";

/**
 * Turning the three upload gestures — file picker, folder picker, drag-and-drop —
 * into one shape: `{ path, file }` pairs with normalized relative paths.
 */

export interface Incoming {
  path: string;
  file: File;
}

/** Plain file picker: no folder context, path is just the file name. */
export function fromFileList(files: FileList): Incoming[] {
  return [...files].map((file) => ({ path: normalizePath(file.name), file }));
}

/** Folder picker (`webkitdirectory`): paths keep the picked folder's structure. */
export function fromDirectoryInput(files: FileList): Incoming[] {
  return [...files].map((file) => ({
    path: normalizePath(file.webkitRelativePath || file.name),
    file,
  }));
}

/**
 * Drag-and-drop, which may mix loose files and whole folder trees.
 *
 * The entries must be snapshotted from every DataTransferItem *before the first
 * await* — the item list is invalidated once the drop handler yields. Directory
 * reads loop `readEntries()` until an empty batch because Chromium returns at most
 * 100 entries per call and silently truncates otherwise.
 */
export async function fromDataTransfer(
  items: DataTransferItemList,
): Promise<Incoming[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }

  const incoming: Incoming[] = [];
  for (const entry of entries) {
    await collectEntry(entry, incoming);
  }
  return incoming;
}

async function collectEntry(
  entry: FileSystemEntry,
  out: Incoming[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path: normalizePath(entry.fullPath), file });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) {
        await collectEntry(child, out);
      }
    }
  }
}

/** Split an upload into storable images and a count of everything else. */
export function partitionImages(incoming: readonly Incoming[]): {
  accepted: Incoming[];
  skipped: number;
} {
  const accepted = incoming.filter(({ path }) =>
    isImagePath(path, config.files.imageExtensions),
  );
  return { accepted, skipped: incoming.length - accepted.length };
}
