/**
 * The player: WASD / arrows with collision against world.passable, tap or click the ground to walk there
 * along world.nav, facing, step animation, camera follow, freeze, and the body read from inhabitant traits.
 * Walking into a town makes it the player's town (the sim's deeds and deliveries need the two to agree).
 */
import type Phaser from 'phaser';
import type { GameContext, PlayerHandle, Pt } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { getWalkMul } from '../dev/dev-flags';
import { Figure } from './figure';
import { headHeight, inhabitantLook, type PersonLook } from './looks';
import type { TownIndex } from './towns';
import { padMove } from '../ui/pad/move-source';

/** Matches the sim's TILES_PER_MINUTE: about two tiles a second at human pace. */
const WALK_TILES_PER_SEC = 2.2;
const ARRIVE_PX = TILE_PX * 12;
const MAX_SUBSTEP = 6;

export type PlayerCtl = PlayerHandle & {
  figure: Figure;
  look(): PersonLook;
  head(): Pt;
  moving(): boolean;
  refreshLook(): void;
  update(dt: number, timeSec: number): void;
  destroy(): void;
};

type Walk = { path: Pt[]; done: (ok: boolean) => void; stuck: number };

export function createPlayer(ctx: GameContext, towns: TownIndex): PlayerCtl {
  const scene = ctx.scene;
  const st0 = ctx.session.getState();
  if (!st0) throw new Error('actors need a started session');
  let look: PersonLook = inhabitantLook(st0, bodyVariant());
  let lookSig = JSON.stringify(look.look) + look.scale;
  const figure = new Figure(scene, look, 0, 0);
  const cam = scene.cameras.main;
  const follow = () => cam.startFollow(figure.sprite, true, 0.18, 0.18, 0, headHeight(look.scale) / 2);
  follow();

  let frozen = false;
  let facing = { dx: 0, dy: 1 };
  let walk: Walk | null = null;
  let walkGen = 0;
  let isMoving = false;
  let townCheck = 0;

  const kb = scene.input.keyboard;
  const keys = kb?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key> | undefined;
  const typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const blocked = () => frozen || safe(() => ctx.ui.blocking(), false);

  function bodyVariant(): number {
    const inh = ctx.session.getState()?.player;
    const i = inh?.bodies?.findIndex((b) => b.id === inh.activeBodyId) ?? 0;
    return Math.max(0, i);
  }

  const feetFree = (x: number, y: number) => ctx.world.passable({ x: x - 5, y: y - 2 }) && ctx.world.passable({ x: x + 5, y: y - 2 });

  /** Move by (dx, dy) in small sub-steps, sliding along walls. Returns the distance covered. */
  function moveBy(dx: number, dy: number): number {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP));
    const sx = dx / n, sy = dy / n;
    let x = figure.x, y = figure.y;
    const free = feetFree(x, y); // standing somewhere odd (spawned on a wall): let them walk out
    for (let i = 0; i < n; i++) {
      if (!free || feetFree(x + sx, y + sy)) { x += sx; y += sy; continue; }
      if (sx && feetFree(x + sx, y)) { x += sx; continue; }
      if (sy && feetFree(x, y + sy)) { y += sy; continue; }
      break;
    }
    const d = Math.hypot(x - figure.x, y - figure.y);
    if (d > 0) figure.place(x, y);
    return d;
  }

  function endWalk(ok: boolean): void {
    const w = walk;
    walk = null;
    w?.done(ok);
  }

  function setFacing(dx: number, dy: number): void {
    figure.face(dx, dy);
    facing = figure.dir === 2 ? { dx: dx < 0 ? -1 : 1, dy: 0 } : { dx: 0, dy: figure.dir === 1 ? -1 : 1 };
  }

  const speedPx = () => WALK_TILES_PER_SEC * TILE_PX * look.speed * getWalkMul();

  function walkTo(p: Pt): Promise<boolean> {
    endWalk(false);
    walkGen++;
    if (frozen) return Promise.resolve(false);
    const from = { x: figure.x, y: figure.y };
    const indoors = !!safe(() => ctx.world.room(), null);
    const path = indoors ? [p] : ctx.world.nav.route(from, p) ?? (feetFree(p.x, p.y) ? [p] : null);
    if (!path || !path.length) return Promise.resolve(false);
    return new Promise((done) => { walk = { path: [...path], done, stuck: 0 }; });
  }

  // Tap or click the ground: walk there. A tap the ring or a sheet took, or a drag, is not a walk.
  scene.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
    if (ptr.button !== 0 || Math.hypot(ptr.upX - ptr.downX, ptr.upY - ptr.downY) > 10 || ptr.upTime - ptr.downTime > 700) return;
    const at = cam.getWorldPoint(ptr.x, ptr.y);
    const gen = walkGen;
    setTimeout(() => {
      if (gen !== walkGen || blocked() || safe(() => ctx.interact.isOpen(), false)) return;
      void walkTo({ x: at.x, y: at.y });
    }, 0);
  });

  function checkTown(dt: number): void {
    townCheck -= dt;
    if (townCheck > 0) return;
    townCheck = 0.25;
    const st = ctx.session.getState();
    if (!st || safe(() => ctx.world.room(), null)) return;
    const pos = { x: figure.x, y: figure.y };
    const id = safe(() => ctx.world.townAt(pos), null) ?? towns.nearest(pos, ARRIVE_PX)?.id ?? null;
    if (id && id !== st.player.townId) {
      st.player.townId = id;
      ctx.events.emit('arrive', { townId: id });
    }
  }

  return {
    figure,
    look: () => look,
    pos: () => ({ x: figure.x, y: figure.y }),
    setPos(p) {
      endWalk(false);
      figure.place(p.x, p.y);
      follow();
    },
    facing: () => ({ ...facing }),
    walkTo,
    stop: () => endWalk(false),
    setFrozen(f) {
      frozen = f;
      if (f) endWalk(false);
    },
    head: () => ({ x: figure.x, y: figure.y - headHeight(look.scale) }),
    moving: () => isMoving,
    refreshLook() {
      const st = ctx.session.getState();
      if (!st) return;
      const next = inhabitantLook(st, bodyVariant());
      const sig = JSON.stringify(next.look) + next.scale;
      if (sig === lookSig) return;
      look = next;
      lookSig = sig;
      figure.setLook(look);
      follow();
    },
    update(dt, timeSec) {
      let mx = 0, my = 0;
      if (!blocked() && keys && !typing()) {
        mx = (keys.D!.isDown || keys.RIGHT!.isDown ? 1 : 0) - (keys.A!.isDown || keys.LEFT!.isDown ? 1 : 0);
        my = (keys.S!.isDown || keys.DOWN!.isDown ? 1 : 0) - (keys.W!.isDown || keys.UP!.isDown ? 1 : 0);
      }
      // Pad / controller stick (ui/pad/move-source.ts): keys win; a light push walks slower.
      let padMag = 1;
      if (!mx && !my && !blocked() && !typing()) { const a = padMove(); if (a) ({ x: mx, y: my, mag: padMag } = a); }
      const step = speedPx() * dt;
      isMoving = false;
      if (mx || my) {
        if (walk) endWalk(false);
        const k = (step * padMag) / Math.hypot(mx, my);
        setFacing(mx, my);
        isMoving = moveBy(mx * k, my * k) > 0.01;
      } else if (walk && !frozen) {
        const goal = walk.path[0]!;
        const dx = goal.x - figure.x, dy = goal.y - figure.y, d = Math.hypot(dx, dy);
        if (d <= Math.max(2, step)) {
          figure.place(goal.x, goal.y);
          walk.path.shift();
          isMoving = true;
          if (!walk.path.length) endWalk(true);
        } else {
          setFacing(dx, dy);
          const moved = moveBy((dx / d) * step, (dy / d) * step);
          isMoving = moved > 0.01;
          walk.stuck = moved < step * 0.25 ? walk.stuck + dt : 0;
          if (walk.stuck > 0.4) endWalk(false);
        }
      }
      figure.animate(dt, isMoving, timeSec);
      checkTown(dt);
    },
    destroy() {
      endWalk(false);
      figure.destroy();
    },
  };
}

/** Call an API of an area that may not be attached yet (early frames, stubs) without throwing. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
