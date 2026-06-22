# Image Warp for SafeLight

A Photoshop-Liquify-style interactive warp for SafeLight's **Develop** module —
push, twirl, pucker, bloat, push-left, reconstruct, smooth, and a freeze mask.

It's built for RAW: the warp is applied **non-destructively** as a GPU
**coordinate** displacement, evaluated right after crop/lens correction and
*before* the image is sampled. Because the whole pipeline below it — sampling,
white balance, exposure, noise reduction, masks, tone mapping — then runs on the
warped coordinate, the warp composes correctly with every other edit (it doesn't
re-sample raw pixels and lose them) and flows through grid thumbnails and export
exactly like a built-in geometry edit. Nothing is baked.

## Use

1. Open a photo in Develop.
2. Click **Warp** in the toolbar (or press **Shift+W**) to arm the tool.
3. Pick a tool in the **Warp** panel, set the brush, and drag on the image.

**Tools**

| Tool | Effect |
| --- | --- |
| Push | Pixels follow the drag |
| Push Left | Pixels shift perpendicular to the drag |
| Twirl CW / CCW | Rotate pixels around the brush |
| Pucker | Pull pixels toward the centre |
| Bloat | Push pixels away from the centre |
| Restore | Fade the warp back toward none |
| Smooth | Relax / even out the displacement |
| Freeze / Thaw | Mask a region from (or back into) editing |

**Brush** — *Size* (radius), *Density* (centre strength), *Pressure* (overall
scale), *Rate* (flow speed for the continuous tools), *Hardness* (edge feather).

Edits are fully **undoable** (Ctrl+Z / Ctrl+Y) and persist with the photo.

## Build & install (dev)

```sh
npm run install-local   # bundles to dist/ and copies into SafeLight's plugins dir
```

Then restart SafeLight (or re-enable the extension).

## How it persists

The warp is a 256×256 displacement field. It's stored as a compact binary
sidecar in the project (`.safelight/blobs/`), referenced from the photo's edit
history by a small revision token — so it round-trips through save/undo without
bloating `catalog.json`. One caveat: after a full app reload, undoing *past* the
last-saved warp state restores the saved field rather than that older
intermediate stroke (in-session undo/redo is exact).

## Requires

SafeLight **2.3.0+** (for the per-photo blob API and the `geometry`-phase
extension stage). MIT licensed.
