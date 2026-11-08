/**
 * UI theme tokens: the one place UI colours, fonts and sizes live (docs/art/PALETTE.md "UI / overlay
 * tokens", UI_JUICE_SPEC.md §8-9). DOM surfaces read them as CSS variables (see `cssVars`); Phaser
 * surfaces read numbers through `phaserColor`. No Phaser import here, so this stays unit-testable.
 */

/** PALETTE.md UI / overlay tokens, verbatim. */
export const PALETTE_UI = {
  void: '#0B0A0F',
  textPrimary: '#E8DCC8',
  textMuted: '#8A7A68',
  sparkFill: '#F2B84B',
  sparkOutline: '#5EC8C8',
  wound: '#7A2E2E',
  bond: '#6EC8E8',
  markHollow: '#6A6870',
  markDependent: '#C080A0',
  markGrown: '#70C080',
  letter: '#E8E0C8',
} as const;

/**
 * Surfaces and lines, picked from PALETTE.md ramps so chrome stays "slightly warmer / higher contrast
 * than the despair world" (UI_JUICE_SPEC §8): body text sits on void → soil[0] only.
 */
export const COLORS = {
  ...PALETTE_UI,
  /** Sheet / panel ground (Marrow accent, darkest warm). */
  surface: '#1C1612',
  /** Raised row, selected item, button ground (soil ramp 1). */
  surfaceRaised: '#34322C',
  /** Pressed / active button (soil ramp 2). */
  surfaceActive: '#3E3A30',
  /** Panel edge (path ramp, alive end). */
  line: '#B89860',
  /** Quiet divider (path ramp 5). */
  lineQuiet: '#7A7060',
  /** Headings and focus ring: the spark's own gold. */
  accent: '#F2B84B',
  /** Hints under items (path ramp 8). */
  hint: '#A89068',
  /** Status notes (water ramp, alive end). */
  note: '#84B8B0',
  /** Something the town is short of / unread: alive window glow. */
  glow: '#F0D878',
  /** Disabled text (path ramp 6). */
  disabled: '#8A7E6A',
  /** Spark bar empty track (soil ramp 0). */
  sparkEmpty: '#2A2A28',
} as const;

export type ColorToken = keyof typeof COLORS;

export const FONTS = {
  /** Reading text: menus, sheets, letters. */
  ui: 'Georgia, "Times New Roman", serif',
  /** Numbers and short labels (prices, tallies). */
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
} as const;

/** Sizes in *logical* canvas pixels (640x360); the layer scales them, floors keep them readable. */
export const SIZES = {
  /** Min body text in CSS px (UI_JUICE_SPEC §8: ≥ 12px UI). */
  minBodyPx: 12,
  /** Min label text in CSS px (≥ 10px mono labels). */
  minLabelPx: 10,
  body: 9,
  label: 8,
  heading: 11,
  /** Max side-sheet width as a share of the canvas width: the world stays visible. */
  sheetMaxShare: 0.4,
  /** Gutter between sheet and canvas edge (logical px). */
  gutter: 6,
  /** Room the hotbar needs at the bottom of the canvas (logical px). */
  hotbarReserve: 52,
  radius: 4,
} as const;

/**
 * Where the HUD sits, in logical canvas px (640x360). The hotbar belongs to the panels area; the purse,
 * the touch bar and the chips are placed to leave its box clear.
 */
export const HUD_LAYOUT = {
  /** The canvas hotbar: 8 slots of 30 px, centred, 6 px off the bottom edge. */
  hotbar: { x: 200, y: 324, w: 240, h: 30 },
  /** Spark bar, top-left. */
  spark: { x: 8, y: 8, w: 84, h: 7 },
  /** Unread-letters chip on the right edge (clear of a minimap in the top-right corner). */
  lettersTop: 98,
  /** Touch-bar button size (logical px; never under 40 CSS px). */
  touchBtn: 34,
} as const;

/** Stacking order of DOM surfaces (the canvas sits at 0). */
export const Z = { layer: 10, menu: 30, modal: 50, dev: 60 } as const;

/** '#RRGGBB' → 0xRRGGBB for Phaser fills and strokes. */
export function phaserColor(token: ColorToken | string): number {
  const hex = token in COLORS ? COLORS[token as ColorToken] : token;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a colour token or #rrggbb: ${token}`);
  return parseInt(m[1]!, 16);
}

/** '#RRGGBB' + alpha → 'rgba(r,g,b,a)'. */
export function rgba(token: ColorToken | string, alpha: number): string {
  const n = phaserColor(token);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every colour token as a CSS custom property: `--hf-text-primary: #E8DCC8;` … */
export function cssVars(): string {
  const lines = Object.entries(COLORS).map(([k, v]) => `--hf-${kebab(k)}:${v};`);
  lines.push(`--hf-font-ui:${FONTS.ui};`, `--hf-font-mono:${FONTS.mono};`);
  return lines.join('');
}

/** Phaser text styles for canvas-side UI (minimap labels, hotbar, map). */
export function phaserText(kind: 'label' | 'body' | 'heading' = 'body'): {
  fontFamily: string;
  fontSize: string;
  color: string;
  stroke: string;
  strokeThickness: number;
} {
  const size = kind === 'heading' ? 13 : kind === 'label' ? 10 : 11;
  return {
    fontFamily: kind === 'label' ? FONTS.mono : FONTS.ui,
    fontSize: `${size}px`,
    color: kind === 'heading' ? COLORS.accent : COLORS.textPrimary,
    stroke: COLORS.void,
    strokeThickness: 3,
  };
}
