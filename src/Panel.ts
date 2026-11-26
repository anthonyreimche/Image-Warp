// Develop panel. Collapsed (not warping) it shows just "Warp" (enter) and
// "Clear warp". While warping it expands to the tool picker + brush sliders +
// "Done" (Esc also finishes). Generic controls come from the shared core UI kit
// (api.ui); the tool grid keeps a custom 2-col layout (no grid primitive in the
// kit) but uses kit Buttons for the cells.

import { h, R, api } from "./runtime";
import { WARP_STRENGTH, warpStore, type WarpTool } from "./store";
import { toolIcon } from "./icons";
import { clearWarp } from "./persistence";

const TOOLS: { id: WarpTool; label: string }[] = [
	{ id: "push", label: "Push" },
	{ id: "reconstruct", label: "Restore" },
	{ id: "twirl-cw", label: "Twirl CW" },
	{ id: "twirl-ccw", label: "Twirl CCW" },
	{ id: "pucker", label: "Pucker" },
	{ id: "bloat", label: "Bloat" },
	{ id: "turbulence", label: "Turbulence" },
	{ id: "smooth", label: "Smooth" },
	{ id: "freeze", label: "Freeze" },
	{ id: "thaw", label: "Thaw" },
];

export function WarpPanel() {
	const react = R();
	const a = api();
	const store = warpStore();
	const Slider = a.components.Slider;

	const { Button, tokens } = a.ui;
	const brush = a.develop.brush.defaults;

	const warpActive: boolean = store((s) => s.warpActive);
	const tool: WarpTool = store((s) => s.tool);
	const size: number = store((s) => s.size);
	const density: number = store((s) => s.density);
	const pressure: number = store((s) => s.pressure);
	const rate: number = store((s) => s.rate);
	const feather: number = store((s) => s.feather);
	const held = a.develop.useCanvasToolHeld();

	// Another tool took the canvas (crop, masks, heal): the warp finishes.
	react.useEffect(() => {
		if (warpActive && !held) store.getState().setWarpActive(false);
	}, [warpActive, held]);

	// ── Collapsed: just enter-warp + clear ──────────────────────────────────────
	if (!warpActive) {
		return h(
			"div",
			{
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					padding: "8px",
				},
			},
			h(
				Button,
				{
					variant: "primary",
					full: true,
					onClick: () => store.getState().setWarpActive(true),
				},
				// The mask brush's glyph, so the warp brush reads consistently.
				h("span", { style: { fontSize: "14px", lineHeight: 1 } }, "✎"),
				"Warp",
			),
			h(
				Button,
				{ variant: "secondary", full: true, onClick: () => void clearWarp() },
				"Clear warp",
			),
		);
	}

	// ── Warping: tool grid + brush sliders + Done ───────────────────────────────
	const toolButton = (t: { id: WarpTool; label: string }) => {
		const selected = tool === t.id;
		return h(
			Button,
			{
				key: t.id,
				variant: "secondary",
				active: selected,
				full: true,
				title: t.label,
				onClick: () => store.getState().setTool(t.id),
			},
			h(
				"span",
				{
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: "3px",
						fontSize: "9.5px",
						lineHeight: 1,
					},
				},
				toolIcon(t.id, 17),
				h("span", null, t.label),
			),
		);
	};

	const slider = (
		label: string,
		value: number,
		min: number,
		dflt: number,
		onChange: (v: number) => void,
	) =>
		react.createElement(Slider, {
			label,
			value: Math.round(value * 100),
			min,
			max: label === "Size" ? 50 : 100,
			step: 1,
			defaultValue: Math.round(dflt * 100),
			// While dragging, show the centred reference ring (cleared on release).
			onChange: (v: number) => {
				onChange(v / 100);
				store.getState().setPreviewing(true);
			},
			onCommit: () => store.getState().setPreviewing(false),
		});

	return h(
		"div",
		{
			style: {
				display: "flex",
				flexDirection: "column",
				gap: "8px",
				padding: "8px",
			},
		},

		h(
			"div",
			{
				title: "Drag on the image to warp",
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(2, 1fr)",
					gap: "4px",
				},
			},
			...TOOLS.map(toolButton),
		),

		h("div", {
			style: {
				height: "1px",
				background: tokens.borderSubtle,
				margin: "2px 0",
			},
		}),

		slider("Size", size, 1, brush.size, (v) => store.getState().setSize(v)),
		slider("Feather", feather, 0, brush.feather, (v) => store.getState().setFeather(v)),
		slider("Density", density, 1, WARP_STRENGTH, (v) => store.getState().setDensity(v)),
		slider("Pressure", pressure, 0, 1, (v) => store.getState().setPressure(v)),
		slider("Rate", rate, 1, WARP_STRENGTH, (v) => store.getState().setRate(v)),

		h(
			"div",
			{ style: { marginTop: "4px" } },
			h(
				Button,
				{
					variant: "secondary",
					full: true,
					onClick: () => store.getState().setWarpActive(false),
				},
				"Done",
			),
		),
	);
}
