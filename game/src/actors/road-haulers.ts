/**
 * Haulers of far sites on the road (actors/haulers farHaulTrips): a site out past the town's streets — on the
 * default world the road facilities, the only sites working in the first weeks — still sends its haul in, so
 * in working hours its haulers walk the route between the site and the town, the site's output on their head
 * on the way in, an input on the way back (the same load art as the street haulers). Render-side only; only
 * walkers inside the camera have bodies. A hauler already drawn in their own town's streets is not drawn
 * twice, and none is drawn inside a town's box (the streets are the people layer's).
 */
import type { GameContext, Pt } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { firstNameOf } from '../sim/names';
import { placeAt } from '../sim/map/residency';
import type { LayoutRoute } from '../sim/map/world-layout';
import { Figure } from './figure';
import { createHaulLoads, farHaulAt, farHaulTrips, type FarHaulTrip } from './haulers';
import { headHeight, villagerLook, type PersonLook } from './looks';
import type { NameLayer } from './name-layer';
import { hash } from './paint';
import { safe } from './player';
import { footOf, inRect, viewRect } from './towns';

/** Trips are re-read this often (s): sites, haulers and stock change at dawn, not by the frame. */
const REFRESH_S = 1;

type Walker = { trip: FarHaulTrip; first: string; pl: PersonLook; fig?: Figure; x: number; y: number };

export type RoadHaulers = { update(dt: number, timeSec: number, names: NameLayer): void; destroy(): void };

const lists = new WeakMap<GameContext, () => { id: string; site: string; x: number; y: number; drawn: boolean }[]>();

/** `drawnInTown`: ids the people layer has on screen now (asked only when a road hauler is in view). */
export function createRoadHaulers(ctx: GameContext, drawnInTown: () => Set<string>): RoadHaulers {
  const routes: readonly LayoutRoute[] = ctx.layout.routes;
  const walkers = new Map<string, Walker>();
  const loads = createHaulLoads(ctx.scene, 'roadHaulers');
  let wait = 0;

  const refresh = (): void => {
    const st = ctx.session.getState();
    const live = new Set<string>();
    for (const town of st ? ctx.layout.settlements : []) for (const trip of farHaulTrips(ctx, town.id, routes)) {
      live.add(trip.id);
      const w = walkers.get(trip.id);
      if (w) { w.trip = trip; continue; }
      const p = st!.people[trip.id];
      walkers.set(trip.id, { trip, first: firstNameOf(p?.name ?? trip.id), pl: villagerLook({ id: trip.id, tags: p?.tags, age: p?.age }, town.kind ?? 'village', ctx.seed), x: 0, y: 0 });
    }
    for (const [id, w] of walkers) if (!live.has(id)) { w.fig?.destroy(); walkers.delete(id); }
  };

  /** Road point at fraction f, a little off the centre line (each hauler keeps a side). */
  const roadAt = (w: Walker, f: number): Pt => {
    const m = ctx.world.nav.roadPoint(w.trip.path, Math.max(0, Math.min(1, f)));
    const p = footOf(m.q, m.r), side = ((hash(w.trip.id) % 5) - 2) * 3;
    return { x: p.x + side, y: p.y + side * 0.5 };
  };
  // Who the streets show is re-read twice a second at most, and only while a road hauler is in view.
  let shownAt = -1e9, shown = new Set<string>();
  const drawnNow = (now: number): Set<string> => {
    if (now - shownAt > 0.5) { shown = drawnInTown(); shownAt = now; }
    return shown;
  };

  const off = ctx.events.on('state-replaced', () => { for (const w of walkers.values()) w.fig?.destroy(); walkers.clear(); wait = 0; });
  lists.set(ctx, () => [...walkers.values()].map((w) => ({ id: w.trip.id, site: w.trip.siteName, x: Math.round(w.x), y: Math.round(w.y), drawn: !!w.fig })));

  return {
    update(dt, timeSec, names) {
      wait -= dt;
      if (wait <= 0) { wait = REFRESH_S; refresh(); }
      const working = placeAt(safe(() => ctx.world.phase(), 0.5)) === 'work';
      const indoors = !!safe(() => ctx.world.room(), null);
      const vr = viewRect(ctx.scene, 96);
      const lr = viewRect(ctx.scene, 8);
      const now = performance.now() / 1000;
      loads.begin();
      for (const w of walkers.values()) {
        const { f, leg } = farHaulAt(w.trip, now);
        const p = roadAt(w, f);
        w.x = p.x; w.y = p.y;
        const show = working && !indoors && inRect(vr, w.x, w.y) && !safe(() => ctx.world.townAt(p), null) && !drawnNow(now).has(w.trip.id);
        if (!show) { w.fig?.destroy(); w.fig = undefined; continue; }
        if (!w.fig) w.fig = new Figure(ctx.scene, w.pl, w.x, w.y);
        // Face the way the leg runs along the road (toward the town on the way in).
        const toward = leg === 'in' ? w.trip.fTown : w.trip.fSite;
        const ahead = roadAt(w, f + Math.sign(toward - f) * 0.01);
        w.fig.face(ahead.x - w.x, ahead.y - w.y);
        w.fig.place(w.x, w.y);
        w.fig.animate(dt, true, timeSec);
        const head = { x: w.x, y: w.y - headHeight(w.pl.scale) };
        // Output on the way in, the input running short on the way back: empty-handed on a leg with neither.
        const item = leg === 'in' ? w.trip.out : w.trip.back;
        loads.put(w.trip.id, head, w.y, item);
        // The name rides above the load, not across it.
        if (inRect(lr, w.x, w.y)) names.put(`rh:${w.trip.id}`, w.x, head.y - (item ? 14 : 1), { text: w.first, alpha: 0.85, muted: true });
      }
      loads.end();
    },
    destroy() {
      off();
      lists.delete(ctx);
      loads.destroy();
      for (const w of walkers.values()) w.fig?.destroy();
      walkers.clear();
    },
  };
}

/** Dev: every far-site hauler on the road now, where they are and whether they are drawn. */
registerDevHook('roadHaulers', (ctx) => () => lists.get(ctx)?.() ?? []);
