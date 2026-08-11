import { describe, expect, it } from "vitest";

import {
  buildTree,
  fileDescendants,
  folderCheckState,
  folderPaths,
  shownFiles,
  togglePaths,
  visiblePaths,
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

// How the panel cascades a folder row: the descendants of the node, toggled together.
describe("cascading a folder toggle", () => {
  const root = buildTree(PATHS);
  const cascade = (path: string, checked: ReadonlySet<string>, value: boolean) =>
    togglePaths(fileDescendants(find(root, path)), checked, value);

  it("cascades a folder check to every descendant file", () => {
    expect([...cascade("orchestral", new Set(), true)].sort()).toEqual([
      "orchestral/mahler/mahler3.png",
      "orchestral/mahler/mahler5.png",
      "orchestral/strauss.png",
    ]);
  });

  it("cascades a folder uncheck without touching siblings", () => {
    const next = cascade("orchestral/mahler", new Set(PATHS), false);
    expect(next.has("orchestral/mahler/mahler5.png")).toBe(false);
    expect(next.has("orchestral/strauss.png")).toBe(true);
    expect(next.has("solo.png")).toBe(true);
  });

  it("toggles a single file and returns a new Set", () => {
    const before = new Set<string>();
    expect(cascade("solo.png", before, true).has("solo.png")).toBe(true);
    expect(before.size).toBe(0);
  });
});

describe("togglePaths", () => {
  it("adds and removes an explicit list", () => {
    const added = togglePaths(["a.png", "b.png"], new Set(), true);
    expect([...added].sort()).toEqual(["a.png", "b.png"]);
    expect([...togglePaths(["a.png"], added, false)]).toEqual(["b.png"]);
  });

  it("leaves paths outside the list alone", () => {
    const next = togglePaths(["a.png"], new Set(["z.png"]), true);
    expect(next.has("z.png")).toBe(true);
  });

  it("returns a new Set", () => {
    const before = new Set<string>();
    togglePaths(["a.png"], before, true);
    expect(before.size).toBe(0);
  });
});

describe("visiblePaths", () => {
  const root = buildTree(PATHS);
  const all = new Set(PATHS);
  const search = (query: string, checked: ReadonlySet<string> = all) =>
    visiblePaths(root, { query, selectedOnly: false, checked });

  it("returns null when neither filter is active", () => {
    expect(search("")).toBeNull();
    expect(search("   ")).toBeNull();
  });

  // The three cases below are carried over verbatim from the search-only
  // implementation: they are what proves composing the filters didn't change search.
  it("matches case-insensitively and includes the ancestor chain", () => {
    const visible = search("MAHLER5");
    expect(visible).not.toBeNull();
    expect([...visible!].sort()).toEqual([
      "orchestral",
      "orchestral/mahler",
      "orchestral/mahler/mahler5.png",
    ]);
  });

  it("includes all descendants of a matched folder", () => {
    const visible = search("orchestral")!;
    expect(visible.has("orchestral/mahler/mahler3.png")).toBe(true);
    expect(visible.has("orchestral/strauss.png")).toBe(true);
    expect(visible.has("solo.png")).toBe(false);
  });

  it("returns an empty set when nothing matches", () => {
    expect(search("zzz")!.size).toBe(0);
  });

  it("filters to the checked files, with their folders", () => {
    const checked = new Set(["orchestral/mahler/mahler5.png", "solo.png"]);
    const visible = visiblePaths(root, { query: "", selectedOnly: true, checked })!;
    expect([...visible].sort()).toEqual([
      "orchestral",
      "orchestral/mahler",
      "orchestral/mahler/mahler5.png",
      "solo.png",
    ]);
  });

  it("is empty when selected-only is on and nothing is checked", () => {
    const visible = visiblePaths(root, {
      query: "",
      selectedOnly: true,
      checked: new Set(),
    })!;
    expect(visible.size).toBe(0);
  });

  it("applies both filters at once", () => {
    const checked = new Set(["orchestral/mahler/mahler5.png", "etudes/arban1.png"]);
    const visible = visiblePaths(root, {
      query: "mahler",
      selectedOnly: true,
      checked,
    })!;
    // arban1 is checked but doesn't match; mahler3 matches but isn't checked.
    expect([...visible].sort()).toEqual([
      "orchestral",
      "orchestral/mahler",
      "orchestral/mahler/mahler5.png",
    ]);
  });

  it("never leaves a folder with no visible children", () => {
    // "orchestral" is an ancestor of a matched-but-unchecked file (mahler3) and of a
    // checked-but-unmatched file (strauss). Intersecting two visibility sets would keep
    // the folder with nothing inside it; deriving folders from surviving files can't.
    const visible = visiblePaths(root, {
      query: "mahler3",
      selectedOnly: true,
      checked: new Set(["orchestral/strauss.png"]),
    })!;
    expect([...visible]).toEqual([]);
  });
});

describe("shownFiles", () => {
  const root = buildTree(PATHS);

  it("returns every file when unfiltered", () => {
    expect(shownFiles(root, null).sort()).toEqual([...PATHS].sort());
  });

  it("returns only the visible files, never folders", () => {
    const visible = visiblePaths(root, {
      query: "mahler",
      selectedOnly: false,
      checked: new Set(),
    })!;
    expect(shownFiles(root, visible).sort()).toEqual([
      "orchestral/mahler/mahler3.png",
      "orchestral/mahler/mahler5.png",
    ]);
  });

  it("is empty when nothing is visible", () => {
    expect(shownFiles(root, new Set())).toEqual([]);
  });
});
