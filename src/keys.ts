// Core's rebindable brush shortcuts (Preferences ▸ Shortcuts), as the held
// canvas tool receives them, stepped by core's own brush so the warp brush
// feels like the mask brush. The warp's Density is the brush's opacity and its
// Rate the brush's flow.

import { api } from "./runtime";
import { warpStore } from "./store";

/** Steps the warp brush by `action` (one of Develop's brush shortcuts) when
 *  `run`; whether it is one. The store's setters hold each setting to range. */
export function brushAction(action: string, run: boolean): boolean {
  const st = warpStore().getState();
  const step = api().develop.brush.step(action, {
    size: st.size,
    feather: st.feather,
    opacity: st.density,
    flow: st.rate,
  });
  if (!step) return false;
  if (!run) return true;
  if (step.key === "size") st.setSize(step.value);
  else if (step.key === "feather") st.setFeather(step.value);
  else if (step.key === "opacity") st.setDensity(step.value);
  else st.setRate(step.value);
  return true;
}
