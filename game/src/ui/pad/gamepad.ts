/**
 * Real controllers through the Gamepad API (desktop and mobile browsers). Read once a frame by pad.ts:
 * the first connected pad's buttons (standard mapping) and one movement vector (left stick, else d-pad).
 * Browsers only expose a pad after its first button press, so there is nothing to do until then.
 */
import { STANDARD_MAP, type PadButton } from './bindings';
import { deadZone, type Stick } from './move-source';

export type PadFrame = {
  id: string;
  /** Buttons held this frame (directions included, from the d-pad only). */
  held: Set<PadButton>;
  /** Left stick past the dead zone, or the d-pad as a unit vector. */
  vec: Stick;
  /** Any input at all this frame (to switch hints on). */
  active: boolean;
};

const STICK_DEAD = 0.22;
const PRESS = 0.5;

export function readGamepad(): PadFrame | null {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...list].find((g): g is Gamepad => !!g && g.connected);
  if (!gp) return null;
  const held = new Set<PadButton>();
  gp.buttons.forEach((b, i) => {
    const name = STANDARD_MAP[i];
    if (name && (b.pressed || b.value > PRESS)) held.add(name);
  });
  let vec = deadZone(gp.axes[0] ?? 0, gp.axes[1] ?? 0, STICK_DEAD);
  if (!vec.x && !vec.y) {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
    const m = Math.hypot(x, y) || 1;
    vec = { x: x / m, y: y / m };
  }
  return { id: gp.id, held, vec, active: held.size > 0 || !!vec.x || !!vec.y };
}

/** Which glyph set the pad's face buttons print: PlayStation shapes, or the A/B/X/Y letters. */
export function glyphStyle(id: string): 'ps' | 'abxy' {
  return /054c|playstation|dualshock|dualsense/i.test(id) ? 'ps' : 'abxy';
}
