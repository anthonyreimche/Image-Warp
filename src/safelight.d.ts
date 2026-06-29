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
  cropping: boolean;
  activeTool: "none" | "mask" | "retouch" | "hsl-picker";
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

export type SlotName =
  | "library-toolbar"
  | "library-subbar"
  | "develop-toolbar"
  | "develop-canvas-overlay"
  | "develop-detail";

export interface SlotContribution {
  id: string;
  slot: SlotName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: (...args: any[]) => any;
  order?: number;
}

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

// ── API ──────────────────────────────────────────────────────────────────────

// Shared core UI kit components are opaque React components; this file vendors
// its own shapes and can't import React, so ComponentType is just `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentType = any;

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  react: any;
  registerProcessingStage(c: ProcessingStageContribution): void;
  unregisterProcessingStage(id: string): void;
  setStageTexture(stageId: string, key: string, tex: StageTextureData | null): void;
  registerPanel(c: PanelContribution): void;
  registerSlot(c: SlotContribution): void;
  registerKeybinding(c: KeyActionContribution): void;
  registerCursor(c: CursorContribution): void;
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    onChange(cb: (key: string, value: unknown) => void): () => void;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: Record<string, any>;
  ui?: {
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
  };
  stores: {
    create<T>(initializer: StateCreator<T>): StoreApi<T>;
    useDevelopStore: StoreApi<DevelopStoreState>;
    useUIStore: StoreApi<UIStoreState>;
    [key: string]: unknown;
  };
  keybindings: { getBinding(actionId: string): string };
  develop: {
    useDevelopOverlay(): DevelopOverlayState;
    captureFrame(params: DevelopParams): Promise<ImageBitmap>;
    setCanvasCursor(
      cursor: string | CursorContribution | null,
      opts?: { priority?: number },
    ): () => void;
    putPhotoData(key: string, data: Uint8Array | null): void;
    getPhotoData(key: string): Promise<Uint8Array | null>;
  };
}

export interface ExtensionModule {
  activate(api: SafelightAPI): void;
  deactivate?(): void;
}
