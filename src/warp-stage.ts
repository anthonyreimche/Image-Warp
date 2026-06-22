// The GPU warp stage. A "geometry"-phase stage that displaces the mutable
// source-UV (`srcUv`) by the vector stored in the displacement field texture
// (`warpField`), BEFORE the image is sampled. Because everything downstream —
// source sampling, white balance, exposure, noise reduction, masks, tone
// mapping — then operates on the warped coordinate, the warp composes correctly
// with every other edit (it isn't a raw-pixel resample that would discard them)
// and flows through thumbnails and export like a built-in geometry edit.
//
// Field texture (rgba16f, FIELD_SIZE²): R,G = du,dv in source-UV units; B =
// freeze mask (honoured CPU-side by the brush, ignored by the shader). Sampling
// is hardware-bilinear (half-float is linear-filterable), so the coarse field
// upsamples smoothly to any image resolution.
//
// Key naming: the compiler namespaces contributed identifiers by NAÏVE substring
// replaceAll, so both keys are distinctive (`warpField`/`warpEnabled`) and are
// not substrings of any engine identifier the body references (srcUv, texture,
// clamp).

import type { ProcessingStageContribution } from "./safelight";

export const STAGE_ID = "com.safelight.image-warp.warp";
export const FIELD_KEY = "warpField";
export const FIELD_SIZE = 256;

const WARP_GLSL = `
if (warpEnabled > 0.5) {
  srcUv = clamp(srcUv + texture(warpField, srcUv).rg, 0.0, 1.0);
}
`;

export function buildStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Image Warp",
    phase: "geometry",
    priority: 50,
    uniforms: [{ key: "warpEnabled", glslType: "float", default: 0 }],
    textures: [
      { key: FIELD_KEY, kind: "dynamic", width: FIELD_SIZE, height: FIELD_SIZE, format: "rgba16f" },
    ],
    glsl: WARP_GLSL,
  };
}

/** Qualified paramBag key for the enable uniform (what setDynParam expects). */
export const ENABLED_PARAM = `${STAGE_ID}.warpEnabled`;
/** Descriptor-less paramBag key carrying the persisted field revision token.
 *  Not a declared uniform, so it never binds to GLSL, but it round-trips through
 *  the sidecar JSON and participates in undo/redo for free. */
export const FIELD_REV_PARAM = `${STAGE_ID}.fieldRev`;
