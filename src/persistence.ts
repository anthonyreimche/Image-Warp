// Per-photo persistence + history wiring for the warp field.
//
// The trick that keeps the core change tiny: the actual field bytes live in a
// binary sidecar (api.develop.put/getPhotoData), but the only thing written into
// the photo's paramBag is a monotonic REVISION TOKEN (fieldRev). Because paramBag
// is snapshotted by commitEdit, restored by undo/redo, and serialised to the
// sidecar JSON, the token gives us persistence + full undo "for free" — we just
// react to it.
//
// In-session undo needs the field at each past revision, so we keep a small
// FIFO of decoded fields in memory. After an app reload only the current
// revision's bytes exist on disk; undoing past that re-reads disk, finds a rev
// mismatch, and clears (documented limitation) rather than showing a wrong warp.

import { api } from "./runtime";
import { ENABLED_PARAM, FIELD_REV_PARAM } from "./warp-stage";
import * as field from "./field";

const MEMO_MAX = 64;
const memo = new Map<string, Float32Array>(); // `${photoId}:${rev}` -> field copy
let revCounter = 0;

/** Last (photoId, rev) we've reflected into the live field — guards the
 *  subscription from reloading a state we already show (e.g. our own commit). */
let appliedKey = "";

function devStore() {
  return api().stores.useDevelopStore;
}

function currentRev(): number {
  const v = devStore().getState().paramBag[FIELD_REV_PARAM];
  return typeof v === "number" ? v : 0;
}

function memoSet(key: string, buf: Float32Array): void {
  memo.set(key, buf);
  if (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value as string | undefined;
    if (oldest !== undefined) memo.delete(oldest);
  }
}

/** Commit the current field as a new revision: store it, point the photo at it,
 *  and checkpoint history. Call at the end of a stroke (or a panel action). */
export async function commit(label: string): Promise<void> {
  const photoId = devStore().getState().photoId;
  if (!photoId) return;
  const rev = ++revCounter;
  const key = `${photoId}:${rev}`;
  memoSet(key, field.getField().slice());
  appliedKey = key;
  api().develop.putPhotoData("warpField", field.serialize(rev));
  devStore().getState().setDynParams({
    [FIELD_REV_PARAM]: rev,
    [ENABLED_PARAM]: field.isEmpty() ? 0 : 1,
  });
  await devStore().getState().commitEdit(label);
}

/** Wipe the warp on the current photo and checkpoint it. */
export async function clearWarp(): Promise<void> {
  const photoId = devStore().getState().photoId;
  if (!photoId) return;
  field.clear();
  field.push();
  const rev = ++revCounter;
  appliedKey = `${photoId}:${rev}`;
  memoSet(appliedKey, field.getField().slice());
  api().develop.putPhotoData("warpField", null);
  devStore().getState().setDynParams({
    [FIELD_REV_PARAM]: rev,
    [ENABLED_PARAM]: 0,
  });
  await devStore().getState().commitEdit("Clear Warp");
}

/** Reflect the current photo + its fieldRev into the live field + GPU texture.
 *  Idempotent; safe to call often. */
export function sync(): void {
  const photoId = devStore().getState().photoId;
  if (!photoId) {
    field.clear();
    field.push();
    appliedKey = "";
    return;
  }
  const rev = currentRev();
  const key = `${photoId}:${rev}`;
  if (key === appliedKey) return;

  if (rev === 0) {
    // No warp recorded for this photo.
    field.clear();
    field.push();
    appliedKey = key;
    return;
  }

  revCounter = Math.max(revCounter, rev);

  const cached = memo.get(key);
  if (cached) {
    field.setFrom(cached);
    field.push();
    appliedKey = key;
    return;
  }

  // Not in memory — read the sidecar (only the current rev survives a reload).
  appliedKey = key; // claim it now; a stale async result re-checks below
  void api()
    .develop.getPhotoData("warpField")
    .then((bytes) => {
      // Bail if the photo/rev moved on while we awaited disk.
      if (devStore().getState().photoId !== photoId || currentRev() !== rev) return;
      const parsed = bytes ? field.parse(bytes) : null;
      if (parsed && parsed.rev === rev) {
        memoSet(key, parsed.buf.slice());
        field.setFrom(parsed.buf);
      } else {
        field.clear();
      }
      field.push();
    });
}

/** Subscribe to develop-store changes; resync whenever the photo or its
 *  fieldRev token changes (photo switch, undo, redo, preset, reload). */
export function subscribe(): () => void {
  let lastPhoto = devStore().getState().photoId;
  let lastRev = currentRev();
  return devStore().subscribe((s) => {
    const rev = typeof s.paramBag[FIELD_REV_PARAM] === "number"
      ? (s.paramBag[FIELD_REV_PARAM] as number)
      : 0;
    if (s.photoId === lastPhoto && rev === lastRev) return;
    lastPhoto = s.photoId;
    lastRev = rev;
    sync();
  });
}
