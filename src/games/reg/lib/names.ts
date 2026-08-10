import { splitSegments } from "./paths";

/**
 * Excerpt captions, derived from file paths.
 *
 * "orchestral/mahler/Symphony No. 5.png" → "orchestral - mahler - Symphony No. 5",
 * shrunk to fit a budget by sacrificing folders (longest first) before ever touching
 * the file name — the file name is the part the player actually needs to read.
 */

/** Path → caption segments: split on "/", strip the extension from the file name. */
export function excerptSegments(path: string): string[] {
  const segments = splitSegments(path);
  if (segments.length === 0) return [];
  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf(".");
  const stem = dot > 0 ? last.slice(0, dot) : last;
  return [...segments.slice(0, -1), stem];
}

/**
 * Fit the joined segments into `maxLength` characters.
 *
 * While too long: drop the longest folder name (ties → leftmost). The file name is
 * never dropped; if it alone still overflows, it is cut with a trailing ellipsis.
 */
export function truncateExcerptName(
  segments: readonly string[],
  maxLength: number,
  separator = " - ",
): string {
  const parts = [...segments];
  while (parts.length > 1 && parts.join(separator).length > maxLength) {
    let longest = 0;
    for (let i = 1; i < parts.length - 1; i += 1) {
      if (parts[i].length > parts[longest].length) longest = i;
    }
    parts.splice(longest, 1);
  }

  const joined = parts.join(separator);
  if (joined.length <= maxLength) return joined;
  if (maxLength <= 1) return "…";
  return joined.slice(0, maxLength - 1) + "…";
}

/** The full pipeline: path in, display-ready caption out. */
export function excerptName(
  path: string,
  maxLength: number,
  separator = " - ",
): string {
  return truncateExcerptName(excerptSegments(path), maxLength, separator);
}
