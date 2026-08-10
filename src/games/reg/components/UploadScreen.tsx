"use client";

import { useRef, useState, type DragEvent } from "react";
import { FolderOpenIcon, ImagesIcon } from "@phosphor-icons/react";
import {
  fromDataTransfer,
  fromDirectoryInput,
  fromFileList,
  type Incoming,
} from "../lib/upload";
import styles from "./UploadScreen.module.css";

export interface UploadResult {
  added: number;
  skipped: number;
}

/**
 * The empty-library screen: three ways in — file picker, folder picker, and a
 * drag-and-drop zone that takes mixed loose files and whole folder trees.
 */
export default function UploadScreen({
  onUpload,
}: {
  onUpload: (incoming: Incoming[]) => Promise<UploadResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleIncoming = async (incoming: Incoming[]) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { added, skipped } = await onUpload(incoming);
      if (added === 0) {
        setNotice(
          incoming.length === 0
            ? "Nothing arrived — try picking the files again."
            : "No images found — only image files are kept.",
        );
      } else if (skipped > 0) {
        setNotice(`Skipped ${skipped} non-image file${skipped === 1 ? "" : "s"}.`);
      }
    } catch {
      setNotice("Something went wrong saving those files. Try again?");
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    void fromDataTransfer(event.dataTransfer.items).then(handleIncoming);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.stage}>
        <h1 className={styles.title}>Random Excerpt Generator</h1>
        <p className={styles.tagline}>
          Load your excerpt library — images of the passages you practise. They stay
          in this browser; nothing is uploaded anywhere.
        </p>

        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className={styles.dropHint}>
            {busy ? "Saving your excerpts…" : "Drop images or folders here"}
          </p>

          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.pick}
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagesIcon size={22} weight="bold" aria-hidden="true" />
              Upload images
            </button>
            <button
              type="button"
              className={styles.pick}
              disabled={busy}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpenIcon size={22} weight="bold" aria-hidden="true" />
              Upload folder
            </button>
          </div>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}
      </div>

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
