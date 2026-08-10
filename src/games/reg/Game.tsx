"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { config } from "./config";
import {
  deleteAll,
  isOpfsSupported,
  listImagePaths,
  requestPersistence,
  writeFiles,
} from "./lib/opfs";
import { checkedFiles, loadExcluded, saveExcluded } from "./lib/selection";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  placementFromSettings,
  saveSettings,
  type Settings,
} from "./lib/settings";
import { buildTree, toggleNode, type TreeNode } from "./lib/tree";
import { partitionImages, type Incoming } from "./lib/upload";
import FilterScreen from "./components/FilterScreen";
import SettingsPanel from "./components/SettingsPanel";
import UploadScreen, { type UploadResult } from "./components/UploadScreen";
import styles from "./game.module.css";

/**
 * Random Excerpt Generator — orchestration only.
 *
 * Which screen shows follows from one async fact (what's in the OPFS library);
 * everything camera- and three.js-shaped lives behind FilterScreen. Selection is
 * stored as the *excluded* set so new uploads default to checked.
 */
export default function Game() {
  /** null while the OPFS scan is still running. */
  const [paths, setPaths] = useState<string[] | null>(null);
  const [supported, setSupported] = useState(true);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [spinning, setSpinning] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const saveTimerRef = useRef(0);
  const unsavedRef = useRef<Settings | null>(null);

  // Starts empty so the server and first client render agree; the stored selection
  // and the library scan are adopted once mounted.
  useEffect(() => {
    if (!isOpfsSupported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }
    setExcluded(loadExcluded());
    setSettings(loadSettings());
    let cancelled = false;
    void listImagePaths().then((found) => {
      if (!cancelled) setPaths(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A slider drag fires ~60 times a second and the filter follows every one, but the
  // storage write can wait for the drag to settle.
  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    unsavedRef.current = next;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveSettings(next);
      unsavedRef.current = null;
    }, config.tuning.saveDebounceMs);
  }, []);

  // Leaving mid-drag flushes rather than drops the last change.
  useEffect(
    () => () => {
      window.clearTimeout(saveTimerRef.current);
      if (unsavedRef.current) saveSettings(unsavedRef.current);
    },
    [],
  );

  const placement = useMemo(() => placementFromSettings(settings), [settings]);
  const tree = useMemo(() => buildTree(paths ?? []), [paths]);
  const checked = useMemo(
    () => checkedFiles(paths ?? [], excluded),
    [paths, excluded],
  );
  const checkedList = useMemo(
    () => (paths ?? []).filter((path) => checked.has(path)),
    [paths, checked],
  );

  const applyExcluded = useCallback(
    (next: ReadonlySet<string>, allPaths: readonly string[]) => {
      setExcluded(next);
      saveExcluded(next, new Set(allPaths));
    },
    [],
  );

  const handleToggle = useCallback(
    (node: TreeNode, value: boolean) => {
      const all = paths ?? [];
      const nextChecked = toggleNode(node, checked, value);
      applyExcluded(new Set(all.filter((p) => !nextChecked.has(p))), all);
    },
    [paths, checked, applyExcluded],
  );

  const handleToggleAll = useCallback(
    (value: boolean) => {
      const all = paths ?? [];
      applyExcluded(value ? new Set() : new Set(all), all);
    },
    [paths, applyExcluded],
  );

  const handleUpload = useCallback(
    async (incoming: Incoming[]): Promise<UploadResult> => {
      const { accepted, skipped } = partitionImages(incoming);
      if (accepted.length > 0) {
        await writeFiles(accepted);
        void requestPersistence();
        const found = await listImagePaths();
        setPaths(found);
      }
      return { added: accepted.length, skipped };
    },
    [],
  );

  const handleDeleteAll = useCallback(async () => {
    await deleteAll();
    setPaths([]);
    applyExcluded(new Set(), []);
  }, [applyExcluded]);

  if (!supported) {
    return (
      <div className={styles.placeholder}>
        <h1 className={styles.unsupportedTitle}>Random Excerpt Generator</h1>
        <p className={styles.unsupportedBody}>
          This game keeps your excerpt images in the browser&apos;s private file
          storage, which this browser doesn&apos;t support yet. A current Chrome,
          Edge, Firefox or Safari will work.
        </p>
      </div>
    );
  }

  if (paths === null) {
    return <div className={styles.placeholder}>Opening your excerpt library…</div>;
  }

  if (paths.length === 0) {
    return <UploadScreen onUpload={handleUpload} />;
  }

  return (
    <>
      <FilterScreen
        checked={checkedList}
        placement={placement}
        showCaption={settings.showCaption}
        spinning={spinning}
        onSpinningChange={setSpinning}
        onOverlayChange={setOverlayOpen}
      />
      <SettingsPanel
        root={tree}
        checked={checked}
        disabled={spinning || overlayOpen}
        settings={settings}
        onSettingsChange={updateSettings}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
        onUpload={handleUpload}
        onDeleteAll={handleDeleteAll}
      />
    </>
  );
}
