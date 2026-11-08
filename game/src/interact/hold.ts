/**
 * Hold to work: helping is doing, not a menu. With a work spot in focus (world/things/work-spots), holding
 * E (or the on-screen A button, which calls startHold / endHold) fills an arc over the spot; when it closes
 * that is one effort unit, sent to session.workAt. Keep holding and the next unit starts. A quick tap
 * instead says what the spot is for ("Hold to help Mara with the cooking."). Walking off cancels.
 *
 * The sim decides everything (sim/tasks/contribute); this file only times the hold and presents the result:
 * the player's line, the lead's thanks in their own bubble, the cue, and the 'act' event the world and HUD
 * already redraw on.
 */
import Phaser from 'phaser';
import type { GameContext, Thing } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { taskById, taskHint, TASKS, type WorkResult } from '../sim/tasks';
import { dist, reachOf } from './focus';

/** A work spot Thing: kind 'prop', id `work@<taskId>` (world/things/work-spots). */
export const isWorkSpot = (t: Thing | null | undefined): t is Thing => !!t && t.kind === 'prop' && t.id.startsWith('work@');

const ARC_R = 11;
const ARC_UP = 34;
const ARC_DEPTH = 4.6e7;
/** Wander this far past the spot's reach and the hold lets go. */
const LEAVE_SLACK = 1.3;

export type HoldApi = {
  /** Begin holding on the focused work spot. False (nothing happens) when the focus is not one. */
  start(): boolean;
  /** Let go: a quick tap gives the hint; a hold cut short just stops. */
  end(): void;
  active(): boolean;
  /** 0..1 of the current unit. */
  progress(): number;
  /** One effort unit now, presented as a finished hold would be (dev hooks, tests). */
  complete(thing: Thing, effort?: number): WorkResult | null;
  update(): void;
  destroy(): void;
};

export type HoldDeps = {
  focus(): Thing | null;
  fresh(key: string): Thing | null;
  blocked(): boolean;
};

const holds = new WeakMap<GameContext, HoldApi>();

export function createHold(ctx: GameContext, d: HoldDeps): HoldApi {
  const scene = ctx.scene;
  const g = scene.add.graphics().setDepth(ARC_DEPTH);
  let cur: { key: string; thing: Thing; t0: number; units: number } | null = null;
  const now = (): number => scene.time.now;

  const draw = (at: { x: number; y: number } | null, p: number): void => {
    g.clear();
    if (!at) return;
    const x = at.x, y = at.y - ARC_UP, a0 = -Math.PI / 2;
    g.fillStyle(0x1a140c, 0.55).fillCircle(x, y, ARC_R + 3);
    g.lineStyle(3, 0x5a4a30, 0.9).strokeCircle(x, y, ARC_R);
    if (p > 0) g.lineStyle(4, 0xf0c060, 1).beginPath().arc(x, y, ARC_R, a0, a0 + Math.PI * 2 * Math.min(1, p), false).strokePath();
  };

  function present(thing: Thing, res: WorkResult): void {
    if (res.ok) {
      ctx.voice.tell(res.line, 'player');
      if (res.thanks?.line) ctx.voice.say(res.thanks.personId, res.thanks.line, { tone: 'warm' });
      ctx.voice.sfx('act');
    } else {
      ctx.voice.tell(res.line, 'player');
      ctx.voice.sfx('refuse');
    }
    const outcome = { ok: res.ok, line: res.line };
    ctx.events.emit('act', { actionId: `task.work@${thing.key}`, target: thing.target, outcome });
    ctx.events.emit('inventory', {});
  }

  const complete = (thing: Thing, effort = 1): WorkResult | null => {
    const res = ctx.session.workAt(thing.key, effort);
    present(thing, res);
    return res;
  };

  const stop = (): void => { cur = null; draw(null, 0); };

  const api: HoldApi = {
    start() {
      if (cur) return true;
      const f = d.focus();
      if (!isWorkSpot(f) || d.blocked()) return false;
      ctx.actors.player.stop();
      cur = { key: f.key, thing: f, t0: now(), units: 0 };
      draw(f, 0);
      return true;
    },
    end() {
      if (!cur) return;
      const { thing, t0, units } = cur;
      stop();
      if (units > 0 || now() - t0 > TASKS.tapMs) return;
      const st = ctx.session.getState();
      const task = st ? taskById(st, thing.key) : undefined;
      if (st && task) ctx.voice.tell(taskHint(st, task), { x: thing.x, y: thing.y - ARC_UP });
    },
    active: () => !!cur,
    progress: () => (cur ? Math.min(1, (now() - cur.t0) / TASKS.holdMs) : 0),
    complete,
    update() {
      if (!cur) return;
      const live = d.fresh(cur.key);
      if (!live || d.blocked() || dist(ctx.actors.player.pos(), live) > reachOf(live) * LEAVE_SLACK) return stop();
      cur.thing = live;
      const p = (now() - cur.t0) / TASKS.holdMs;
      draw(live, p);
      if (p < 1) return;
      const res = complete(live);
      // Refused (capped, finished, gone): let go. Otherwise the next unit starts while E stays down.
      if (!res?.ok) return stop();
      cur.units++;
      cur.t0 = now();
    },
    destroy() { stop(); g.destroy(); holds.delete(ctx); },
  };
  holds.set(ctx, api);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => api.destroy());
  return api;
}

/** For the on-screen A button and other areas: start / end a hold on the focused work spot. */
export const startHold = (ctx: GameContext): boolean => holds.get(ctx)?.start() ?? false;
export const endHold = (ctx: GameContext): void => holds.get(ctx)?.end();
export const holdOf = (ctx: GameContext): HoldApi | undefined => holds.get(ctx);
export const hold = { start: startHold, end: endHold };

// ---- QA hooks (window.__hearth.dev) ----

/** Today's tasks in a town (the player's by default), with where each spot stands if it is drawn near you. */
registerDevHook('tasks', (ctx) => (townId?: string) => {
  const spots = new Map(ctx.world.things(ctx.actors.player.pos(), 4000).filter(isWorkSpot).map((t) => [t.key, t]));
  return ctx.session.tasksNear(townId).map((t) => {
    const s = spots.get(t.spot.key);
    return { ...t, ...(s ? { at: { x: Math.round(s.x), y: Math.round(s.y) } } : {}) };
  });
});
/** One finished hold on a work spot (by key `prop:work@<taskId>` or task id), presented as in play. */
registerDevHook('holdWork', (ctx) => (spotKey: string, effort = 1) => {
  const h = holds.get(ctx);
  const key = spotKey.startsWith('prop:') ? spotKey : `prop:work@${spotKey.replace(/^work@/, '')}`;
  const live = ctx.world.things(ctx.actors.player.pos(), 4000).find((t) => t.key === key);
  const p = ctx.actors.player.pos();
  const thing: Thing = live ?? { key, kind: 'prop', id: key.slice('prop:'.length), x: p.x, y: p.y, label: 'Work', target: { kind: 'prop', id: key.slice('prop:'.length) } };
  const res = h ? h.complete(thing, effort) : ctx.session.workAt(key, effort);
  return { ...res, said: ctx.voice.last() };
});
registerDevHook('holdStart', (ctx) => () => startHold(ctx));
registerDevHook('holdEnd', (ctx) => () => endHold(ctx));
registerDevHook('hold', (ctx) => () => { const h = holds.get(ctx); return { active: h?.active() ?? false, progress: h?.progress() ?? 0 }; });
