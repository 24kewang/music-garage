import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "@/shared/icons";
import { TOOLS, getTool } from "./registry";
import { toolHref } from "./types";

/**
 * Guards the three-part contract for adding a tool: a folder under `src/tools/`, a
 * route adapter under `src/app/tools/`, and an entry in the registry. Two of the
 * three can drift silently otherwise — a registered tool with no route 404s, and a
 * route with no registry entry never appears in the Tools menu.
 */

const SRC = join(process.cwd(), "src");

describe("tool registry", () => {
  it("has at least one tool", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses url-safe slugs", () => {
    for (const tool of TOOLS) {
      expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(TOOLS.map((tool) => tool.slug))(
    "%s has a tool folder and a route adapter",
    (slug) => {
      expect(existsSync(join(SRC, "tools", slug))).toBe(true);
      expect(existsSync(join(SRC, "app", "tools", slug, "page.tsx"))).toBe(true);
    },
  );

  it("gives every tool the fields the shell renders", () => {
    for (const tool of TOOLS) {
      expect(tool.title).toBeTruthy();
      expect(tool.blurb).toBeTruthy();
      expect(["playable", "in-progress", "planned"]).toContain(tool.status);
    }
  });

  it("points every tool at an icon that exists", () => {
    // Typing catches this at build time; the test catches it if the icon set is
    // pruned without updating the manifests that referenced it.
    for (const tool of TOOLS) {
      expect(Object.keys(ICONS)).toContain(tool.iconId);
    }
  });

  it("looks tools up by slug", () => {
    const first = TOOLS[0];
    expect(getTool(first.slug)).toBe(first);
    expect(getTool("no-such-tool")).toBeUndefined();
  });

  it("derives hrefs from slugs", () => {
    for (const tool of TOOLS) {
      expect(toolHref(tool)).toBe(`/tools/${tool.slug}`);
    }
  });
});
