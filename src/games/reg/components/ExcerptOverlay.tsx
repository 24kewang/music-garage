"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
import { useDismiss } from "@/shared/hooks/useDismiss";
import { config } from "../config";
import { excerptSegments } from "../lib/names";
import { readFileBlob } from "../lib/opfs";
import styles from "./ExcerptOverlay.module.css";

type Load =
  | { state: "loading" }
  | { state: "ready"; url: string }
  | { state: "failed" };

/**
 * The excerpt, big enough to read.
 *
 * The filter sizes the image to the player's head, which is fine for recognizing a
 * piece and useless for actually playing it — so clicking the floating excerpt opens
 * it here at viewport size. Deliberately a still: no zoom or pan, so a phone's own
 * pinch-zoom keeps working.
 */
export default function ExcerptOverlay({
  path,
  showName,
  onClose,
}: {
  path: string;
  /** Follows the Filter tab's caption setting. */
  showName: boolean;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  /** Too tall to be worth fitting to the screen — scroll it at full width instead. */
  const [tall, setTall] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape, or a pointer down anywhere off the card — which the backdrop guarantees
  // covers the whole viewport.
  useDismiss(true, cardRef, onClose);

  useEffect(() => {
    let url: string | null = null;
    let canceled = false;

    // Read the file again rather than reusing the TexturePool's ImageBitmap: those are
    // decoded with `imageOrientation: "flipY"` for WebGL, so drawing one here would
    // come out upside-down.
    void readFileBlob(path).then(
      (blob) => {
        if (canceled) return;
        url = URL.createObjectURL(blob);
        setLoad({ state: "ready", url });
      },
      () => {
        if (!canceled) setLoad({ state: "failed" });
      },
    );

    return () => {
      canceled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [path]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // The whole path, unabbreviated — the floating caption may have dropped folders.
  const fullName = excerptSegments(path).join(config.names.separator);

  return (
    <div className={styles.backdrop}>
      <div
        className={`${styles.card} ${tall ? styles.cardTall : ""}`}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={fullName}
      >
        <button
          type="button"
          className={styles.close}
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={20} weight="bold" aria-hidden="true" />
        </button>

        {load.state === "ready" ? (
          <div className={styles.figure}>
            {/* next/image has nothing to offer here: the source is a runtime blob: URL
                from the browser's own file storage, with dimensions known only once
                decoded, and there is no server in the loop to optimize through. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.image}
              src={load.url}
              alt={fullName}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                setTall(
                  naturalWidth > 0 &&
                    naturalHeight / naturalWidth > config.overlay.scrollAboveRatio,
                );
              }}
            />
          </div>
        ) : (
          <p className={styles.status}>
            {load.state === "loading"
              ? "Opening…"
              : "That image couldn't be opened."}
          </p>
        )}

        {showName && <p className={styles.name}>{fullName}</p>}
      </div>
    </div>
  );
}
