// The overlay's tree for the held tool, drawn without a renderer: hooks are
// stubbed (state stays at its first value, effects don't run) and elements are
// plain objects, enough to see what the overlay hands the official ring and
// that it leaves pan and zoom to core.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { initRuntime } from "../src/runtime.ts";
import { initStore, warpStore } from "../src/store.ts";
import { WarpOverlay } from "../src/Overlay.ts";

const BrushCursor = () => null;

const rect = { x: 0, y: 0, w: 400, h: 300 };
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (v) => [v, () => {}],
  useRef: (v) => ({ current: v }),
  useEffect: () => {},
};

function fakeStore(init) {
  let state;
  const set = (partial) => void (state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) });
  state = init(set, () => state);
  const hook = (selector) => (selector ? selector(state) : state);
  hook.getState = () => state;
  hook.setState = set;
  return hook;
}

beforeEach(() => {
  initRuntime({
    react: stubReact,
    stores: {
      create: fakeStore,
      useDevelopStore: fakeStore(() => ({ photoId: "p", paramBag: {} })),
    },
    develop: {
      brush: { defaults: { size: 0.08, feather: 0.5, opacity: 1, flow: 1 } },
      BrushCursor,
      framePoint: () => ({ x: 0, y: 0 }),
      useDevelopOverlay: () => ({ rect, imageRect: rect, nonce: 1, toImage: (x, y) => ({ x, y }), radiusToScreen: (r) => r }),
      setCanvasCursor: () => () => {},
    },
  });
  initStore();
  warpStore().getState().setWarpActive(true);
});

const find = (node, type) =>
  node && typeof node === "object"
    ? node.type === type
      ? node
      : (node.children ?? []).map((c) => find(c, type)).find(Boolean)
    : undefined;

test("draws the official ring, sized and feathered as the brush is", () => {
  warpStore().getState().setSize(0.2);
  warpStore().getState().setFeather(0.3);
  const ring = find(WarpOverlay(), BrushCursor);
  assert.deepEqual(ring.props, { at: null, size: 0.2, feather: 0.3 });
});

test("shows the ring at the centre while a brush slider is dragged", () => {
  warpStore().getState().setPreviewing(true);
  assert.equal(find(WarpOverlay(), BrushCursor).props.at, "centre");
});

test("leaves Ctrl, Cmd and Space to core", () => {
  const style = WarpOverlay().props.style;
  assert.equal(style.pointerEvents, undefined);
  assert.equal(style.cursor, undefined);
});
