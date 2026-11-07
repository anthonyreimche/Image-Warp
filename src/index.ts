// Image Warp — a Liquify-style interactive warp for the Develop module.
//
// The warp is a non-destructive, RAW-grade GPU resample: a scene-linear stage
// (warp-stage.ts) samples the decoded source at displaced UVs read from a
// displacement field (field.ts) that the canvas overlay (Overlay.ts) paints with
// brush strokes. The field persists per-photo as a compact binary sidecar and
// rides the undo stack via a revision token in the photo's paramBag
// (persistence.ts). The panel (Panel.ts) drives the tool + brush settings.
//
// Core provides only generic hooks: a scene-linear GPU stage with a dynamic
// texture, the develop canvas tool with image-space pointer mapping, and
// per-photo opaque blob storage (api.develop.put/getPhotoData). All warp logic
// lives here.

import type { SafelightAPI } from "./safelight";
import { initRuntime, api as theApi } from "./runtime";
import { initStore, warpStore } from "./store";
import { buildStage, STAGE_ID, FIELD_KEY } from "./warp-stage";
import * as field from "./field";
import * as persistence from "./persistence";
import { WARP_TOOL } from "./Overlay";
import { WarpPanel } from "./Panel";

const ID = "com.safelight.image-warp";
const TOGGLE_ACTION = `${ID}.toggle`;

let unsubscribe: (() => void) | null = null;
let unfollow: (() => void) | null = null;

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

  // The warp armed holds the canvas; disarmed lets it go.
  unfollow = warpStore().subscribe((s, prev) => {
    if (s.warpActive !== prev.warpActive) api.develop.setCanvasTool(s.warpActive ? WARP_TOOL : null);
  });

  api.registerKeybinding({
    id: TOGGLE_ACTION,
    label: "Image Warp",
    category: "Develop",
    defaultCombo: "Shift+W",
    handler: () => {
      if (inDevelop(api)) warpStore().getState().toggleWarp();
    },
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
  try {
    warpStore().getState().setWarpActive(false);
    unfollow?.();
    unfollow = null;
    const api = theApi();
    api.develop.setCanvasTool(null);
    api.setStageTexture(STAGE_ID, FIELD_KEY, null);
    api.unregisterProcessingStage(STAGE_ID);
  } catch {
    /* api not initialised — nothing to tear down */
  }
}
