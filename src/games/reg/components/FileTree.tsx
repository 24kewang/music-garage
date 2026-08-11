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
 * `indeterminate`), and cascade downward on toggle.
 *
 * `visible` and `searching` are separate on purpose. `visible` only decides which rows
 * appear, and any filter can narrow it. `searching` changes how the tree *behaves* —
 * auto-expanding and dropping folder checkboxes — and only a search query does that,
 * because only a search hides files that a folder toggle would still reach. The
 * selected-only filter hides files by the very property the checkbox sets, so its
 * consequences are always on screen and the checkboxes stay.
 *
 * Collapse state is owned by the panel, not here, so the Expand/Collapse all button
 * can drive it — and so it survives the panel closing.
 */
export default function FileTree({
  root,
  checked,
  visible,
  searching,
  collapsed,
  emptyMessage,
  onToggle,
  onToggleCollapsed,
}: {
  root: TreeNode;
  checked: ReadonlySet<string>;
  /** Paths to render; null = unfiltered, render everything. */
  visible: ReadonlySet<string> | null;
  /** A search query is active: auto-expand and hide folder checkboxes. */
  searching: boolean;
  collapsed: ReadonlySet<string>;
  /** Why the tree is empty — the panel knows which filter emptied it. */
  emptyMessage: string;
  onToggle: (node: TreeNode, value: boolean) => void;
  onToggleCollapsed: (path: string) => void;
}) {
  const rows = root.children.filter(
    (child) => visible === null || visible.has(child.path),
  );

  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <ul className={styles.tree} role="tree">
      {rows.map((child) => (
        <Row
          key={child.path}
          node={child}
          checked={checked}
          visible={visible}
          searching={searching}
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
  searching,
  collapsed,
  onToggle,
  onToggleCollapsed,
}: {
  node: TreeNode;
  checked: ReadonlySet<string>;
  visible: ReadonlySet<string> | null;
  searching: boolean;
  collapsed: ReadonlySet<string>;
  onToggle: (node: TreeNode, value: boolean) => void;
  onToggleCollapsed: (path: string) => void;
}) {
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

  // Search ignores manual collapse so every match's context stays visible.
  const isCollapsed = !searching && collapsed.has(node.path);
  const state = folderCheckState(node, checked);
  const children = node.children.filter(
    (child) => visible === null || visible.has(child.path),
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
              searching={searching}
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
