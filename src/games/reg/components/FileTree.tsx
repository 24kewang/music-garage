"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import {
  folderCheckState,
  type TreeNode,
} from "../lib/tree";
import styles from "./FileTree.module.css";

/**
 * The library as a collapsible checkbox tree.
 *
 * Folder checkboxes are derived from their descendant files every render (mixed →
 * `indeterminate`), and cascade downward on toggle. In search mode every visible
 * node is auto-expanded and only *files* keep their checkboxes — a folder toggle
 * over a partially-shown subtree would be ambiguous.
 *
 * Collapse state is owned by the panel, not here, so the Expand/Collapse all button
 * can drive it — and so it survives the panel closing.
 */
export default function FileTree({
  root,
  checked,
  visible,
  collapsed,
  onToggle,
  onToggleCollapsed,
}: {
  root: TreeNode;
  checked: ReadonlySet<string>;
  /** Paths to render in search mode; null = no search, render everything. */
  visible: ReadonlySet<string> | null;
  collapsed: ReadonlySet<string>;
  onToggle: (node: TreeNode, value: boolean) => void;
  onToggleCollapsed: (path: string) => void;
}) {
  const searching = visible !== null;
  const rows = root.children.filter((child) => !searching || visible.has(child.path));

  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        {searching ? "Nothing matches that search." : "No excerpts yet."}
      </p>
    );
  }

  return (
    <ul className={styles.tree} role="tree">
      {rows.map((child) => (
        <Row
          key={child.path}
          node={child}
          checked={checked}
          visible={visible}
          collapsed={collapsed}
          onToggle={onToggle}
          onToggleCollapsed={onToggleCollapsed}
        />
      ))}
    </ul>
  );
}

function Row({
  node,
  checked,
  visible,
  collapsed,
  onToggle,
  onToggleCollapsed,
}: {
  node: TreeNode;
  checked: ReadonlySet<string>;
  visible: ReadonlySet<string> | null;
  collapsed: ReadonlySet<string>;
  onToggle: (node: TreeNode, value: boolean) => void;
  onToggleCollapsed: (path: string) => void;
}) {
  const searching = visible !== null;

  if (node.kind === "file") {
    return (
      <li role="treeitem" aria-selected={checked.has(node.path)}>
        <label className={styles.row}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={checked.has(node.path)}
            onChange={(event) => onToggle(node, event.target.checked)}
          />
          <span className={styles.name}>{node.name}</span>
        </label>
      </li>
    );
  }

  // Search mode ignores manual collapse so every match's context stays visible.
  const isCollapsed = !searching && collapsed.has(node.path);
  const state = folderCheckState(node, checked);
  const children = node.children.filter(
    (child) => !searching || visible.has(child.path),
  );

  return (
    <li role="treeitem" aria-expanded={!isCollapsed} aria-selected={state === "checked"}>
      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.caret} ${isCollapsed ? styles.caretCollapsed : ""}`}
          onClick={() => onToggleCollapsed(node.path)}
          disabled={searching}
          aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
        >
          <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        {searching ? (
          <span className={styles.folderName}>{node.name}/</span>
        ) : (
          <label className={styles.folderLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={state === "checked"}
              ref={(el) => {
                if (el) el.indeterminate = state === "mixed";
              }}
              onChange={(event) => onToggle(node, event.target.checked)}
            />
            <span className={styles.folderName}>{node.name}/</span>
          </label>
        )}
      </div>
      {!isCollapsed && children.length > 0 && (
        <ul className={styles.branch} role="group">
          {children.map((child) => (
            <Row
              key={child.path}
              node={child}
              checked={checked}
              visible={visible}
              collapsed={collapsed}
              onToggle={onToggle}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
