// Extension-local UI state for the warp tool. Kept out of core: core only
// renders our slot/panel components, which read this store. Tool + brush
// settings are session state (not part of the photo's edit); the warp itself
// lives in the per-photo displacement field (field.ts / persistence.ts).

import { api } from "./runtime";
import type { StoreApi } from "./safelight";

export type WarpTool =
  | "push"
  | "twirl-cw"
  | "twirl-ccw"
  | "pucker"
  | "bloat"
  | "turbulence"
  | "reconstruct"
  | "smooth"
  | "freeze"
  | "thaw";

export interface WarpState {
  /** Whether the warp tool is armed (capturing the canvas). */
  warpActive: boolean;
  tool: WarpTool;
  /** Brush radius as a fraction of image height (0..1). */
  size: number;
  /** 0..1 — scales every dab's strength (a manual stand-in for pen pressure). */
  pressure: number;
  /** 0..1 — flow speed for the continuous tools (twirl/pucker/bloat/…). */
  rate: number;
  /** 0..1 — peak strength at the brush centre. */
  density: number;
  /** 0..1 — how much of the radius fades; 0 = hard edge. */
  feather: number;
  /** True while a brush slider is being dragged — shows a centred reference ring. */
  previewing: boolean;

  setWarpActive(v: boolean): void;
  toggleWarp(): void;
  setTool(t: WarpTool): void;
  setSize(v: number): void;
  setPressure(v: number): void;
  setRate(v: number): void;
  setDensity(v: number): void;
  setFeather(v: number): void;
  setPreviewing(v: boolean): void;
}

let _store: StoreApi<WarpState> | null = null;

/** Where Density and Rate start: how hard and how fast a stroke warps. */
export const WARP_STRENGTH = 0.5;

export function initStore(): StoreApi<WarpState> {
  _store = api().stores.create<WarpState>((set) => ({
    warpActive: false,
    tool: "push",
    size: api().develop.brush.defaults.size,
    pressure: 1,
    rate: WARP_STRENGTH,
    density: WARP_STRENGTH,
    feather: api().develop.brush.defaults.feather,
    previewing: false,
    setWarpActive: (warpActive) => set(warpActive ? { warpActive } : { warpActive, previewing: false }),
    toggleWarp: () => set((s) => (s.warpActive ? { warpActive: false, previewing: false } : { warpActive: true })),
    setTool: (tool) => set({ tool }),
    setSize: (size) => set({ size: clamp(size, 0.01, 0.5) }),
    setPressure: (pressure) => set({ pressure: clamp(pressure, 0, 1) }),
    setRate: (rate) => set({ rate: clamp(rate, 0.01, 1) }),
    setDensity: (density) => set({ density: clamp(density, 0.01, 1) }),
    setFeather: (feather) => set({ feather: clamp(feather, 0, 1) }),
    setPreviewing: (previewing) => set({ previewing }),
  }));
  return _store;
}

export function warpStore(): StoreApi<WarpState> {
  if (!_store) throw new Error("[image-warp] store used before activate()");
  return _store;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
