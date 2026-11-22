// Each photo is drawn with its own warp (SafeLight #278). The field the brush
// edits is the open photo's and is supplied under that photo's variant; a
// thumbnail or an export of any other photo draws the field kept for that
// photo, made on demand, or none, never the open photo's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initRuntime } from "../src/runtime.ts";
import { FIELD_REV_PARAM, buildStage } from "../src/warp-stage.ts";
import * as field from "../src/field.ts";
import { commit, fieldFor, sync } from "../src/persistence.ts";

const state = {
  photoId: null,
  paramBag: {},
  setDynParams(patch) {
    state.paramBag = { ...state.paramBag, ...patch };
  },
  async commitEdit() {},
};
const sets = [];
const drops = [];
const disk = new Map();

initRuntime({
  react: {},
  stores: { useDevelopStore: { getState: () => state } },
  setStageTexture(_stage, _key, tex, variant) {
    sets.push({ variant, warped: tex ? Array.from(tex.data).some((v) => v !== 0) : null });
  },
  dropStageTextureVariants(_stage, _key, variant) {
    drops.push(variant);
  },
  develop: {
    putPhotoData() {},
    getPhotoData: (_key, photoId) => Promise.resolve(disk.get(photoId ?? state.photoId) ?? null),
  },
  ui: { alertDialog: () => Promise.resolve() },
});

function warpedField(du) {
  const buf = new Float32Array(field.getField().length);
  buf[0] = du;
  return buf;
}

async function warpPhotoA() {
  state.photoId = "A";
  state.paramBag = {};
  sync();
  field.setFrom(warpedField(0.1));
  field.push();
  await commit("Warp");
}

function open(photoId, rev = 0) {
  state.photoId = photoId;
  state.paramBag = rev ? { [FIELD_REV_PARAM]: rev } : {};
  sync();
}

test("the open photo's field is supplied under its own variant", async () => {
  sets.length = 0;
  await warpPhotoA();
  assert.deepEqual(sets.at(-1), { variant: "A", warped: true });
  assert.ok(sets.every((s) => s.variant !== undefined), "nothing is set under the texture every photo shares");
});

test("opening another photo lets the last one's field go, to be made again when a frame needs it", async () => {
  await warpPhotoA();
  sets.length = 0;
  drops.length = 0;
  open("B");
  assert.deepEqual(sets[0], { variant: "A", warped: null });
  assert.deepEqual(drops, ["A"]);
  assert.deepEqual(sets.at(-1), { variant: "B", warped: false });
});

test("a photo that isn't open draws its own warp, or none", async () => {
  await warpPhotoA();
  field.setFrom(warpedField(0.3));
  disk.set("C", field.serialize(7));
  open("B");
  assert.ok(Math.abs((await fieldFor("A"))[0] - 0.1) < 1e-6, "A keeps the warp it was left with");
  assert.ok(Math.abs((await fieldFor("C"))[0] - 0.3) < 1e-3, "C's warp comes from what was saved with it");
  assert.equal(await fieldFor("B"), null, "B has no warp");
  assert.equal(await fieldFor("D"), null);
});

test("declares its field a per-photo texture, which needs Safelight 3.2.7", () => {
  assert.equal(buildStage().textures?.[0].perPhoto, true);
  const manifest = JSON.parse(readFileSync(new URL("../safelight.json", import.meta.url), "utf8"));
  assert.equal(manifest.minAppVersion, "3.2.7");
});
