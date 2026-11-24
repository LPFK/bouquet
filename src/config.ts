/**
 * Single source of truth for look and composition.
 * Tweak values here (or live with ?debug) before touching module code.
 */

export type FlowerKind = 'rose' | 'tulip' | 'daisy' | 'bud';

export interface FlowerPalette {
  /** colour at the petal base (throat) */
  base: string;
  /** colour at the petal tip and margins */
  tip: string;
  /** optional heart colour (daisy disc, etc.) */
  center?: string;
}

export const PALETTES = {
  // roses
  crimson: { base: '#3c0010', tip: '#c8142e' },
  wine: { base: '#2a000c', tip: '#981128' },
  blush: { base: '#7a1240', tip: '#f59cb6' },
  ivory: { base: '#9c8c70', tip: '#fffaf0' },
  rust: { base: '#5a1806', tip: '#e5793c' },
  // tulips
  pink: { base: '#8a1448', tip: '#ff9cc2' },
  plum: { base: '#2e0626', tip: '#b2417c' },
  cream: { base: '#a8633a', tip: '#fde4c8' },
  coral: { base: '#9a2112', tip: '#ff9468' },
  lilac: { base: '#33205e', tip: '#c2a6f3' },
  butter: { base: '#b07208', tip: '#ffe49a' },
  white: { base: '#8c9784', tip: '#fbfbf4', center: '#e09a1c' },
  golden: { base: '#8a5306', tip: '#ffd46a', center: '#4a2408' },
  leaf: { base: '#1b3a24', tip: '#76a062' },
  stem: { base: '#2f5233', tip: '#5d8a4f' },
  eucalyptus: { base: '#243c38', tip: '#8faea3' },
  kraft: { base: '#5a3a22', tip: '#c09064' },
  tissue: { base: '#a77b73', tip: '#f6e4dc' },
  tissueWhite: { base: '#9c968c', tip: '#fbf8f2' },
  tissueSage: { base: '#6f7a66', tip: '#e3e8d6' },
  ribbon: { base: '#4e0c22', tip: '#a8344f' },
  ribbonIvory: { base: '#8a8070', tip: '#efe6d4' },
  ribbonSage: { base: '#3a4a36', tip: '#7f9673' },
} satisfies Record<string, FlowerPalette>;

export type PaletteName = keyof typeof PALETTES;

export interface FlowerGroupSpec {
  kind: FlowerKind;
  palette: PaletteName;
  count: number;
  /** random uniform scale range */
  scale: [number, number];
}

export const BOUQUET = {
  /** default seed; override with ?seed=123 */
  seed: 7,
  /** radius of the dome the flower heads sit on (grows if the heads need more room) */
  domeRadius: 1.15,
  /** how much the dome bulges toward the camera (0 = flat) */
  domeDepth: 0.55,
  /** heads may overlap by this fraction of their radii before the layout pushes them apart */
  headOverlap: 0.27,
  /** darkening of petals deep inside the dome, between heads (0 = off) */
  contactShade: 0.5,
  /** where all stems converge (the hand-tie) */
  tiePoint: [0, -1.75, -0.25] as [number, number, number],
  /** how far stems extend below the tie */
  stemTail: 0.95,
  leaves: 12,
  /** florist's paper cone around the stems (see flowers/wrap.ts) */
  wrap: {
    /** how far the paper extends below the tie */
    below: 0.55,
    radiusBottom: 0.13,
    radiusTie: 0.2,
    /** how fast the cone opens above the tie */
    flare: 0.55,
    /** the cone stops opening around this radius (soft limit) */
    maxRadius: 1.6,
    /** height of the top edge at the front (low, shows the flowers) and at the back */
    frontY: -1.2,
    backY: 1.05,
  },
  flowers: [
    { kind: 'rose', palette: 'crimson', count: 5, scale: [0.95, 1.15] },
    { kind: 'rose', palette: 'wine', count: 3, scale: [0.9, 1.05] },
    { kind: 'tulip', palette: 'pink', count: 4, scale: [0.85, 1.0] },
    { kind: 'tulip', palette: 'lilac', count: 3, scale: [0.85, 1.0] },
    { kind: 'daisy', palette: 'white', count: 6, scale: [0.75, 0.95] },
    { kind: 'bud', palette: 'butter', count: 6, scale: [0.8, 1.1] },
  ] satisfies FlowerGroupSpec[],
};

export interface Theme {
  /** shown in the UI (French) */
  label: string;
  /** one palette per entry of BOUQUET.flowers, same order */
  flowers: PaletteName[];
  tissue: PaletteName;
  ribbon: PaletteName;
}

/** Colour themes, chosen with ?theme=<name> or the theme button. First one is the default. */
export const THEMES = {
  classique: {
    label: 'Classique',
    flowers: ['crimson', 'wine', 'pink', 'lilac', 'white', 'butter'],
    tissue: 'tissue',
    ribbon: 'ribbonIvory',
  },
  printemps: {
    label: 'Printemps',
    flowers: ['blush', 'cream', 'coral', 'lilac', 'white', 'butter'],
    tissue: 'tissue',
    ribbon: 'ribbon',
  },
  automne: {
    label: 'Automne',
    flowers: ['rust', 'wine', 'plum', 'coral', 'golden', 'rust'],
    tissue: 'tissueSage',
    ribbon: 'ribbonSage',
  },
  mariage: {
    label: 'Mariage',
    flowers: ['ivory', 'blush', 'ivory', 'cream', 'white', 'ivory'],
    tissue: 'tissueWhite',
    ribbon: 'ribbonIvory',
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export const FILLERS = {
  /** eucalyptus sprigs poking out around the rim */
  eucalyptus: 5,
  /** baby's breath clusters tucked into the gaps between heads */
  babysBreath: 7,
  babysBreathFlorets: 26,
};

export const INTERACTION = {
  /** radians the head under the pointer turns toward the viewer */
  hoverLean: 0.22,
  /** world units it comes forward */
  hoverLift: 0.12,
  /** bloom-in: seconds per head, and spread of the start times across the bouquet */
  bloomDuration: 0.9,
  bloomStagger: 1.1,
  /** seconds for the old bouquet to fold away before a new one blooms */
  outroDuration: 0.4,
  /** a petal falls every [min, max] seconds */
  fallingEvery: [5, 11] as [number, number],
};

export const PERF = {
  /** at auto quality, drop to low when the average frame time stays above this (ms) */
  slowFrameMs: 22,
  /** ...for this many seconds */
  slowFor: 3,
};

export const SCENE = {
  background: '#141518',
  /** backdrop gradient, centre to edges. Keep it near-neutral: Neutral tone mapping's toe
   *  crushes dark channels unevenly, so a faint blue tint renders as navy. */
  backdropInner: '#4a4a4d',
  backdropOuter: '#141416',
  exposure: 0.9,
  dust: { far: 260, near: 14, color: '#f5e9d6' },
  /** soft warm light pool drifting slowly across the backdrop, and the key light swaying with it */
  lightSweep: { pool: 0.07, keySwing: 0.18, period: 70 },
  /** out-of-focus window light (upper left) and foliage silhouettes (edges) */
  windowLight: 0.15,
  foliage: 0.75,
  /** soft shadow of the bouquet on a plane behind it */
  shadow: 0.5,
};

export const CAMERA = {
  fov: 30,
  distance: 8.6,
  height: 0.15,
  /** a little below the bouquet centre, so it sits higher on screen, clear of the control bar */
  target: [0, -0.55, 0] as [number, number, number],
  /** below this aspect ratio the camera backs off so the bouquet fits (portrait screens) */
  minAspect: 0.85,
};

export const FX = {
  bokeh: { aperture: 0.0018, maxblur: 0.01, focusOffset: -0.6 },
  bloom: { strength: 0.2, radius: 0.5, threshold: 0.9 },
  /** fake subsurface: warm glow on thin petal areas lit from behind (0 = off) */
  subsurface: 0.5,
  grain: 0.045,
  vignette: 0.38,
};

export const MOTION = {
  /** radians of head sway */
  swayAmplitude: 0.045,
  swaySpeed: 0.7,
  /** camera parallax travel in world units */
  parallax: 0.55,
  /** pointer smoothing, 0..1 per frame at 60fps */
  damping: 0.05,
  /** slow automatic drift when there is no pointer input */
  idleDrift: 0.35,
  /** multiplier applied when prefers-reduced-motion is set */
  reducedFactor: 0.25,
};
