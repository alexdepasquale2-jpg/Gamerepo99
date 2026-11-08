/**
 * A many-bodied inhabitant (the brood): siblings trail the player, siblings left behind wait in their
 * towns, and the logic to leave one here, call them back, or switch into one elsewhere. The rules are
 * sim/embodiment; the ui area draws the menu and calls these.
 */
import type { BroodApi, BroodBody, GameContext, Pt } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { bodiesElsewhere, bodiesHere, bodiesWithYou, callBodiesBack, isMultiBody, leaveBodyHere, switchToBody } from '../sim/embodiment';
import { Figure } from './figure';
import { inhabitantLook } from './looks';
import type { PlayerCtl } from './player';
import { inRect, viewRect } from './towns';

const TRAIL_STEP = 10;
const TRAIL_LEN = 64;
const HUES = [0xffffff, 0xe8f4d8, 0xd8ecf4];

export type BroodCtl = BroodApi & {
  update(dt: number, timeSec: number): void;
  /** Where a sibling stands (dev / voice), if drawn. */
  posOf(bodyId: string): Pt | undefined;
  destroy(): void;
};

const view = (b: { id: string; name: string; at: string }): BroodBody => ({ id: b.id, name: b.name, at: b.at });

export function createBrood(ctx: GameContext, player: PlayerCtl): BroodCtl {
  const figures = new Map<string, Figure>();
  const trail: Pt[] = [];
  const state = () => ctx.session.getState();

  const figure = (id: string, variant: number, at: Pt): Figure => {
    let f = figures.get(id);
    if (!f) {
      const st = state()!;
      const look = inhabitantLook(st, variant);
      f = new Figure(ctx.scene, { ...look, scale: look.scale * 0.92 }, at.x, at.y);
      f.setTint(HUES[variant % HUES.length]!);
      figures.set(id, f);
    }
    return f;
  };

  const townSpot = (townId: string, slot: number): Pt => {
    const s = ctx.world.spawnPoint(townId);
    const want = { x: s.x - TILE_PX + slot * 22, y: s.y + TILE_PX * 1.2 };
    const nav = ctx.world.nav;
    if (nav.walkableAt(want.x, want.y)) return want;
    const t = nav.tileAt(want.x, want.y);
    const ok = nav.snap(t.q, t.r, 4);
    return ok ? { x: nav.centerOf(ok.q, ok.r).x, y: nav.centerOf(ok.q, ok.r).y + TILE_PX / 2 } : s;
  };

  const variantOf = (id: string): number => Math.max(0, state()?.player.bodies?.findIndex((b) => b.id === id) ?? 0);

  return {
    active: () => { const st = state(); return !!st && isMultiBody(st.player); },
    withYou: () => { const st = state(); return st ? bodiesWithYou(st.player).map(view) : []; },
    here: () => { const st = state(); return st ? bodiesHere(st.player).map(view) : []; },
    elsewhere: () => { const st = state(); return st ? bodiesElsewhere(st.player).map(view) : []; },
    leave() {
      const st = state();
      if (!st || !isMultiBody(st.player)) return null;
      const b = leaveBodyHere(st);
      return b ? `${b.name} curls up by a warm wall. They will listen.` : null;
    },
    callBack() {
      const st = state();
      if (!st || !isMultiBody(st.player)) return null;
      const back = callBodiesBack(st);
      return back.length ? `${back.map((b) => b.name).join(' and ')} rejoin you.` : null;
    },
    switchTo(bodyId) {
      const st = state();
      if (!st || !isMultiBody(st.player)) return null;
      const name = st.player.bodies?.find((b) => b.id === bodyId)?.name;
      const town = switchToBody(st, bodyId);
      if (!town) return null;
      trail.length = 0;
      ctx.arriveAt(town);
      player.refreshLook();
      return `You are ${name ?? 'another of you'} now.`;
    },
    posOf: (id) => { const f = figures.get(id); return f?.sprite.visible ? { x: f.x, y: f.y } : undefined; },
    update(dt, timeSec) {
      const st = state();
      if (!st || !isMultiBody(st.player)) {
        for (const f of figures.values()) f.setVisible(false);
        return;
      }
      const p = player.pos();
      const last = trail[0];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 2) {
        trail.unshift({ ...p });
        if (trail.length > TRAIL_LEN) trail.length = TRAIL_LEN;
      }
      if (last && Math.hypot(last.x - p.x, last.y - p.y) > TILE_PX * 6) trail.length = 1; // teleported
      const seen = new Set<string>();
      const indoors = !!ctx.world.room();
      bodiesWithYou(st.player).slice(1).forEach((b, i) => {
        if (indoors) return;
        const at = trail[Math.min(trail.length - 1, (i + 1) * TRAIL_STEP)] ?? p;
        const f = figure(b.id, variantOf(b.id), at);
        const nx = at.x + (i % 2 ? 6 : -6), ny = at.y;
        const moving = Math.hypot(nx - f.x, ny - f.y) > 0.3;
        f.face(nx - f.x, ny - f.y);
        f.place(nx, ny);
        f.animate(dt, moving, timeSec);
        f.setVisible(true);
        seen.add(b.id);
      });
      const vr = viewRect(ctx.scene, 64);
      [...bodiesHere(st.player), ...bodiesElsewhere(st.player)].forEach((b, i) => {
        const spot = townSpot(b.at, i);
        if (!inRect(vr, spot.x, spot.y)) return;
        const f = figure(b.id, variantOf(b.id), spot);
        f.place(spot.x, spot.y);
        f.animate(dt, false, timeSec);
        f.setVisible(true);
        seen.add(b.id);
      });
      for (const [id, f] of figures) if (!seen.has(id)) f.setVisible(false);
    },
    destroy() {
      for (const f of figures.values()) f.destroy();
      figures.clear();
    },
  };
}
