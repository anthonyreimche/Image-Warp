// Core's rebindable brush shortcuts (Preferences ▸ Shortcuts), as the held
// canvas tool receives them, so the warp brush feels like the mask brush:
// [ / ] size, Shift+[ / ] feather (hardness), , / . density, Shift+, / . flow
// (rate).

import { warpStore } from "./store";

type Setting = "size" | "hardness" | "density" | "rate";

const STEPS: Readonly<Record<string, { setting: Setting; delta: number }>> = {
  "brush.smaller": { setting: "size", delta: -0.02 },
  "brush.larger": { setting: "size", delta: 0.02 },
  // Less feather is a harder edge: higher hardness, and the other way round.
  "brush.featherDown": { setting: "hardness", delta: 0.05 },
  "brush.featherUp": { setting: "hardness", delta: -0.05 },
  "brush.opacityDown": { setting: "density", delta: -0.1 },
  "brush.opacityUp": { setting: "density", delta: 0.1 },
  "brush.flowDown": { setting: "rate", delta: -0.1 },
  "brush.flowUp": { setting: "rate", delta: 0.1 },
};

/** Steps the warp brush by `action` (one of Develop's brush shortcuts) when
 *  `run`; whether it is one. The store's setters clamp. */
export function brushAction(action: string, run: boolean): boolean {
  const s = STEPS[action];
  if (!s) return false;
  if (!run) return true;
  const st = warpStore().getState();
  if (s.setting === "size") st.setSize(st.size + s.delta);
  else if (s.setting === "hardness") st.setHardness(st.hardness + s.delta);
  else if (s.setting === "density") st.setDensity(st.density + s.delta);
  else st.setRate(st.rate + s.delta);
  return true;
}
