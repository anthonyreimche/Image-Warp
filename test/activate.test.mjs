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

function fakeApi() {
  const registered = { keys: [], panels: [], slots: [], tools: [] };
  const api = {
    react: {},
    registerProcessingStage() {},
    unregisterProcessingStage() {},
    setStageTexture() {},
    registerKeybinding: (c) => void registered.keys.push(c),
    registerSlot: (c) => void registered.slots.push(c),
    registerPanel: (c) => void registered.panels.push(c),
    stores: {
      create: fakeStore,
      useDevelopStore: fakeStore({ photoId: null, paramBag: {} }),
      useUIStore: fakeStore({ activeModule: "develop" }),
    },
    develop: {
      putPhotoData() {},
      getPhotoData: () => Promise.resolve(null),
      setCanvasTool: (t) => void registered.tools.push(t),
    },
  };
  return { api, registered };
}

beforeEach(() => {
  // The Shift+W handler reads the detached-window query string.
  globalThis.window = { location: { search: "" } };
});

afterEach(() => {
  deactivate();
  delete globalThis.window;
});

test("registers the panel and shortcut, with no overlay slot of its own", () => {
  const { api, registered } = fakeApi();
  activate(api);
  assert.deepEqual(registered.panels.map((p) => p.id), ["com.safelight.image-warp.panel"]);
  assert.deepEqual(registered.keys.map((k) => k.defaultCombo), ["Shift+W"]);
  assert.deepEqual(registered.slots, []);
});

test("holds the canvas tool while the warp is armed and lets it go when off", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  warpStore().getState().setWarpActive(false);
  assert.deepEqual(registered.tools.map((t) => t !== null), [true, false]);
});

test("takes core's brush shortcuts while it holds the canvas", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  const tool = registered.tools[0];
  assert.equal(tool.zoomable, true);
  assert.equal(tool.wants("brush.larger"), true);
  assert.equal(tool.onAction("brush.larger"), true);
  assert.ok(Math.abs(warpStore().getState().size - 0.16) < 1e-9);
  // Less feather is a harder edge.
  assert.equal(tool.onAction("brush.featherDown"), true);
  assert.ok(Math.abs(warpStore().getState().hardness - 0.55) < 1e-9);
  assert.equal(tool.onAction("brush.opacityUp"), true);
  assert.ok(Math.abs(warpStore().getState().density - 0.6) < 1e-9);
  assert.equal(tool.onAction("brush.flowDown"), true);
  assert.ok(Math.abs(warpStore().getState().rate - 0.4) < 1e-9);
  assert.equal(tool.wants("mask.delete"), false);
  assert.equal(tool.onAction("mask.delete"), false);
  tool.onEscape();
  assert.equal(warpStore().getState().warpActive, false);
});

test("disarms and lets the canvas go on deactivate", () => {
  const { api, registered } = fakeApi();
  activate(api);
  warpStore().getState().setWarpActive(true);
  deactivate();
  assert.equal(warpStore().getState().warpActive, false);
  assert.equal(registered.tools[registered.tools.length - 1], null);
});
