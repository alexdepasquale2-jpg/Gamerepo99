/**
 * People on the road: visitors (sim/visitors) walking between towns, drawn where the sim says they are
 * on their road and walking on as the day passes. They are people like any other: named, focusable,
 * tappable (Things of kind 'person'), with a head for bubbles. Only those inside the camera have bodies.
 */
import { firstNameOf } from '../sim/names';
import type { GameContext, Pt, Thing } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import type { LayoutRoute } from '../sim/map/world-layout';
import { roadPositionOf, roadVisitors } from '../sim/visitors';
import { countVisual } from '../dev/visual-counts';
import { Figure } from './figure';
import { headHeight, villagerLook, type PersonLook } from './looks';
import type { NameLayer } from './name-layer';
import { hash } from './paint';
import { safe } from './player';
import { footOf, inRect, viewRect } from './towns';

const REFRESH_EVERY = 0.5;
const WALK_PX = 18;

type Walker = { id: string; name: string; first: string; pl: PersonLook; x: number; y: number; to: Pt; dx: number; fig?: Figure };

export type RoadFolk = {
  update(dt: number, timeSec: number, names: NameLayer): void;
  things(near: Pt, radius: number): Thing[];
  headOf(id: string): Pt | undefined;
  /** Dev: everyone on the road. */
  list(): { id: string; name: string; x: number; y: number; drawn: boolean }[];
  destroy(): void;
};

export function createRoadFolk(ctx: GameContext): RoadFolk {
  const routes = new Map<string, LayoutRoute>(ctx.layout.routes.map((r) => [r.id, r]));
  const walkers = new Map<string, Walker>();
  let wait = 0;

  const roadPx = (routeId: string, f: number): Pt | null => {
    const r = routes.get(routeId);
    if (!r) return null;
    const p = ctx.world.nav.roadPoint(r.path, Math.max(0, Math.min(1, f)));
    return footOf(p.q, p.r);
  };

  /** Where a visitor stands now in world px (a little off the road's centre line), and which way they face. */
  const placeOf = (id: string): { p: Pt; dx: number } | null => {
    const st = ctx.session.getState();
    const rp = st ? roadPositionOf(st, id, safe(() => ctx.world.phase(), 0.5)) : undefined;
    const r = rp && routes.get(rp.routeId);
    if (!rp || !r) return null;
    const fwd = r.from === rp.from;
    const f = fwd ? rp.f : 1 - rp.f;
    const p = roadPx(rp.routeId, f), q = roadPx(rp.routeId, f + (fwd ? 0.01 : -0.01));
    if (!p || !q) return null;
    const side = ((hash(id) % 5) - 2) * 3;
    return { p: { x: p.x + side, y: p.y + side * 0.5 }, dx: q.x - p.x };
  };

  const refresh = (): void => {
    const st = ctx.session.getState();
    const live = new Set<string>();
    for (const v of st ? roadVisitors(st) : []) {
      const at = placeOf(v.id);
      if (!at) continue;
      live.add(v.id);
      let w = walkers.get(v.id);
      if (!w) {
        const person = st!.people[v.id];
        const name = person?.name ?? v.id;
        w = { id: v.id, name, first: firstNameOf(name), pl: villagerLook({ id: v.id, tags: person?.tags, age: person?.age }, 'village', ctx.seed), x: at.p.x, y: at.p.y, to: at.p, dx: at.dx };
        walkers.set(v.id, w);
      }
      // A big jump (a new day, a load) is a teleport, not a walk.
      if (Math.hypot(at.p.x - w.x, at.p.y - w.y) > TILE_PX * 6) { w.x = at.p.x; w.y = at.p.y; }
      w.to = at.p;
      if (Math.abs(at.dx) > 0.2) w.dx = at.dx;
    }
    for (const [id, w] of walkers) if (!live.has(id)) { w.fig?.destroy(); walkers.delete(id); }
  };

  const off = ctx.events.on('state-replaced', () => { for (const w of walkers.values()) w.fig?.destroy(); walkers.clear(); wait = 0; });

  return {
    update(dt, timeSec, names) {
      wait -= dt;
      if (wait <= 0) { wait = REFRESH_EVERY; refresh(); }
      const indoors = !!safe(() => ctx.world.room(), null);
      const vr = viewRect(ctx.scene, 96);
      const lr = viewRect(ctx.scene, 8);
      const focus = safe(() => ctx.interact.focus()?.key, undefined);
      for (const w of walkers.values()) {
        // Out of sight they keep pace with the road exactly; in sight they walk there.
        if (indoors || !inRect(vr, w.x, w.y)) { w.fig?.destroy(); w.fig = undefined; w.x = w.to.x; w.y = w.to.y; continue; }
        if (!w.fig) w.fig = new Figure(ctx.scene, w.pl, w.x, w.y);
        const dx = w.to.x - w.x, dy = w.to.y - w.y, d = Math.hypot(dx, dy);
        const moving = d > 1;
        if (moving) {
          // A long road in one day is a brisk walk: never fall behind where the sim says they are.
          const step = Math.min(d, Math.max(WALK_PX * w.pl.speed, d * 1.5) * dt);
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
          w.fig.face(dx, dy);
        } else w.fig.face(w.dx, 0);
        w.fig.place(w.x, w.y);
        w.fig.animate(dt, moving, timeSec);
        if (inRect(lr, w.x, w.y) && focus !== `person:${w.id}`) {
          names.put(`r:${w.id}`, w.x, w.y - headHeight(w.pl.scale) - 1, { text: w.first, alpha: 0.85, muted: true });
        }
      }
      let drawn = 0;
      for (const w of walkers.values()) if (w.fig) drawn++;
      countVisual('roadFolk', drawn);
    },
    things(near, radius) {
      const out: Thing[] = [];
      for (const w of walkers.values()) {
        if (!w.fig || Math.hypot(w.x - near.x, w.y - near.y) > radius) continue;
        out.push({ key: `person:${w.id}`, kind: 'person', id: w.id, x: w.x, y: w.y, label: w.first, target: { kind: 'person', id: w.id }, reach: 48 });
      }
      return out;
    },
    headOf(id) {
      const w = walkers.get(id);
      return w ? { x: w.x, y: w.y - headHeight(w.pl.scale) } : undefined;
    },
    list: () => [...walkers.values()].map((w) => ({ id: w.id, name: w.name, x: Math.round(w.x), y: Math.round(w.y), drawn: !!w.fig })),
    destroy() {
      off();
      for (const w of walkers.values()) w.fig?.destroy();
      walkers.clear();
    },
  };
}
