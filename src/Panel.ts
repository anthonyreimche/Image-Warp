// Develop panel. Collapsed (not warping) it shows just "Warp" (enter) and
// "Clear warp". While warping it expands to the tool picker + brush sliders +
// "Done" (Esc also finishes). Inline styles + CSS variables only (runtime
// extensions aren't scanned by Tailwind).

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

const BTN = (extra: Record<string, unknown>): Record<string, unknown> => ({
	height: "28px",
	borderRadius: "5px",
	border: "1px solid var(--color-border-subtle)",
	background: "var(--color-surface-2, transparent)",
	color: "var(--color-text-secondary)",
	cursor: "pointer",
	fontSize: "11px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "6px",
	...extra,
});

export function WarpPanel() {
	const react = R();
	const store = warpStore();
	const Slider = api().components.Slider;

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
				"button",
				{
					onClick: () => store.getState().setWarpActive(true),
					style: BTN({
						background: "var(--color-accent)",
						borderColor: "var(--color-accent)",
						color: "var(--color-on-accent, #fff)",
					}),
				},
				// The mask brush's glyph, so the warp brush reads consistently.
				h("span", { style: { fontSize: "14px", lineHeight: 1 } }, "✎"),
				"Warp",
			),
			h(
				"button",
				{ onClick: () => void clearWarp(), style: BTN({}) },
				"Clear warp",
			),
		);
	}

	// ── Warping: tool grid + brush sliders + Done ───────────────────────────────
	const toolButton = (t: { id: WarpTool; label: string }) => {
		const selected = tool === t.id;
		return h(
			"button",
			{
				key: t.id,
				onClick: () => store.getState().setTool(t.id),
				title: t.label,
				style: {
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "3px",
					padding: "6px 2px",
					borderRadius: "5px",
					border: "1px solid",
					borderColor: selected
						? "var(--color-accent)"
						: "var(--color-border-subtle)",
					background: selected
						? "var(--color-accent)"
						: "var(--color-surface-2, transparent)",
					color: selected
						? "var(--color-on-accent, #fff)"
						: "var(--color-text-secondary)",
					cursor: "pointer",
					fontSize: "9.5px",
					lineHeight: 1,
				},
			},
			toolIcon(t.id, 17),
			h("span", null, t.label),
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
			"button",
			{
				onClick: () => store.getState().setWarpActive(false),
				style: BTN({ marginTop: "4px" }),
			},
			"Done",
		),
	);
}
