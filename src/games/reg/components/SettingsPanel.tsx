"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  FolderOpenIcon,
  GearIcon,
  ImagesIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useDismiss } from "@/shared/hooks/useDismiss";
import type { Settings } from "../lib/settings";
import {
  folderPaths,
  shownFiles,
  visiblePaths,
  type TreeNode,
} from "../lib/tree";
import {
  fromDirectoryInput,
  fromFileList,
  type Incoming,
} from "../lib/upload";
import type { UploadResult } from "./UploadScreen";
import FileTree from "./FileTree";
import FilterTuning from "./FilterTuning";
import styles from "./SettingsPanel.module.css";

const TABS = [
  { id: "files", label: "Files" },
  { id: "filter", label: "Filter" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * The gear and its popup, in two tabs.
 *
 * **Files** is the excerpt library: search, bulk select, adding more, the
 * delete-everything escape hatch, and the checkbox tree. **Filter** is where the box
 * sits above the head and how big it is. Locked shut while a spin is running so the
 * reel can't have its options edited mid-spin.
 */
export default function SettingsPanel({
  root,
  checked,
  disabled,
  settings,
  onSettingsChange,
  onToggle,
  onToggleFiles,
  onUpload,
  onDeleteAll,
}: {
  root: TreeNode;
  checked: ReadonlySet<string>;
  /** True while a spin is running — the gear refuses to open. */
  disabled: boolean;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onToggle: (node: TreeNode, value: boolean) => void;
  /** Check or uncheck exactly these files — the ones the tree is showing. */
  onToggleFiles: (files: readonly string[], value: boolean) => void;
  onUpload: (incoming: Incoming[]) => Promise<UploadResult>;
  onDeleteAll: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // Deliberately not reset by close(): tuning the filter means opening the panel
  // over and over, and landing back on Files every time would be a nuisance.
  const [tab, setTab] = useState<TabId>("files");
  const [query, setQuery] = useState("");
  // A browsing aid, like the query and the collapse state: session-only, and left alone
  // by close() so it survives reopening the panel.
  const [selectedOnly, setSelectedOnly] = useState(false);
  // Lives here rather than in FileTree so Expand/Collapse all can drive it, and so it
  // isn't forgotten every time the panel closes.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const panelId = useId();
  const selectedOnlyId = useId();
  const tabId = (id: TabId) => `${panelId}-tab-${id}`;

  const close = useCallback(() => {
    setOpen(false);
    setConfirmingDelete(false);
    setNotice(null);
  }, []);
  useDismiss(open, rootRef, close);

  const searching = query.trim() !== "";
  const visible = useMemo(
    () => visiblePaths(root, { query, selectedOnly, checked }),
    [root, query, selectedOnly, checked],
  );
  // Select/Deselect all acts on exactly what the tree is showing, so during a search it
  // leaves the rest of the library alone.
  const shown = useMemo(() => shownFiles(root, visible), [root, visible]);
  const allShownChecked =
    shown.length > 0 && shown.every((path) => checked.has(path));

  const folders = useMemo(() => folderPaths(root), [root]);
  const allCollapsed =
    folders.length > 0 && folders.every((path) => collapsed.has(path));

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleIncoming = async (incoming: Incoming[]) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { added, skipped } = await onUpload(incoming);
      if (added === 0 && skipped > 0) {
        setNotice("No images in that pick — only image files are kept.");
      } else if (skipped > 0) {
        setNotice(`Added ${added}, skipped ${skipped} non-image file${skipped === 1 ? "" : "s"}.`);
      } else if (added > 0) {
        setNotice(`Added ${added} excerpt${added === 1 ? "" : "s"}.`);
      }
    } catch {
      setNotice("Something went wrong saving those files. Try again?");
    } finally {
      setBusy(false);
    }
  };

  // Arrow keys move between tabs, as the tab pattern expects.
  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((candidate) => candidate.id === tab);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(next.id))}`)
      ?.focus();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div
          className={styles.panel}
          id={panelId}
          role="dialog"
          aria-label="Filter settings"
        >
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Settings sections"
            onKeyDown={handleTabKeys}
          >
            {TABS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                id={tabId(candidate.id)}
                className={`${styles.tab} ${tab === candidate.id ? styles.tabActive : ""}`}
                role="tab"
                aria-selected={tab === candidate.id}
                aria-controls={`${panelId}-panel-${candidate.id}`}
                tabIndex={tab === candidate.id ? 0 : -1}
                onClick={() => setTab(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          {tab === "files" ? (
            <div
              className={styles.tabPanel}
              id={`${panelId}-panel-files`}
              role="tabpanel"
              aria-labelledby={tabId("files")}
            >
              <div className={styles.searchField}>
                <input
                  ref={searchRef}
                  type="search"
                  className={styles.search}
                  placeholder="Search excerpts…"
                  aria-label="Search excerpts"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query !== "" && (
                  <button
                    type="button"
                    className={styles.clear}
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    <XIcon size={14} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </div>

              {confirmingDelete ? (
                <div className={styles.actions}>
                  <span className={styles.confirmText}>Delete everything?</span>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.actionDanger}`}
                    onClick={() => {
                      setConfirmingDelete(false);
                      void onDeleteAll();
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={shown.length === 0}
                    onClick={() => onToggleFiles(shown, !allShownChecked)}
                  >
                    {allShownChecked ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    // Search force-expands every visible node, so collapsing would
                    // have no visible effect while one is active.
                    disabled={folders.length === 0 || searching}
                    onClick={() =>
                      setCollapsed(allCollapsed ? new Set() : new Set(folders))
                    }
                  >
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Add image files"
                  >
                    <ImagesIcon size={16} weight="bold" aria-hidden="true" />
                    Add files
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={busy}
                    onClick={() => folderInputRef.current?.click()}
                    aria-label="Add a folder"
                  >
                    <FolderOpenIcon size={16} weight="bold" aria-hidden="true" />
                    Add folder
                  </button>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.actionDanger}`}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete all files
                  </button>
                </div>
              )}

              <div className={styles.checkbox}>
                <input
                  id={selectedOnlyId}
                  type="checkbox"
                  checked={selectedOnly}
                  onChange={(event) => setSelectedOnly(event.target.checked)}
                />
                <label htmlFor={selectedOnlyId}>Only show selected</label>
              </div>

              {notice && <p className={styles.notice}>{notice}</p>}
              {checked.size === 0 && (
                <p className={styles.warning} role="alert">
                  Select at least one excerpt to spin.
                </p>
              )}

              <div className={styles.treeScroll}>
                <FileTree
                  root={root}
                  checked={checked}
                  visible={visible}
                  searching={searching}
                  collapsed={collapsed}
                  emptyMessage={emptyMessage(selectedOnly, searching)}
                  onToggle={onToggle}
                  onToggleCollapsed={toggleCollapsed}
                />
              </div>
            </div>
          ) : (
            <div
              className={styles.tabPanel}
              id={`${panelId}-panel-filter`}
              role="tabpanel"
              aria-labelledby={tabId("filter")}
            >
              <FilterTuning settings={settings} onChange={onSettingsChange} />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.gear}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Filter settings"
      >
        <GearIcon size={22} weight="bold" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void handleIncoming(fromFileList(event.target.files));
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        hidden
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(event) => {
          if (event.target.files)
            void handleIncoming(fromDirectoryInput(event.target.files));
          event.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Why the tree is empty. "No excerpts yet" would be alarming and wrong when the library
 * is full and the filter is simply hiding all of it.
 */
function emptyMessage(selectedOnly: boolean, searching: boolean): string {
  if (selectedOnly && searching) return "No selected excerpts match that search.";
  if (selectedOnly) return "Nothing is selected.";
  if (searching) return "Nothing matches that search.";
  return "No excerpts yet.";
}
