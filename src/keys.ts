// Keyboard handling while the warp tool is armed. We reuse SafeLight's existing
// rebindable brush shortcuts (Preferences ▸ Shortcuts) so the warp brush feels
// like the mask brush: [ / ] size, Shift+[ / ] feather (hardness), , / . density,
// Shift+, / . flow (rate). Esc finishes the warp (mirrors the panel "Done").
//
// Core's global handler lets these combos through when no core brush tool is
// active (activeTool === "none"), so we listen in the capture phase and act when
// the warp tool is armed. We never re-register the actions — we just read their
// (possibly rebound) combo via api.keybindings.getBinding and match the event.

import { api } from "./runtime";
import { warpStore } from "./store";

// Default combos + their built-in shifted-bracket aliases (which is what most
// keyboards actually emit for Shift+[ etc.). Aliases are honoured only while the
// action still sits on its default binding.
const BRUSH: Record<string, { def: string; alts: string[]; apply: (dir: number) => void }> = {
  "brush.smaller": { def: "[", alts: [], apply: () => step("size", -0.02) },
  "brush.larger": { def: "]", alts: [], apply: () => step("size", +0.02) },
  // "Less feather" = harder edge = higher hardness, and vice-versa.
  "brush.featherDown": { def: "Shift+[", alts: ["Shift+{"], apply: () => step("hardness", +0.05) },
  "brush.featherUp": { def: "Shift+]", alts: ["Shift+}"], apply: () => step("hardness", -0.05) },
  "brush.opacityDown": { def: ",", alts: [], apply: () => step("density", -0.1) },
  "brush.opacityUp": { def: ".", alts: [], apply: () => step("density", +0.1) },
  "brush.flowDown": { def: "Shift+,", alts: ["Shift+<"], apply: () => step("rate", -0.1) },
  "brush.flowUp": { def: "Shift+.", alts: ["Shift+>"], apply: () => step("rate", +0.1) },
};

function step(field: "size" | "hardness" | "density" | "rate", delta: number): void {
  const s = warpStore().getState();
  if (field === "size") s.setSize(s.size + delta);
  else if (field === "hardness") s.setHardness(s.hardness + delta);
  else if (field === "density") s.setDensity(s.density + delta);
  else s.setRate(s.rate + delta);
}

function comboFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join("+");
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement)
    return !["range", "checkbox", "radio", "button", "color", "file", "submit", "reset"].includes(t.type);
  return t.isContentEditable;
}

function inDevelop(): boolean {
  const detached = new URLSearchParams(window.location.search).get("detached");
  return (
    api().stores.useUIStore.getState().activeModule === "develop" ||
    detached === "develop"
  );
}

export function initWarpKeys(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (!warpStore().getState().warpActive || !inDevelop()) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      warpStore().getState().setWarpActive(false);
      return;
    }

    if (isEditableTarget(e.target)) return;
    const combo = comboFromEvent(e);
    if (!combo) return;

    for (const [id, b] of Object.entries(BRUSH)) {
      const bound = api().keybindings.getBinding(id);
      const matches =
        combo === bound || (bound === b.def && b.alts.includes(combo));
      if (matches) {
        e.preventDefault();
        b.apply(1);
        return;
      }
    }
  };

  // Capture phase, like core's handler, so we see the key regardless of focus.
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
