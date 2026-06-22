// Small inline SVGs built with the app's React (no JSX, no asset imports).

import { h } from "./runtime";
import type { WarpTool } from "./store";

function svg(size: number, ...children: unknown[]): unknown {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    ...children,
  );
}

const PATHS: Record<WarpTool, string[]> = {
  push: ["M5 12 h11", "M12 8 l5 4 l-5 4"],
  "twirl-cw": ["M12 4 a8 8 0 1 1 -7 4", "M5 8 l0 -4 l4 0"],
  "twirl-ccw": ["M12 4 a8 8 0 1 0 7 4", "M19 8 l0 -4 l-4 0"],
  pucker: ["M5 5 l5 5", "M19 5 l-5 5", "M5 19 l5 -5", "M19 19 l-5 -5"],
  bloat: ["M10 10 l-5 -5", "M14 10 l5 -5", "M10 14 l-5 5", "M14 14 l5 5"],
  turbulence: ["M3 9 C 6 5, 9 13, 12 9 S 18 5, 21 9", "M3 15 C 6 11, 9 19, 12 15 S 18 11, 21 15"],
  reconstruct: ["M5 12 a7 7 0 1 1 2 5", "M5 17 l0 -4 l4 0"],
  smooth: ["M4 14 C 8 8, 12 8, 16 14 S 20 16, 20 13"],
  freeze: ["M12 4 v16", "M5 8 l14 8", "M19 8 l-14 8"],
  thaw: ["M12 6 v8", "M9 11 l3 3 l3 -3", "M6 19 h12"],
};

export function toolIcon(tool: WarpTool, size = 16): unknown {
  return svg(size, ...PATHS[tool].map((d) => h("path", { key: d, d })));
}
