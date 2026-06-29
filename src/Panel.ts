// Develop panel. Collapsed (not warping) it shows just "Warp" (enter) and
// "Clear warp". While warping it expands to the tool picker + brush sliders +
// "Done" (Esc also finishes). Generic controls come from the shared core UI kit
// (api.ui); the tool grid keeps a custom 2-col layout (no grid primitive in the
// kit) but uses kit Buttons for the cells.

import { h, R, api } from "./runtime";
import { warpStore, type WarpTool } from "./store";
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

	if (!a.ui)
		return h(
			"div",
			{
				style: {
					padding: "10px",
					fontSize: "11px",
					color: "var(--color-text-muted)",
				},
			},
			"Update Safelight to use this panel.",
		);

	const { Button } = a.ui;

	const warpActive: boolean = store((s) => s.warpActive);
	const tool: WarpTool = store((s) => s.tool);
	const size: number = store((s) => s.size);
	const density: number = store((s) => s.density);
	const pressure: number = store((s) => s.pressure);
	const rate: number = store((s) => s.rate);
	const hardness: number = store((s) => s.hardness);

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
		max: number,
		dflt: number,
		onChange: (v: number) => void,
	) =>
		react.createElement(Slider, {
			label,
			value,
			min,
			max,
			step: 0.01,
			defaultValue: dflt,
			// While dragging, show the centred reference ring (cleared on release).
			onChange: (v: number) => {
				onChange(v);
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
				style: {
					fontSize: "10.5px",
					color: "var(--color-accent)",
					lineHeight: 1.4,
				},
			},
			"Drag on the image to warp.",
		),

		h(
			"div",
			{
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
				background: "var(--color-border-subtle)",
				margin: "2px 0",
			},
		}),

		slider("Size", size, 0.02, 0.6, 0.14, (v) => store.getState().setSize(v)),
		slider("Density", density, 0, 1, 0.5, (v) =>
			store.getState().setDensity(v),
		),
		slider("Pressure", pressure, 0, 1, 1, (v) =>
			store.getState().setPressure(v),
		),
		slider("Rate", rate, 0, 1, 0.5, (v) => store.getState().setRate(v)),
		slider("Hardness", hardness, 0, 1, 0.5, (v) =>
			store.getState().setHardness(v),
		),

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
