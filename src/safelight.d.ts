// Minimal type surface SafeLight exposes to this extension. The repo-root
// `extensions/` folder is outside the main tsconfig, so this can't import
// "@/..." — it vendors the shapes it needs. These mirror the core types in
// src/extensions/types.ts, src/extensions/develop-host.tsx and
// src/state/develop-store.ts; only the fields this extension touches are
// declared.

export interface DevelopParams {
  [key: string]: unknown;
}

// ── Zustand-ish store handles ────────────────────────────────────────────────

export interface StoreApi<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>), replace?: boolean): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

export type StateCreator<T> = (
  set: (partial: Partial<T> | ((s: T) => Partial<T>), replace?: boolean) => void,
  get: () => T,
) => T;

export interface DevelopStoreState {
  photoId: string | null;
  params: DevelopParams;
  paramBag: Record<string, unknown>;
  setDynParam(key: string, value: unknown): void;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export interface UIStoreState {
  activeModule: "library" | "develop";
}

// ── Develop-canvas overlay geometry ──────────────────────────────────────────

export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface DevelopOverlayState {
  rect: OverlayRect | null;
  imageRect: OverlayRect | null;
  nonce: number;
  /** Source-UV (0..1) -> screen point in Develop-canvas-local coords. */
  toScreen: ((u: number, v: number) => OverlayPoint) | null;
  /** Screen point (Develop-canvas-local) -> source-UV. Inverse of toScreen. */
  toImage: ((x: number, y: number) => OverlayPoint) | null;
  /** Source-UV radius (fraction of image height) -> on-screen pixels. */
  radiusToScreen: ((r: number) => number) | null;
  /** On-screen pixels -> source-UV radius (fraction of image height). */
  radiusToImage: ((px: number) => number) | null;
}

// ── Contributions ────────────────────────────────────────────────────────────

export interface KeyActionContribution {
  id: string;
  label: string;
  category?: "General" | "Develop" | "Library";
  defaultCombo: string;
  handler(): void;
}

export interface PanelContribution {
  id: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: any;
  slot?: "develop-right" | "develop-left" | "none";
  order?: number;
  defaultDock?: {
    module: "library" | "develop";
    direction: "left" | "right";
    order?: number;
    width?: number;
    height?: number;
  };
  /** The modules the panel may be docked in; omitted, every module (Safelight 3.2.8). */
  modules?: readonly string[];
  onReset?: () => void;
}

export interface CursorContribution {
  id: string;
  css?: string;
  image?: string;
  hotspotX?: number;
  hotspotY?: number;
  fallback?: string;
}

export type GlslType =
  | "float" | "int" | "bool"
  | "vec2" | "vec3" | "vec4"
  | "ivec2" | "ivec3" | "ivec4"
  | "mat3" | "mat4"
  | "sampler2D";

export interface UniformDeclaration {
  key: string;
  glslType: GlslType;
  default: number | number[] | boolean;
  range?: { min: number; max: number; step?: number };
  label?: string;
}

export interface TextureRequirement {
  key: string;
  kind: "lut" | "coverage" | "dynamic";
  /** Each frame draws the variant filed under its photo's id. Needs 3.2.7. */
  perPhoto?: boolean;
  width?: number;
  height?: number;
  format?: "rgba8" | "rgba16f" | "r8";
}

export interface StageTextureData {
  data: Uint8Array | Float32Array;
  width: number;
  height: number;
  format: "rgba8" | "r8" | "rgba16f" | "r16f";
  version: number;
}

export interface ProcessingStageContribution {
  id: string;
  name: string;
  phase:
    | "geometry"
    | "decode"
    | "noise-reduction"
    | "scene-linear"
    | "tone-map"
    | "display-adjust"
    | "effects"
    | "output-encode";
  priority?: number;
  glsl: string;
  helpers?: string;
  uniforms: UniformDeclaration[];
  textures?: TextureRequirement[];
}

// ── Brush ────────────────────────────────────────────────────────────────────

export interface BrushSettings {
    size: number;
    feather: number;
    opacity: number;
    flow: number;
}

export type BrushSetting = keyof BrushSettings;

export interface BrushCursorProps {
    /** The pointer in the overlay's layout px (api.develop.framePoint), or
     *  "centre" for the reference ring a size slider shows; null draws nothing. */
    at: {
        x: number;
        y: number;
    } | "centre" | null;
    /** The brush's radius, a share of the photo's height. */
    size: number;
    /** 0 to 1: how much of the radius fades. */
    feather: number;
    /** An erasing (subtracting) brush, drawn red and dashed. */
    erase?: boolean;
}

// ── API ──────────────────────────────────────────────────────────────────────

// Shared core UI kit components are opaque React components; this file vendors
// its own shapes and can't import React, so ComponentType is just `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentType = any;

/** An extension's on-image tool that takes the canvas over while it is held. */
export interface CanvasTool {
  /** Drawn over the image, inside the view. */
  overlay: ComponentType;
  /** Whether zoom and pan still reach the canvas under the overlay. */
  zoomable?: boolean;
  /** Escape was pressed: core lets the tool go after this. */
  onEscape?(): void;
  /** A shortcut's action (keybinding id) pressed while the tool is held:
   *  whether the tool took it. */
  onAction?(action: string): boolean;
  /** Whether the tool would take `action` now, without acting. */
  wants?(action: string): boolean;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  react: any;
  registerProcessingStage(c: ProcessingStageContribution): void;
  unregisterProcessingStage(id: string): void;
  setStageTexture(stageId: string, key: string, tex: StageTextureData | null, variant?: string): void;
  setStageTextureProvider(
    stageId: string,
    key: string,
    provide: ((variant: string, signal: AbortSignal) => Promise<StageTextureData | null>) | null,
  ): void;
  dropStageTextureVariants(stageId: string, key: string, variant?: string): void;
  registerPanel(c: PanelContribution): void;
  registerKeybinding(c: KeyActionContribution): void;
  registerCursor(c: CursorContribution): void;
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    onChange(cb: (key: string, value: unknown) => void): () => void;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, any>;
  ui: {
    Button: ComponentType;
    Select: ComponentType;
    TextInput: ComponentType;
    NumberInput: ComponentType;
    TextArea: ComponentType;
    Toggle: ComponentType;
    SegmentedControl: ComponentType;
    Field: ComponentType;
    Section: ComponentType;
    Card: ComponentType;
    Badge: ComponentType;
    ProgressBar: ComponentType;
    Row: ComponentType;
    Stack: ComponentType;
    tokens: Record<string, string>;
    alertDialog(options: { title: string; message: string }): Promise<void>;
  };
  navigation: {
    /** The module this window shows: a popped-out window's own module, else
     *  the main window's tab. Ask it before acting on a Develop shortcut,
     *  `current() === "develop"`, rather than reading the URL. Needs
     *  Safelight 3.2.7. */
    current(): string;
  };
  stores: {
    create<T>(initializer: StateCreator<T>): StoreApi<T>;
    useDevelopStore: StoreApi<DevelopStoreState>;
    useUIStore: StoreApi<UIStoreState>;
    [key: string]: unknown;
  };
  develop: {
    useDevelopOverlay(): DevelopOverlayState;
    captureFrame(params: DevelopParams): Promise<ImageBitmap>;
    setCanvasCursor(
      cursor: string | CursorContribution | null,
      opts?: { priority?: number },
    ): () => void;
    putPhotoData(key: string, data: Uint8Array | null): void;
    /** The open photo's data, or photo `photoId`'s (3.2.7). */
    getPhotoData(key: string, photoId?: string): Promise<Uint8Array | null>;
    /** Hold the develop canvas with an on-image tool, or with null let go of
     *  it. One extension holds it at a time: the last to set it. Needs
     *  Safelight 3.2.0. */
    setCanvasTool(tool: CanvasTool | null): void;
    /** React hook: whether this extension holds the canvas tool. */
    useCanvasToolHeld(): boolean;
    /** The official brush: its starting settings (size is a radius, a share of
     *  the photo's height; feather, opacity and flow run 0 to 1) and `actions`,
     *  the rebindable brush shortcuts' keybinding ids, which core hands only to
     *  the held canvas tool: answer CanvasTool.onAction and wants with `step`,
     *  passing the settings the tool has. It returns the setting a shortcut
     *  changes and its new value, held to its range, or null for one the tool
     *  doesn't have, which core then leaves alone. Needs Safelight 3.2.7. */
    brush: {
        defaults: Readonly<BrushSettings>;
        actions: readonly string[];
        step(action: string, brush: Partial<BrushSettings>): {
            key: BrushSetting;
            value: number;
        } | null;
    };
    /** The official brush ring, for a canvas tool's overlay (a React component
     *  taking BrushCursorProps). It draws around the crosshair cursor. Needs
     *  Safelight 3.2.7. */
    BrushCursor: ComponentType;
    /** The pointer in `el`'s layout px: the space an overlay's `rect`, the
     *  mapping helpers and CSS left/top use. Interface scale zooms the page,
     *  so clientX minus the element's left is off by the zoom. Needs Safelight
     *  3.2.7. */
    framePoint(el: Element, clientX: number, clientY: number): {
        x: number;
        y: number;
    };
  };
}

export interface ExtensionModule {
  activate(api: SafelightAPI): void;
  deactivate?(): void;
}
