/**
 * Path plumbing shared by upload, OPFS storage and the file tree.
 *
 * Paths are stored "/"-joined with no leading slash — the same shape whether they
 * came from a file picker (`name`), a folder picker (`webkitRelativePath`) or a
 * drag-and-drop walk (`FileSystemEntry.fullPath`).
 */

/** Normalise a raw path: backslashes to slashes, no leading "./" or "/", no empty segments. */
export function normalizePath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/** Split a normalised path into its segments. */
export function splitSegments(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .filter((segment) => segment !== "");
}

/** Case-insensitive extension allowlist check. Extensions, not MIME types — see config. */
export function isImagePath(
  path: string,
  extensions: readonly string[],
): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0 || dot === path.length - 1) return false;
  const ext = path.slice(dot + 1).toLowerCase();
  return extensions.includes(ext);
}
