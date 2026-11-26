// Activation contract against a stand-in API in node: the warp tool holds the
// develop canvas while it's armed, takes core's brush shortcuts through the
// held tool, and lets the canvas go when disarmed or deactivated. No React
// render — the overlay and panel are exercised by the in-app checks.

import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { activate, deactivate } from "../src/index.ts";
import { warpStore } from "../src/store.ts";

function fakeStore(init) {
  let state;
  const listeners = new Set();
  const set = (partial) => {
    const prev = state;
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    for (const l of listeners) l(state, prev);
  };
  const get = () => state;
  state = typeof init === "function" ? init(set, get) : init;
  const hook = (selector) => (selector ? selector(state) : state);
  hook.getState = get;
  hook.setState = set;
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

// A stand-in for core's brush: its defaults, and one step up or down per
// setting from the settings the tool passes (null for one it didn't pass).
const BRUSH_DEFAULTS = { size: 0.07, feather: 0.4, opacity: 0.9, flow: 0.8 };
const BRUSH_STEPS = {
  "brush.smaller": ["size", -0.01],
  "brush.larger": ["size", 0.01],
  "brush.featherDown": ["feather", -0.05],
  "brush.featherUp": ["feather", 0.05],
  "brush.opacityDown": ["opacity", -0.1],
  "brush.opacityUp": ["opacity", 0.1],
  "brush.flowDown": ["flow", -0.1],
  "brush.flowUp": ["flow", 0.1],
};
const stepBrush = (action, brush) => {
  const s = BRUSH_STEPS[action];
  return s && brush[s[0]] !== undefined ? { key: s[0], value: brush[s[0]] + s[1] } : null;
};

const nav = { module: "library" };

function fakeApi() {
  const registered = { keys: [], panels: [], slots: [], tools: [], providers: {} };
  const api = {
    react: {},
    registerProcessingStage() {},
    unregisterProcessingStage() {},
    setStageTexture() {},
    setStageTextureProvider: (stageId, key, provide) => void (registered.providers[`${stageId}.${key}`] = provide),
    dropStageTextureVariants() {},
    registerKeybinding: (c) => void registered.keys.push(c),
    registerSlot: (c) => void registered.slots.push(c),
    registerPanel: (c) => void registered.panels.push(c),
    stores: {
      create: fakeStore,
      useDevelopStore: fakeStore({ photoId: null, paramBag: {} }),
    },
    navigation: { current: () => nav.module },
    develop: {
      putPhotoData() {},
      getPhotoData: () => Promise.resolve(null),
      setCanvasTool: (t) => void registered.tools.push(t),
      brush: { defaults: BRUSH_DEFAULTS, actions: Object.keys(BRUSH_STEPS), step: stepBrush },
    },
  };
  return { api, registered };
}

beforeEach(() => {
  nav.module = "library";
});

afterEach(() => {
  deactivate();
});

test("registers the panel and shortcut, with no overlay slot of its own", () => {
  const { api, registered } = fakeApi();
  activate(api);
  assert.deepEqual(registered.panels.map((p) => p.id), ["com.safelight.image-warp.panel"]);
  assert.deepEqual(registered.keys.map((k) => k.defaultCombo), ["Shift+W"]);
  assert.deepEqual(registered.slots, []);
});

// A thumbnail or an export of a photo that isn't open draws that photo's own
// field, which Safelight asks for (SafeLight #278).
test("makes each photo's field on demand, and stops when deactivated", () => {
  const { api, registered } = fakeApi();
  activate(api);
  assert.equal(typeof registered.providers["com.safelight.image-warp.warp.warpField"], "function");
  deactivate();
  assert.equal(registered.providers["com.safelight.image-warp.warp.warpField"], null);
});

test("holds the canvas tool while the warp is armed and lets it go when off", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  warpStore().getState().setWarpActive(false);
  assert.deepEqual(registered.tools.map((t) => t !== null), [true, false]);
});

test("starts at the official brush's size and feather, and its own warp strength", () => {
  const { api } = fakeApi();
  activate(api);
  const st = warpStore().getState();
  assert.deepEqual([st.size, st.feather], [0.07, 0.4]);
  // Density and Rate are how hard and how fast a stroke warps, not paint:
  // they keep Image Warp's own gentle start.
  assert.deepEqual([st.density, st.rate], [0.5, 0.5]);
});

test("takes core's brush shortcuts while it holds the canvas", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  const tool = registered.tools[0];
  assert.equal(tool.zoomable, true);
  assert.equal(tool.wants("brush.larger"), true);
  assert.equal(tool.onAction("brush.larger"), true);
  assert.ok(Math.abs(warpStore().getState().size - 0.08) < 1e-9);
  assert.equal(tool.onAction("brush.featherDown"), true);
  assert.ok(Math.abs(warpStore().getState().feather - 0.35) < 1e-9);
  assert.equal(tool.onAction("brush.opacityUp"), true);
  assert.ok(Math.abs(warpStore().getState().density - 0.6) < 1e-9);
  assert.equal(tool.onAction("brush.flowDown"), true);
  assert.ok(Math.abs(warpStore().getState().rate - 0.4) < 1e-9);
  assert.equal(tool.wants("mask.delete"), false);
  assert.equal(tool.onAction("mask.delete"), false);
  tool.onEscape();
  assert.equal(warpStore().getState().warpActive, false);
});

test("holds a stepped setting to its range", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  const tool = registered.tools[0];
  warpStore().getState().setDensity(0.95);
  tool.onAction("brush.opacityUp");
  tool.onAction("brush.opacityUp");
  assert.equal(warpStore().getState().density, 1);
});

test("disarms and lets the canvas go on deactivate", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  deactivate();
  assert.equal(warpStore().getState().warpActive, false);
  assert.equal(registered.tools[registered.tools.length - 1], null);
});

test("the shortcut toggles the warp only in Develop with a photo open", () => {
  const { api, registered } = fakeApi();
  activate(api);
  const toggle = registered.keys[0].handler;
  nav.module = "develop";
  toggle();
  assert.equal(warpStore().getState().warpActive, false);
  api.stores.useDevelopStore.setState({ photoId: "p1" });
  nav.module = "library";
  toggle();
  assert.equal(warpStore().getState().warpActive, false);
  nav.module = "develop";
  toggle();
  assert.equal(warpStore().getState().warpActive, true);
});
