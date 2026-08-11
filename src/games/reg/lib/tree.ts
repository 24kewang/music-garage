import { splitSegments } from "./paths";

/**
 * The file tree behind the settings panel.
 *
 * Only *file* paths are ever stored or persisted — a folder's checkbox is derived
 * from its descendants every render, so folder state can never drift out of sync
 * with the files it summarises.
 */

export interface TreeNode {
  /** Last path segment — what the row displays. */
  name: string;
  /** Full "/"-joined path from the library root. Empty string for the root. */
  path: string;
  kind: "folder" | "file";
  /** Folders first, then files, each alphabetical. Empty for files. */
  children: TreeNode[];
}

/** Build the tree from a flat list of file paths, under a synthetic root. */
export function buildTree(paths: readonly string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);

  for (const path of paths) {
    const segments = splitSegments(path);
    if (segments.length === 0) continue;
    let parent = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const folderPath = segments.slice(0, i + 1).join("/");
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = {
          name: segments[i],
          path: folderPath,
          kind: "folder",
          children: [],
        };
        folders.set(folderPath, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    const filePath = segments.join("/");
    if (!parent.children.some((child) => child.path === filePath)) {
      parent.children.push({
        name: segments[segments.length - 1],
        path: filePath,
        kind: "file",
        children: [],
      });
    }
  }

  sortChildren(root);
  return root;
}

function sortChildren(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const child of node.children) sortChildren(child);
}

/** Every file path at or below a node. */
export function fileDescendants(node: TreeNode): string[] {
  if (node.kind === "file") return [node.path];
  return node.children.flatMap(fileDescendants);
}

/** Every folder path in the tree, excluding the synthetic root. Drives collapse-all. */
export function folderPaths(node: TreeNode): string[] {
  const paths: string[] = [];
  for (const child of node.children) {
    if (child.kind !== "folder") continue;
    paths.push(child.path);
    paths.push(...folderPaths(child));
  }
  return paths;
}

export type CheckState = "checked" | "unchecked" | "mixed";

/** Derived checkbox state for any node against the checked-file set. */
export function folderCheckState(
  node: TreeNode,
  checked: ReadonlySet<string>,
): CheckState {
  const files = fileDescendants(node);
  if (files.length === 0) return "unchecked";
  const checkedCount = files.filter((path) => checked.has(path)).length;
  if (checkedCount === 0) return "unchecked";
  if (checkedCount === files.length) return "checked";
  return "mixed";
}

/** Check or uncheck an explicit list of files. Returns a new Set. */
export function togglePaths(
  paths: readonly string[],
  checked: ReadonlySet<string>,
  value: boolean,
): Set<string> {
  const next = new Set(checked);
  for (const path of paths) {
    if (value) next.add(path);
    else next.delete(path);
  }
  return next;
}


/** The two filters the panel can apply to the tree, in one place. */
export interface VisibilityFilter {
  /** Case-insensitive name match; blank means no search. */
  query: string;
  /** Show only checked files. */
  selectedOnly: boolean;
  checked: ReadonlySet<string>;
}

/**
 * Which nodes the tree should render.
 *
 * Returns null when neither filter is active, meaning "show everything".
 *
 * Derived **file-first**: a file survives when it passes every active filter, and the
 * visible folders are then exactly the ancestors of surviving files. Composing two
 * ready-made visibility sets by intersection looks equivalent and isn't — a folder that
 * is an ancestor of a matched-but-unchecked file *and* of a checked-but-unmatched file
 * would survive with no visible children, leaving an empty folder in the tree. Deriving
 * folders from the surviving files makes that structurally impossible.
 *
 * The search half keeps its original meaning: a file matches if its own name does, or if
 * any folder above it does, so a matched folder still shows everything inside it.
 */
export function visiblePaths(
  root: TreeNode,
  filter: VisibilityFilter,
): Set<string> | null {
  const needle = filter.query.trim().toLowerCase();
  if (needle === "" && !filter.selectedOnly) return null;

  const visible = new Set<string>();

  const walk = (
    node: TreeNode,
    ancestors: readonly string[],
    ancestorMatched: boolean,
  ): void => {
    const matched =
      ancestorMatched ||
      (node.path !== "" && node.name.toLowerCase().includes(needle));

    if (node.kind === "file") {
      if (needle !== "" && !matched) return;
      if (filter.selectedOnly && !filter.checked.has(node.path)) return;
      visible.add(node.path);
      for (const ancestor of ancestors) visible.add(ancestor);
      return;
    }

    const nextAncestors =
      node.path === "" ? ancestors : [...ancestors, node.path];
    for (const child of node.children) walk(child, nextAncestors, matched);
  };

  walk(root, [], false);
  return visible;
}

/** The files the tree is currently showing — all of them when unfiltered. */
export function shownFiles(
  root: TreeNode,
  visible: ReadonlySet<string> | null,
): string[] {
  const files = fileDescendants(root);
  return visible === null ? files : files.filter((path) => visible.has(path));
}
