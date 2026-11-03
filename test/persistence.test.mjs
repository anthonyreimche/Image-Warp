import { test } from "node:test";
import assert from "node:assert/strict";
import { initRuntime } from "../src/runtime.ts";
import { FIELD_REV_PARAM } from "../src/warp-stage.ts";
import * as field from "../src/field.ts";
import { commit, sync } from "../src/persistence.ts";

const state = {
  photoId: null,
  paramBag: {},
  setDynParams(patch) {
    state.paramBag = { ...state.paramBag, ...patch };
  },
  async commitEdit() {},
};
const uploads = [];
const alerts = [];
let readPhotoData = () => Promise.resolve(null);

initRuntime({
  react: {},
  stores: { useDevelopStore: { getState: () => state } },
  setStageTexture(_stage, _key, tex) {
    uploads.push(tex ? Array.from(tex.data).some((v) => v !== 0) : null);
  },
  develop: {
    putPhotoData() {},
    getPhotoData: () => readPhotoData(),
  },
  ui: {
    alertDialog(options) {
      alerts.push(options);
      return Promise.resolve();
    },
  },
});

function warpedField(du) {
  const buf = new Float32Array(field.getField().length);
  buf[0] = du;
  return buf;
}

async function showWarpOnPhotoA() {
  state.photoId = "A";
  state.paramBag = {};
  field.setFrom(warpedField(0.1));
  await commit("Warp");
}

function openPhotoB(rev) {
  state.photoId = "B";
  state.paramBag = { [FIELD_REV_PARAM]: rev };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a photo whose warp is still being read shows no warp, not the previous photo's", async () => {
  await showWarpOnPhotoA();
  readPhotoData = () => new Promise(() => {});
  openPhotoB(100);
  uploads.length = 0;
  sync();
  assert.equal(uploads.at(-1), false, "the GPU field is the identity while B's warp is read");
});

test("a failed read leaves the photo unwarped and tells the person", async () => {
  await showWarpOnPhotoA();
  readPhotoData = () => Promise.reject(new Error("disk gone"));
  openPhotoB(200);
  uploads.length = 0;
  alerts.length = 0;
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    sync();
    await settle();
  } finally {
    console.error = consoleError;
  }
  assert.equal(uploads.at(-1), false);
  assert.equal(field.isEmpty(), true);
  assert.equal(alerts.length, 1);
  assert.equal(errors.length, 1);
});

test("a read that succeeds shows the photo's own warp", async () => {
  field.setFrom(warpedField(0.2));
  const bytes = field.serialize(300);
  await showWarpOnPhotoA();
  readPhotoData = () => Promise.resolve(bytes);
  openPhotoB(300);
  sync();
  await settle();
  assert.ok(Math.abs(field.getField()[0] - 0.2) < 1e-3);
  assert.equal(uploads.at(-1), true);
});
