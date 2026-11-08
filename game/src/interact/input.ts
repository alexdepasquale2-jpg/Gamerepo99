/**
 * Keyboard and tap input for the ring. Keys are shortcuts only; every one has a touch path.
 *  - E / Enter: open the focused thing's ring (the touch bar's Act button calls interact.open()).
 *  - While the ring is open: 1–6 pick a chip, Esc / Backspace step out of a family and then close,
 *    E closes. These keys are taken before anyone else sees them (hotbar digits, pause on Esc).
 *  - Tap or click a thing: open its ring; when it is out of reach, walk there first, then open.
 *    Taps on empty ground are the actors' (walk); a tap outside an open ring closes it.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt, Thing } from '../app/contracts';
import { dist, reachOf } from './focus';
import type { Ring } from './ring';

export type InputDeps = {
  ctx: GameContext;
  ring: Ring;
  /** The thing the ring is open on. */
  ringThing(): Thing | null;
  focus(): Thing | null;
  blocked(): boolean;
  /** Things under / near a world point (world + actors). */
  thingUnder(p: Pt): Thing | null;
  /** The live copy of a thing (people move), by key, near the player. */
  fresh(key: string): Thing | null;
  open(thing: Thing): void;
  close(): void;
};

/** A press that travelled farther than this (CSS-free canvas px) was a drag, not a tap. */
const TAP_MOVE_PX = 12;
/** On arrival from a walk the thing may have moved a little: still open if this close. */
const ARRIVE_SLACK = 1.4;

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function attachInput(d: InputDeps): () => void {
  const { ctx, ring } = d;
  const scene: Phaser.Scene = ctx.scene;
  let walkToken = 0;

  const consume = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (ring.isOpen()) {
      if (/^[1-6]$/.test(k)) {
        consume(e);
        if (!e.repeat) ring.pickIndex(Number(k) - 1);
      } else if (k === 'Escape' || k === 'Backspace') {
        consume(e);
        if (!ring.back()) d.close();
      } else if (k === 'e' || k === 'E') {
        consume(e);
        if (!e.repeat) d.close();
      }
      return;
    }
    if ((k === 'e' || k === 'E' || k === 'Enter') && !e.repeat && !d.blocked()) {
      const f = d.focus();
      if (!f) return;
      consume(e);
      d.open(f);
    }
  };
  // Capture on window: we see the key before the hotbar, the pause menu or Phaser's keyboard.
  window.addEventListener('keydown', onKey, true);

  async function walkThenOpen(thing: Thing): Promise<void> {
    const token = ++walkToken;
    const arrived = await ctx.actors.player.walkTo({ x: thing.x, y: thing.y });
    if (token !== walkToken || d.blocked() || ring.isOpen()) return;
    const now = d.fresh(thing.key) ?? thing;
    const near = dist(ctx.actors.player.pos(), now) <= reachOf(now) * ARRIVE_SLACK;
    if (near) d.open(now);
    else if (arrived) ctx.voice.tell('Too far to reach.', 'player');
  }

  const onUp = (pointer: Phaser.Input.Pointer): void => {
    // Only taps on the canvas itself (DOM chips, sheets and the HUD never count).
    if (pointer.upElement !== scene.game.canvas) return;
    if (pointer.getDistance() > TAP_MOVE_PX) return;
    const at = { x: pointer.worldX, y: pointer.worldY };
    const hit = d.thingUnder(at);
    if (ring.isOpen()) {
      const same = hit && d.ringThing()?.key === hit.key;
      d.close();
      if (same || !hit) return;
    }
    if (!hit || d.blocked()) return;
    walkToken++;
    if (dist(ctx.actors.player.pos(), hit) <= reachOf(hit)) {
      ctx.actors.player.stop();
      d.open(hit);
    } else {
      void walkThenOpen(hit);
    }
  };
  scene.input.on('pointerup', onUp);

  return () => {
    window.removeEventListener('keydown', onKey, true);
    scene.input.off('pointerup', onUp);
  };
}
