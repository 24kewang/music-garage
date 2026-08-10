import { describe, expect, it } from "vitest";

import {
  buildTree,
  fileDescendants,
  folderCheckState,
  folderPaths,
  searchVisiblePaths,
  toggleNode,
  type TreeNode,
} from "./tree";

const PATHS = [
  "solo.png",
  "orchestral/mahler/mahler5.png",
  "orchestral/mahler/mahler3.png",
  "orchestral/strauss.png",
  "etudes/arban1.png",
];

function find(root: TreeNode, path: string): TreeNode {
  if (root.path === path) return root;
  for (const child of root.children) {
    const files = fileDescendants(child);
    if (
      child.path === path ||
      files.some((p) => p === path || p.startsWith(child.path + "/"))
    ) {
      const hit = tryFind(child, path);
      if (hit) return hit;
    }
  }
  throw new Error(`no node at ${path}`);
}

function tryFind(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  for (const child of node.children) {
    const hit = tryFind(child, path);
    if (hit) return hit;
  }
  return null;
}

describe("buildTree", () => {
  it("nests folders and files by path", () => {
    const root = buildTree(PATHS);
    expect(root.children.map((c) => c.name)).toEqual([
      "etudes",
      "orchestral",
      "solo.png",
    ]);
    const orchestral = find(root, "orchestral");
    expect(orchestral.children.map((c) => c.name)).toEqual([
      "mahler",
      "strauss.png",
    ]);
  });

  it("sorts folders before files, both alphabetically", () => {
    const root = buildTree(["b.png", "a/x.png", "z/x.png", "a.png"]);
    expect(root.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "folder:a",
      "folder:z",
      "file:a.png",
      "file:b.png",
    ]);
  });

  it("deduplicates repeated file paths", () => {
    const root = buildTree(["a/x.png", "a/x.png"]);
    expect(fileDescendants(root)).toEqual(["a/x.png"]);
  });
});

describe("folderPaths", () => {
  it("lists every folder, nested ones included, and no files", () => {
    expect(folderPaths(buildTree(PATHS)).sort()).toEqual([
      "etudes",
      "orchestral",
      "orchestral/mahler",
    ]);
  });

  it("is empty for a flat library", () => {
    expect(folderPaths(buildTree(["a.png", "b.png"]))).toEqual([]);
  });

  it("reaches arbitrarily deep", () => {
    expect(folderPaths(buildTree(["a/b/c/d.png"]))).toEqual(["a", "a/b", "a/b/c"]);
  });
});

describe("folderCheckState", () => {
  const root = buildTree(PATHS);
  const mahler = () => find(root, "orchestral/mahler");

  it("is checked when every descendant file is checked", () => {
    const checked = new Set([
      "orchestral/mahler/mahler5.png",
      "orchestral/mahler/mahler3.png",
    ]);
    expect(folderCheckState(mahler(), checked)).toBe("checked");
  });

  it("is unchecked when no descendant file is checked", () => {
    expect(folderCheckState(mahler(), new Set())).toBe("unchecked");
  });

  it("is mixed when some descendant files are checked", () => {
    const checked = new Set(["orchestral/mahler/mahler5.png"]);
    expect(folderCheckState(mahler(), checked)).toBe("mixed");
    expect(folderCheckState(find(root, "orchestral"), checked)).toBe("mixed");
  });
});

describe("toggleNode", () => {
  const root = buildTree(PATHS);

  it("cascades a folder check to every descendant file", () => {
    const next = toggleNode(find(root, "orchestral"), new Set(), true);
    expect([...next].sort()).toEqual([
      "orchestral/mahler/mahler3.png",
      "orchestral/mahler/mahler5.png",
      "orchestral/strauss.png",
    ]);
  });

  it("cascades a folder uncheck without touching siblings", () => {
    const all = new Set(PATHS);
    const next = toggleNode(find(root, "orchestral/mahler"), all, false);
    expect(next.has("orchestral/mahler/mahler5.png")).toBe(false);
    expect(next.has("orchestral/strauss.png")).toBe(true);
    expect(next.has("solo.png")).toBe(true);
  });

  it("toggles a single file and returns a new Set", () => {
    const before = new Set<string>();
    const next = toggleNode(find(root, "solo.png"), before, true);
    expect(next.has("solo.png")).toBe(true);
    expect(before.size).toBe(0);
  });
});

describe("searchVisiblePaths", () => {
  const root = buildTree(PATHS);

  it("returns null for a blank query", () => {
    expect(searchVisiblePaths(root, "")).toBeNull();
    expect(searchVisiblePaths(root, "   ")).toBeNull();
  });

  it("matches case-insensitively and includes the ancestor chain", () => {
    const visible = searchVisiblePaths(root, "MAHLER5");
    expect(visible).not.toBeNull();
    expect([...visible!].sort()).toEqual([
      "orchestral",
      "orchestral/mahler",
      "orchestral/mahler/mahler5.png",
    ]);
  });

  it("includes all descendants of a matched folder", () => {
    const visible = searchVisiblePaths(root, "orchestral")!;
    expect(visible.has("orchestral/mahler/mahler3.png")).toBe(true);
    expect(visible.has("orchestral/strauss.png")).toBe(true);
    expect(visible.has("solo.png")).toBe(false);
  });

  it("returns an empty set when nothing matches", () => {
    expect(searchVisiblePaths(root, "zzz")!.size).toBe(0);
  });
});
