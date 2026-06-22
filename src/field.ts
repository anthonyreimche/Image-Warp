// The displacement field: a FIELD_SIZE² grid of (du, dv, freeze) accumulated on
// the CPU and pushed to the GPU as an rgba16f stage texture. du/dv are in
// source-UV units (a 0.1 offset = 10% of the image across that axis); the GLSL
// stage samples uImage at srcUv + (du,dv). `freeze` (0..1) protects a region
// from further brush edits (honoured here, ignored by the shader).
//
// A single field instance represents the CURRENTLY loaded photo's warp;
// persistence.ts swaps it on photo switch / undo / load.

import { api } from "./runtime";
import { STAGE_ID, FIELD_KEY, FIELD_SIZE } from "./warp-stage";
import type { WarpTool } from "./store";

const N = FIELD_SIZE;
const COUNT = N * N;

// [du, dv, freeze, 0] per texel.
const field = new Float32Array(COUNT * 4);
let texVersion = 1;
let empty = true;

export function getField(): Float32Array {
  return field;
}

export function isEmpty(): boolean {
  return empty;
}

export function clear(): void {
  field.fill(0);
  empty = true;
}

/** Replace the whole field from a decoded buffer (length COUNT*4). */
export function setFrom(buf: Float32Array): void {
  if (buf.length === field.length) {
    field.set(buf);
  } else {
    field.fill(0);
    field.set(buf.subarray(0, Math.min(buf.length, field.length)));
  }
  empty = false;
}

/** Upload the current field to the GPU (debounce/coalesce at the call site). */
export function push(): void {
  api().setStageTexture(STAGE_ID, FIELD_KEY, {
    data: field,
    width: N,
    height: N,
    format: "rgba16f",
    version: ++texVersion,
  });
}

// ── Brush stamping ───────────────────────────────────────────────────────────

export interface StampOpts {
  tool: WarpTool;
  /** Brush centre in source-UV. */
  cu: number;
  cv: number;
  /** Radius as a fraction of image height. */
  rv: number;
  /** Image aspect (width / height) — circularises the brush in UV space. */
  aspect: number;
  hardness: number;
  density: number;
  pressure: number;
  /** Continuous-tool flow for this dab (rate × dt). Ignored by motion tools. */
  flow: number;
  /** Pointer motion since the previous dab, in source-UV (push / push-left). */
  dirU: number;
  dirV: number;
}

// Per-second response constants for the continuous tools (flow = rate × dt).
const TWIRL_K = 5.0;
const PUCKER_K = 10.0;
const RELAX_K = 8.0; // reconstruct / smooth convergence speed
const TURB_K = 0.6; // turbulence jitter magnitude (UV per second at full rate)

// Turbulence uses a smooth coherent noise field reseeded per stroke, so its
// dabs build up an organic swirl instead of high-frequency speckle.
let turbSeed = 1;
export function reseedTurbulence(): void {
  turbSeed = (turbSeed * 1664525 + 1013904223) >>> 0;
}
function hash2(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// Value noise in [0,1] over ~8 cells across the image.
function noise(u: number, v: number, s: number): number {
  const N = 8;
  const fx = u * N;
  const fy = v * N;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export function stamp(o: StampOpts): void {
  const { tool, cu, cv, rv, aspect, hardness, density, pressure } = o;
  if (rv <= 0) return;

  // Brush bounding box on the grid (u half-extent shrinks by aspect so the
  // footprint is a circle in image-pixel space, not an ellipse).
  const rU = rv / aspect;
  const rV = rv;
  const gx0 = Math.max(0, Math.floor((cu - rU) * N));
  const gx1 = Math.min(N - 1, Math.ceil((cu + rU) * N));
  const gy0 = Math.max(0, Math.floor((cv - rV) * N));
  const gy1 = Math.min(N - 1, Math.ceil((cv + rV) * N));
  if (gx1 < gx0 || gy1 < gy0) return;

  const twirlSign = tool === "twirl-cw" ? 1 : -1;
  let touched = false;

  for (let gy = gy0; gy <= gy1; gy++) {
    const gv = (gy + 0.5) / N;
    const ry = gv - cv;
    for (let gx = gx0; gx <= gx1; gx++) {
      const gu = (gx + 0.5) / N;
      const rx = (gu - cu) * aspect; // height-normalised
      const dist = Math.sqrt(rx * rx + ry * ry) / rv;
      if (dist > 1) continue;

      const fall = 1 - smoothstep(hardness, 1, dist);
      if (fall <= 0) continue;

      const idx = (gy * N + gx) * 4;
      const freeze = field[idx + 2];

      if (tool === "freeze") {
        field[idx + 2] = clamp01(freeze + fall * density * Math.max(o.flow, 0.04));
        touched = true;
        continue;
      }
      if (tool === "thaw") {
        field[idx + 2] = clamp01(freeze - fall * density * Math.max(o.flow, 0.04));
        touched = true;
        continue;
      }

      const w = fall * density * pressure * (1 - freeze);
      if (w <= 0) continue;

      switch (tool) {
        case "push":
          // Content follows the cursor: sample offset is the negated motion.
          field[idx] += -o.dirU * w;
          field[idx + 1] += -o.dirV * w;
          break;
        case "turbulence": {
          // Jitter along a smooth coherent noise field for organic ripples.
          const k = w * o.flow * TURB_K;
          field[idx] += (noise(gu, gv, turbSeed) - 0.5) * k;
          field[idx + 1] += (noise(gu, gv, turbSeed ^ 0x9e3779b9) - 0.5) * k;
          break;
        }
        case "twirl-cw":
        case "twirl-ccw": {
          const ang = twirlSign * w * o.flow * TWIRL_K;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          // Rotate the radial vector (aspect space) and add the delta as UV.
          const nrx = rx * c - ry * s;
          const nry = rx * s + ry * c;
          field[idx] += (nrx - rx) / aspect;
          field[idx + 1] += nry - ry;
          break;
        }
        case "pucker": {
          const k = w * o.flow * PUCKER_K;
          field[idx] += (gu - cu) * k;
          field[idx + 1] += (gv - cv) * k;
          break;
        }
        case "bloat": {
          const k = w * o.flow * PUCKER_K;
          field[idx] += (cu - gu) * k;
          field[idx + 1] += (cv - gv) * k;
          break;
        }
        case "reconstruct": {
          const k = clamp01(w * o.flow * RELAX_K);
          field[idx] += (0 - field[idx]) * k;
          field[idx + 1] += (0 - field[idx + 1]) * k;
          break;
        }
        case "smooth": {
          const k = clamp01(w * o.flow * RELAX_K);
          const au = avg(gx, gy, 0);
          const av = avg(gx, gy, 1);
          field[idx] += (au - field[idx]) * k;
          field[idx + 1] += (av - field[idx + 1]) * k;
          break;
        }
      }
      touched = true;
    }
  }
  if (touched) empty = false;
}

function avg(gx: number, gy: number, ch: number): number {
  let sum = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const y = gy + dy;
    if (y < 0 || y >= N) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx;
      if (x < 0 || x >= N) continue;
      sum += field[(y * N + x) * 4 + ch];
      n++;
    }
  }
  return n ? sum / n : 0;
}

function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Serialisation (compact half-float sidecar) ───────────────────────────────
// Layout: 12-byte header + size·size·3 half-floats (du, dv, freeze).
//   [0..3] magic "IWRP"  [4] version=1  [5] channels=3
//   [6..7] size u16 LE   [8..11] rev u32 LE

const MAGIC = 0x49575250; // "IWRP"
const HEADER = 12;

export function serialize(rev: number): Uint8Array {
  const out = new Uint8Array(HEADER + COUNT * 3 * 2);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, false);
  out[4] = 1;
  out[5] = 3;
  dv.setUint16(6, N, true);
  dv.setUint32(8, rev >>> 0, true);
  let o = HEADER;
  for (let i = 0; i < COUNT; i++) {
    const s = i * 4;
    dv.setUint16(o, f32ToF16(field[s]), true); o += 2;
    dv.setUint16(o, f32ToF16(field[s + 1]), true); o += 2;
    dv.setUint16(o, f32ToF16(field[s + 2]), true); o += 2;
  }
  return out;
}

export interface ParsedField {
  rev: number;
  buf: Float32Array;
}

/** Decode a serialized field, or null if the bytes aren't a field of this size. */
export function parse(bytes: Uint8Array): ParsedField | null {
  if (bytes.length < HEADER) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== MAGIC) return null;
  if (bytes[4] !== 1 || bytes[5] !== 3) return null;
  const size = dv.getUint16(6, true);
  if (size !== N) return null;
  const rev = dv.getUint32(8, true);
  if (bytes.length < HEADER + COUNT * 3 * 2) return null;
  const buf = new Float32Array(COUNT * 4);
  let o = HEADER;
  for (let i = 0; i < COUNT; i++) {
    const s = i * 4;
    buf[s] = f16ToF32(dv.getUint16(o, true)); o += 2;
    buf[s + 1] = f16ToF32(dv.getUint16(o, true)); o += 2;
    buf[s + 2] = f16ToF32(dv.getUint16(o, true)); o += 2;
  }
  return { rev, buf };
}

// IEEE-754 half-float conversions.
const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

function f32ToF16(val: number): number {
  f32[0] = val;
  const x = i32[0];
  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant |= 0x800000;
    const shift = 14 - exp;
    const half = (mant + (1 << (shift - 1))) >> shift;
    return sign | half;
  }
  if (exp >= 0x1f) return sign | 0x7c00; // inf/overflow
  const half = (mant + 0x1000) >> 13;
  if (half & 0x400) return sign | ((exp + 1) << 10); // mantissa carry
  return sign | (exp << 10) | half;
}

function f16ToF32(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) {
    if (mant === 0) { i32[0] = sign; return f32[0]; }
    // subnormal
    let e = -1;
    let m = mant;
    do { e++; m <<= 1; } while ((m & 0x400) === 0);
    m &= 0x3ff;
    i32[0] = sign | ((127 - 15 - e) << 23) | (m << 13);
    return f32[0];
  }
  if (exp === 0x1f) { i32[0] = sign | 0x7f800000 | (mant << 13); return f32[0]; }
  i32[0] = sign | ((exp - 15 + 127) << 23) | (mant << 13);
  return f32[0];
}
