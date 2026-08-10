import { config } from "../config";
import { isImagePath, splitSegments } from "./paths";

/**
 * The excerpt library on disk: a thin wrapper over the Origin Private File System.
 *
 * Everything decision-shaped (tree building, search, selection, captions) lives in
 * the pure lib modules; this file only moves bytes. The library sits in a `reg/`
 * subdirectory of the origin's OPFS root so future games can use OPFS without
 * colliding with it.
 */

/** OPFS support gate — old Safari lacks getDirectory/createWritable. */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

/**
 * Ask the browser to make this origin's storage durable. Best-effort: Chrome may
 * refuse silently based on engagement heuristics, and the library still works —
 * it's just theoretically evictable under storage pressure.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage.persist?.()) ?? false;
  } catch {
    return false;
  }
}

async function libraryRoot(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const opfsRoot = await navigator.storage.getDirectory();
  try {
    return await opfsRoot.getDirectoryHandle(config.files.opfsRoot, { create });
  } catch {
    return null; // Library folder doesn't exist yet.
  }
}

/** Every stored image path, "/"-joined relative to the library root. */
export async function listImagePaths(): Promise<string[]> {
  const root = await libraryRoot(false);
  if (root === null) return [];
  const paths: string[] = [];
  await walk(root, "", paths);
  return paths.sort((a, b) => a.localeCompare(b));
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[],
): Promise<void> {
  for await (const handle of dir.values()) {
    const path = prefix === "" ? handle.name : `${prefix}/${handle.name}`;
    if (handle.kind === "directory") {
      await walk(handle as FileSystemDirectoryHandle, path, out);
    } else if (isImagePath(path, config.files.imageExtensions)) {
      out.push(path);
    }
  }
}

/**
 * Write uploaded files, creating folders as needed. Duplicate paths overwrite —
 * `createWritable` truncates — so re-uploading a corrected excerpt just works.
 */
export async function writeFiles(
  entries: readonly { path: string; file: File }[],
): Promise<void> {
  const root = await libraryRoot(true);
  if (root === null) throw new Error("could not open the excerpt library");
  for (const { path, file } of entries) {
    const segments = splitSegments(path);
    if (segments.length === 0) continue;
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1], {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

/** Read one stored excerpt back as a Blob (for texture decoding). */
export async function readFileBlob(path: string): Promise<Blob> {
  const root = await libraryRoot(false);
  if (root === null) throw new Error(`no library to read ${path} from`);
  const segments = splitSegments(path);
  let dir = root;
  for (const segment of segments.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment);
  }
  const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
  return fileHandle.getFile();
}

/** Delete the whole library. */
export async function deleteAll(): Promise<void> {
  const opfsRoot = await navigator.storage.getDirectory();
  try {
    await opfsRoot.removeEntry(config.files.opfsRoot, { recursive: true });
  } catch {
    // Already gone — deleting an empty library is a no-op, not an error.
  }
}
