// Image Warp — a Liquify-style interactive warp for the Develop module.
//
// The warp is a non-destructive, RAW-grade GPU resample: a scene-linear stage
// (warp-stage.ts) samples the decoded source at displaced UVs read from a
// displacement field (field.ts) that the canvas overlay (Overlay.ts) paints with
// brush strokes. The field persists per-photo as a compact binary sidecar and
// rides the undo stack via a revision token in the photo's paramBag
// (persistence.ts). The panel (Panel.ts) and toolbar button (Toolbar.ts) drive
// the tool + brush settings.
//
// Core provides only generic hooks: a scene-linear GPU stage with a dynamic
// texture, a develop-canvas overlay slot with image-space pointer mapping, and
// per-photo opaque blob storage (api.develop.put/getPhotoData). All warp logic
// lives here.

import type { SafelightAPI } from "./safelight";
import { initRuntime, api as theApi } from "./runtime";
import { initStore, warpStore } from "./store";
import { buildStage, STAGE_ID, FIELD_KEY } from "./warp-stage";
import * as field from "./field";
import * as persistence from "./persistence";
import { initWarpKeys } from "./keys";
import { WarpOverlay } from "./Overlay";
import { WarpPanel } from "./Panel";

const ID = "com.safelight.image-warp";
const TOGGLE_ACTION = `${ID}.toggle`;

let unsubscribe: (() => void) | null = null;
let unbindKeys: (() => void) | null = null;

function inDevelop(api: SafelightAPI): boolean {
  const detached = new URLSearchParams(window.location.search).get("detached");
  const active =
    api.stores.useUIStore.getState().activeModule === "develop" ||
    detached === "develop";
  return active && !!api.stores.useDevelopStore.getState().photoId;
}

export function activate(api: SafelightAPI): void {
  initRuntime(api);
  initStore();

  // GPU warp stage + an initial empty field so the sampler is always valid.
  api.registerProcessingStage(buildStage());
  field.clear();
  field.push();

  // Reflect the currently-loaded photo (if any), then keep the live field in
  // sync with photo switches and undo/redo.
  persistence.sync();
  unsubscribe = persistence.subscribe();
  unbindKeys = initWarpKeys();

  api.registerKeybinding({
    id: TOGGLE_ACTION,
    label: "Image Warp",
    category: "Develop",
    defaultCombo: "Shift+W",
    handler: () => {
      if (inDevelop(api)) warpStore().getState().toggleWarp();
    },
  });

  api.registerSlot({
    id: `${ID}.overlay`,
    slot: "develop-canvas-overlay",
    component: WarpOverlay,
    order: 40,
  });

  api.registerPanel({
    id: `${ID}.panel`,
    title: "Warp",
    component: WarpPanel,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 250 },
    onReset: () => {
      void persistence.clearWarp();
    },
  });
}

export function deactivate(): void {
  unsubscribe?.();
  unsubscribe = null;
  unbindKeys?.();
  unbindKeys = null;
  try {
    const api = theApi();
    api.setStageTexture(STAGE_ID, FIELD_KEY, null);
    api.unregisterProcessingStage(STAGE_ID);
  } catch {
    /* api not initialised — nothing to tear down */
  }
}
