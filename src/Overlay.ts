// The interactive layer: the canvas tool held while the warp is armed
// (WARP_TOOL), so crop, masks and heal never take the canvas at the same time.
// It covers the whole canvas, captures pointer events, maps them to source-UV via api.develop's overlay helpers
// (api.develop.framePoint), and stamps the active tool into the displacement field on a rAF loop
// so a held or dragged brush flows smoothly. The official brush ring tracks
// the cursor, over the crosshair. Ctrl, Cmd or Space held hands the pointer to
// the canvas's pan and zoom: core does that for a zoomable tool.
//
// Inline styles + CSS variables (no Tailwind in runtime extensions).

import { h, R, api } from "./runtime";
import type { CanvasTool } from "./safelight";
import { brushAction } from "./keys";
import { warpStore } from "./store";
import { ENABLED_PARAM, FIELD_REV_PARAM, FIELD_SIZE } from "./warp-stage";
import * as field from "./field";
import { commit } from "./persistence";

export function WarpOverlay() {
  const react = R();
  const store = warpStore();
  const warpActive: boolean = store((s) => s.warpActive);
  const size: number = store((s) => s.size);
  const feather: number = store((s) => s.feather);
  const previewing: boolean = store((s) => s.previewing);

  const dev = api().stores.useDevelopStore;
  const photoId: string | null = dev((s) => s.photoId);
  // Re-render (and repaint the freeze overlay) when the warp revision changes
  // via undo/redo/photo-load.
  const fieldRev = dev((s: { paramBag: Record<string, unknown> }) => s.paramBag[FIELD_REV_PARAM]);

  const ov = api().develop.useDevelopOverlay();
  const { rect, imageRect, nonce, toImage } = ov;

  const rootRef = react.useRef(null);
  const [pointer, setPointer] = react.useState(null);
  const freezeRef = react.useRef(null);
  const pressed = react.useRef(false);
  const raf = react.useRef(0);
  const cur = react.useRef({ lx: 0, ly: 0, u: 0, v: 0, inside: false });
  const lastDab = react.useRef({ u: 0, v: 0 });
  const lastTime = react.useRef(0);

  const visible = warpActive && !!rect && !!photoId && !!toImage;

  react.useEffect(() => {
    if (!visible) return;
    return api().develop.setCanvasCursor("crosshair", { priority: 20 });
  }, [visible]);

  // Tear down any in-flight stroke if we become hidden mid-drag.
  react.useEffect(() => {
    if (visible) return;
    pressed.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, [visible]);

  const aspect = imageRect && imageRect.h > 0 ? imageRect.w / imageRect.h : 1;

  // Red wash over frozen texels so you can see what's protected while warping.
  const paintFreeze = () => {
    const el = freezeRef.current as HTMLCanvasElement | null;
    if (!el) return;
    if (el.width !== FIELD_SIZE) {
      el.width = FIELD_SIZE;
      el.height = FIELD_SIZE;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(FIELD_SIZE, FIELD_SIZE);
    const f = field.getField();
    for (let i = 0; i < FIELD_SIZE * FIELD_SIZE; i++) {
      const fr = f[i * 4 + 2];
      const a = fr < 0 ? 0 : fr > 1 ? 1 : fr;
      const o = i * 4;
      img.data[o] = 235;
      img.data[o + 1] = 35;
      img.data[o + 2] = 35;
      img.data[o + 3] = Math.round(a * 125);
    }
    ctx.putImageData(img, 0, 0);
  };

  // Repaint on (re)show, view change, and undo/redo/photo-load. rAF so the
  // canvas exists and is laid out first.
  react.useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(paintFreeze);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, nonce, fieldRev]);

  const localFromEvent = (e: PointerEvent): { lx: number; ly: number } => {
    const p = api().develop.framePoint(rootRef.current as HTMLElement, e.clientX, e.clientY);
    return { lx: p.x, ly: p.y };
  };

  const sampleAt = (lx: number, ly: number) => {
    const p = toImage ? toImage(lx, ly) : { x: -1, y: -1 };
    const inside = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    cur.current = { lx, ly, u: p.x, v: p.y, inside };
  };

  const frame = (now: number) => {
    if (!pressed.current) return;
    const s = store.getState();
    const dt = Math.min(0.05, Math.max(0, (now - lastTime.current) / 1000));
    lastTime.current = now;

    const c = cur.current;
    const last = lastDab.current;
    const rv = s.size;
    const spacing = Math.max(rv / 4, 0.002);
    const ddu = c.u - last.u;
    const ddv = c.v - last.v;
    const distH = Math.hypot(ddu * aspect, ddv);
    const nDabs = Math.max(1, Math.ceil(distH / spacing));
    const isMotion = s.tool === "push";
    const flowPer = isMotion ? 0 : (s.rate * dt) / nDabs;
    const dirU = ddu / nDabs;
    const dirV = ddv / nDabs;

    if (c.inside || last.u >= 0) {
      for (let i = 1; i <= nDabs; i++) {
        const t = i / nDabs;
        field.stamp({
          tool: s.tool,
          cu: last.u + ddu * t,
          cv: last.v + ddv * t,
          rv,
          aspect,
          hardness: 1 - s.feather,
          density: s.density,
          pressure: s.pressure,
          flow: flowPer,
          dirU,
          dirV,
        });
      }
      lastDab.current = { u: c.u, v: c.v };
      field.push();
      if (s.tool === "freeze" || s.tool === "thaw") paintFreeze();
    }
    raf.current = requestAnimationFrame(frame);
  };

  const onDown = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!visible) return;
    const { lx, ly } = localFromEvent(e);
    sampleAt(lx, ly);
    if (!cur.current.inside) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    // Arm the GPU stage so the in-progress field renders live (committed later).
    if (dev.getState().paramBag[ENABLED_PARAM] !== 1)
      dev.getState().setDynParam(ENABLED_PARAM, 1);
    if (store.getState().tool === "turbulence") field.reseedTurbulence();
    pressed.current = true;
    lastDab.current = { u: cur.current.u, v: cur.current.v };
    lastTime.current = performance.now();
    setPointer({ x: lx, y: ly });
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(frame);
  };

  const onMove = (e: PointerEvent) => {
    if (!visible) return;
    const { lx, ly } = localFromEvent(e);
    sampleAt(lx, ly);
    setPointer({ x: lx, y: ly });
  };

  const onUp = (e: PointerEvent & { currentTarget: HTMLElement }) => {
    if (!pressed.current) return;
    pressed.current = false;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    if (!field.isEmpty()) void commit("Warp");
  };

  const onLeave = () => {
    if (!pressed.current) setPointer(null);
  };

  if (!visible) return null;

  return h(
    "div",
    {
      ref: rootRef,
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerLeave: onLeave,
      style: {
        position: "absolute",
        inset: 0,
        touchAction: "none",
        overflow: "hidden",
      },
    },
    imageRect
      ? h("canvas", {
          ref: freezeRef,
          style: {
            position: "absolute",
            left: `${imageRect.x}px`,
            top: `${imageRect.y}px`,
            width: `${imageRect.w}px`,
            height: `${imageRect.h}px`,
            pointerEvents: "none",
          },
        })
      : null,
    h(api().develop.BrushCursor, { at: previewing ? "centre" : pointer, size, feather }),
  );
}

/** The tool held while the warp is armed. Develop's brush shortcuts set the
 *  brush; Escape finishes the warp, as the panel's Done does. */
export const WARP_TOOL: CanvasTool = {
  overlay: WarpOverlay,
  zoomable: true,
  onEscape: () => warpStore().getState().setWarpActive(false),
  onAction: (action) => brushAction(action, true),
  wants: (action) => brushAction(action, false),
};
