import { test } from "node:test";
import assert from "node:assert/strict";
import { initRuntime } from "../src/runtime.ts";
import { frameLocalPoint } from "../src/Overlay.ts";

function withUiScale(uiScale) {
  initRuntime({ react: {}, stores: { useSettings: { getState: () => ({ uiScale }) } } });
}

// Under Interface scale the <body> is CSS-zoomed: clientX and the bounding rect
// are in zoomed visual pixels, while toImage and the rings take layout pixels.
const root = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 1000, height: 750 }) };

test("maps the pointer into layout pixels at Interface scale 125 %", () => {
  withUiScale(1.25);
  const layout = { lx: 400, ly: 300 };
  const clientX = 100 + layout.lx * 1.25;
  const clientY = 50 + layout.ly * 1.25;
  assert.deepEqual(frameLocalPoint(root, clientX, clientY), layout);
});

test("is the plain offset on an app without the settings store", () => {
  initRuntime({ react: {}, stores: {} });
  assert.deepEqual(frameLocalPoint(root, 340, 170), { lx: 240, ly: 120 });
});

test("is the plain offset at Interface scale 100 %", () => {
  withUiScale(1);
  assert.deepEqual(frameLocalPoint(root, 340, 170), { lx: 240, ly: 120 });
});
