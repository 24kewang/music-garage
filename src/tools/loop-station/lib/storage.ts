"use client";

import { config } from "../config";
import { parseSnapshot, SAVE_SLOT, type LoopSnapshot } from "./snapshot";

/**
 * Browser-side persistence for a saved loop, on IndexedDB.
 *
 * IndexedDB rather than OPFS: it stores `ArrayBuffer`s directly through
 * structured clone — no file naming, no sync-access-handle worker dance — and
 * the manifest and the audio go in under one transaction, so a save is never
 * half-written.
 *
 * Audio is kept as Float32, exactly as recorded. A full twenty-track station is
 * roughly 70MB, which IndexedDB carries comfortably; converting to Int16 would
 * halve it if quota ever becomes the binding constraint.
 *
 * Deliberately thin, because none of it can run under the Node test
 * environment. Everything with a decision in it lives in `snapshot.ts`.
 */

export type StoredSegments = Map<number, Float32Array>;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.save.dbName, config.save.dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(config.save.manifestStore)) {
        db.createObjectStore(config.save.manifestStore);
      }
      if (!db.objectStoreNames.contains(config.save.segmentStore)) {
        db.createObjectStore(config.save.segmentStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error);
  });
}

/** Write the manifest and every referenced recording as one transaction. */
export async function saveLoop(
  snapshot: LoopSnapshot,
  segments: StoredSegments,
): Promise<void> {
  const db = await open();
  try {
    const transaction = db.transaction(
      [config.save.manifestStore, config.save.segmentStore],
      "readwrite",
    );
    const manifests = transaction.objectStore(config.save.manifestStore);
    const audio = transaction.objectStore(config.save.segmentStore);

    manifests.put(snapshot, SAVE_SLOT);
    // Clear first: a shorter loop must not leave the previous save's extra
    // recordings behind to grow the database forever.
    audio.clear();
    for (const [id, samples] of segments) {
      audio.put(samples, `${SAVE_SLOT}:${id}`);
    }
    await finish(transaction);
  } finally {
    db.close();
  }
}

/**
 * Drop the saved loop. Both stores are cleared, which for a single-slot design
 * is the whole save; the localStorage settings — calibration and the
 * new-recording defaults — are a separate concern and deliberately survive.
 */
export async function deleteLoop(): Promise<void> {
  const db = await open();
  try {
    const transaction = db.transaction(
      [config.save.manifestStore, config.save.segmentStore],
      "readwrite",
    );
    transaction.objectStore(config.save.manifestStore).clear();
    transaction.objectStore(config.save.segmentStore).clear();
    await finish(transaction);
  } finally {
    db.close();
  }
}

/** Read back a save, or null when there isn't one (or it can't be trusted). */
export async function loadLoop(): Promise<{
  snapshot: LoopSnapshot;
  segments: StoredSegments;
} | null> {
  let db: IDBDatabase;
  try {
    db = await open();
  } catch {
    return null;
  }
  try {
    const transaction = db.transaction(
      [config.save.manifestStore, config.save.segmentStore],
      "readonly",
    );
    const manifests = transaction.objectStore(config.save.manifestStore);
    const audio = transaction.objectStore(config.save.segmentStore);

    const snapshot = parseSnapshot(await request(manifests.get(SAVE_SLOT)));
    if (!snapshot) return null;

    const keys = await request(audio.getAllKeys());
    const values = await request(audio.getAll());
    const segments: StoredSegments = new Map();
    keys.forEach((key, index) => {
      const id = Number(String(key).split(":")[1]);
      const value: unknown = values[index];
      if (!Number.isFinite(id)) return;
      if (value instanceof Float32Array) segments.set(id, value);
      else if (value instanceof ArrayBuffer) segments.set(id, new Float32Array(value));
    });

    return { snapshot, segments };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
