// The panel's brush sliders against a stand-in React that records the element
// tree: they read as percentages (size 1 to 50, the rest 0 to 100) while the
// store keeps its fractions, and the panel carries no explanatory text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { initRuntime } from "../src/runtime.ts";
import { initStore, warpStore } from "../src/store.ts";
import { WarpPanel } from "../src/Panel.ts";

const Slider = function Slider() {};
const Button = function Button() {};

const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useEffect() {},
};

function fakeStore(init) {
  let state = init;
  const listeners = new Set();
  const hook = (selector) => (selector ? selector(state) : state);
  hook.getState = () => state;
  hook.setState = (partial) => {
    const prev = state;
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    for (const l of listeners) l(state, prev);
  };
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

function mount() {
  const api = {
    react,
    components: { Slider },
    ui: { Button, tokens: { borderSubtle: "var(--color-border-subtle)" } },
    develop: {
      brush: { defaults: { size: 0.08, feather: 0.5, opacity: 1, flow: 1 } },
      useCanvasToolHeld: () => true,
    },
    stores: {
      create: (init) => {
        let hook;
        const set = (p) => hook.setState(p);
        hook = fakeStore(init(set, () => hook.getState()));
        return hook;
      },
    },
  };
  initRuntime(api);
  initStore();
  warpStore().getState().setWarpActive(true);
}

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node === null || typeof node !== "object") return;
  visit(node);
  walk(node.props?.children, visit);
}

function sliders() {
  const found = {};
  walk(WarpPanel(), (n) => {
    if (n.type === Slider) found[n.props.label] = n.props;
  });
  return found;
}

function texts() {
  const out = [];
  walk(WarpPanel(), (n) => {
    for (const c of n.props?.children ?? []) if (typeof c === "string") out.push(c);
  });
  return out;
}

test("shows the brush as percentages like Masking's", () => {
  mount();
  const s = sliders();
  assert.deepEqual([s.Size.min, s.Size.max, s.Size.step, s.Size.value, s.Size.defaultValue], [1, 50, 1, 8, 8]);
  for (const label of ["Feather", "Density", "Pressure", "Rate"]) {
    assert.deepEqual([s[label].min, s[label].max, s[label].step], [label === "Density" || label === "Rate" ? 1 : 0, 100, 1], label);
  }
  assert.equal(s.Feather.value, 50);
  assert.equal(s.Feather.defaultValue, 50);
  assert.equal(s.Density.defaultValue, 50);
  assert.equal(s.Rate.defaultValue, 50);
  assert.equal(s.Pressure.defaultValue, 100);
});

test("stores a slider's percentage as a fraction", () => {
  mount();
  const s = sliders();
  s.Size.onChange(25);
  s.Feather.onChange(30);
  s.Density.onChange(70);
  s.Rate.onChange(20);
  s.Pressure.onChange(60);
  const st = warpStore().getState();
  assert.deepEqual([st.size, st.feather, st.density, st.rate, st.pressure], [0.25, 0.3, 0.7, 0.2, 0.6]);
  assert.equal(st.previewing, true);
  s.Size.onCommit();
  assert.equal(warpStore().getState().previewing, false);
});

test("explains the drag in a tooltip, not panel text", () => {
  mount();
  assert.equal(texts().some((t) => /Drag on the image/.test(t)), false);
  let tip = null;
  walk(WarpPanel(), (n) => {
    if (n.props?.title === "Drag on the image to warp") tip = n;
  });
  assert.notEqual(tip, null);
});
