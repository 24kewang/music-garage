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
import {
  buildTree,
  fileDescendants,
  togglePaths,
  type TreeNode,
} from "./lib/tree";
import { partitionImages, type Incoming } from "./lib/upload";
import FilterScreen from "./components/FilterScreen";
import SettingsPanel from "./components/SettingsPanel";
import StageScreen from "./components/StageScreen";
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
  // Camera mode is session state on purpose: every visit starts camera-free so the 3D
  // stack is only fetched once a player asks for it. Persisting it would undo that on
  // the next load. See lib/settings.ts.
  const [useCamera, setUseCamera] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  const changeUseCamera = useCallback((next: boolean) => {
    setUseCamera(next);
    // Locked optimistically, so there is no window between this click and
    // FilterScreen's first report in which the switch is still live. FilterScreen
    // clears it once the camera settles, either way.
    if (next) setCameraBusy(true);
  }, []);
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
    let canceled = false;
    void listImagePaths().then((found) => {
      if (!canceled) setPaths(found);
    });
    return () => {
      canceled = true;
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

  const handleToggleFiles = useCallback(
    (files: readonly string[], value: boolean) => {
      const all = paths ?? [];
      const nextChecked = togglePaths(files, checked, value);
      applyExcluded(new Set(all.filter((p) => !nextChecked.has(p))), all);
    },
    [paths, checked, applyExcluded],
  );

  const handleToggle = useCallback(
    (node: TreeNode, value: boolean) => {
      handleToggleFiles(fileDescendants(node), value);
    },
    [handleToggleFiles],
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
      {/*
       * Conditional, never mounted-and-hidden. Hiding the filter would leave the camera
       * running with its light on, and — worse — MindAR never removes the canvas it
       * appends to the container, so a hidden screen would stack a dead canvas on every
       * toggle. Unmounting makes React discard the subtree, orphaned canvas and all.
       */}
      {useCamera ? (
        <FilterScreen
          checked={checkedList}
          placement={placement}
          showCaption={settings.showCaption}
          spinning={spinning}
          onSpinningChange={setSpinning}
          onOverlayChange={setOverlayOpen}
          onBusyChange={setCameraBusy}
        />
      ) : (
        <StageScreen
          checked={checkedList}
          scalePercent={settings.scalePercent}
          showCaption={settings.showCaption}
          spinning={spinning}
          onSpinningChange={setSpinning}
          onOverlayChange={setOverlayOpen}
        />
      )}
      <SettingsPanel
        root={tree}
        checked={checked}
        disabled={spinning || overlayOpen}
        settings={settings}
        onSettingsChange={updateSettings}
        useCamera={useCamera}
        cameraBusy={cameraBusy}
        onUseCameraChange={changeUseCamera}
        onToggle={handleToggle}
        onToggleFiles={handleToggleFiles}
        onUpload={handleUpload}
        onDeleteAll={handleDeleteAll}
      />
    </>
  );
}
