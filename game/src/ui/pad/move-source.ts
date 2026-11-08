/**
 * Analog movement from the pad: the on-screen stick, a real controller's stick / d-pad, and the dev hook
 * each write a vector here; the player reads one merged vector a frame (actors/player.ts). Kept free of
 * DOM and Phaser so the player can import it cheaply.
 */
export type Stick = { x: number; y: number };
export type PadMove = { x: number; y: number; mag: number };

const sources = new Map<string, Stick>();
/** While the pad drives a menu or the ring, its directions navigate instead of walking. */
let navigating: () => boolean = () => false;

export function setStick(source: string, x: number, y: number): void {
  if (!x && !y) sources.delete(source);
  else sources.set(source, { x, y });
}

export function setNavigating(fn: () => boolean): void {
  navigating = fn;
}

/** The strongest source this frame as a unit direction plus magnitude (0..1], or null when idle. */
export function padMove(): PadMove | null {
  if (!sources.size || navigating()) return null;
  let best: Stick | null = null;
  let bestM = 0;
  for (const s of sources.values()) {
    const m = Math.hypot(s.x, s.y);
    if (m > bestM) { best = s; bestM = m; }
  }
  if (!best || bestM < 1e-3) return null;
  return { x: best.x / bestM, y: best.y / bestM, mag: Math.min(1, bestM) };
}

/** Radial dead zone, rescaled so motion starts smoothly at the edge of the dead zone. */
export function deadZone(x: number, y: number, dz: number): Stick {
  const m = Math.hypot(x, y);
  if (m <= dz) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

export type Dir = 'up' | 'down' | 'left' | 'right';

/** The dominant cardinal direction of a vector past `min`, for menu navigation. */
export function cardinal(x: number, y: number, min = 0.5): Dir | null {
  if (Math.hypot(x, y) < min) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}
