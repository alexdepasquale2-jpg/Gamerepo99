/**
 * Haulers at work (civic/hauling, Site.haulers): in working hours a site's hauler walks between the site and
 * the town's stores (world/things/stores via WorldApi.storesAt), the site's biggest output on their head on
 * the way in, an input (or empty hands) on the way back — the dawn's haul made visible as it happens through
 * the day. The hauler is the real villager (people.ts walks them; folk.scheduleSpot asks haulSpot first).
 * Render-side only: reads the sites, never writes.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt } from '../app/contracts';
import { haulersAt } from '../sim/civic/hauling';
import { STORES } from '../sim/civic/town-stores';
import { SITE_KIND_BY_ID, sitesIn, type Site } from '../sim/civic/sites';
import { total } from '../sim/civic/store';
import { claimRect } from '../sim/economy/borders';
import type { Claim } from '../sim/economy/build-plans';
import type { LayoutRoute, MapPoint } from '../sim/map/world-layout';
import { loadRow } from '../sim/carry';
import { TILE_PX } from '../sim/map/constants';
import { placeAt } from '../sim/map/residency';
import { countVisual } from '../dev/visual-counts';
import { hash } from './paint';

/** One round trip (s): long enough to walk a town's width and back. */
const TRIP_S = 32;
/** Beyond this from the town's stores a site is out on the road: its haulers walk the route, not the streets. */
const FAR_PX = TILE_PX * 40;
/** A far site this close (tiles) to one of its town's routes is served along that road. */
const ROUTE_REACH_TILES = 8;
/** Pace of a laden walker on the road (px/s): with the distance it sets how long a far round trip takes. */
const ROAD_PACE_PX = 26;

export type HaulRole = { site: Pt; store: Pt; siteName: string; out?: string; back?: string };

/** Where a site's goods leave from: the front of its plot (same corner as its work spot, sim/tasks). */
function siteFront(ctx: GameContext, s: Site): Pt | null {
  const st = ctx.session.getState();
  if (!st || !s.plot) return null;
  if ('dx' in s.plot) {
    const r = claimRect(st, { townId: s.townId, ...s.plot } as unknown as Claim);
    return r ? { x: r.q1 * TILE_PX - TILE_PX * 1.6, y: r.r1 * TILE_PX + 4 } : null;
  }
  return { x: s.plot.q * TILE_PX + TILE_PX * 0.5, y: s.plot.r * TILE_PX + TILE_PX * 1.5 };
}

const biggest = (s: Site, inputs: boolean): string | undefined => {
  const ins = new Set(SITE_KIND_BY_ID.get(s.kind)?.inputs ?? []);
  return Object.keys(s.store.items).filter((i) => ins.has(i) === inputs && total(s.store, i) >= 1).sort((a, z) => total(s.store, z) - total(s.store, a) || a.localeCompare(z))[0];
};

const backLoad = (s: Site): string | undefined => biggest(s, true) ?? (SITE_KIND_BY_ID.get(s.kind)?.inputs ?? [])[0];
/** An input the site is short of (under the shelf keep the haul tops up): there is something to bring out. */
const shortOf = (s: Site): string | undefined => (SITE_KIND_BY_ID.get(s.kind)?.inputs ?? []).find((i) => total(s.store, i) < STORES.inputKeep);

/** The one near/far rule for both kinds of hauler: past FAR_PX of the town's stores a site is out on the road. */
const isFar = (front: Pt, anchor: Pt): boolean => Math.hypot(front.x - anchor.x, front.y - anchor.y) > FAR_PX;

/** Every hauler in a town now, with their trip (read once a second at most by the folk). */
export function haulRoles(ctx: GameContext, townId: string): Map<string, HaulRole> {
  const out = new Map<string, HaulRole>();
  const st = ctx.session.getState();
  const store = ctx.world.storesAt?.(townId);
  if (!st || !store) return out;
  for (const s of sitesIn(st, townId)) {
    if (s.status !== 'working' || !s.store) continue;
    const front = siteFront(ctx, s);
    // A far site's haulers are road travellers (farHaulTrips), not a walk across the streets.
    if (!front || isFar(front, store)) continue;
    const role: HaulRole = { site: front, store, siteName: s.name, out: biggest(s, false), back: backLoad(s) };
    for (const id of haulersAt(st, s)) out.set(id, role);
  }
  return out;
}

/**
 * A far site's hauler on the road: the route (tile polyline) and the two ends of their walk along it as
 * fractions of its length — the point nearest the town and the point nearest the site.
 */
export type FarHaulTrip = { id: string; townId: string; siteName: string; path: MapPoint[]; fTown: number; fSite: number; tripS: number; out?: string; back?: string };

/** Nearest point of a tile polyline to a tile spot, as a fraction of its length; how far off it is and the length (tiles). */
export function nearestAlong(path: readonly MapPoint[], at: MapPoint): { f: number; off: number; len: number } {
  let len = 0, best = { along: 0, off: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const dq = b.q - a.q, dr = b.r - a.r, seg = Math.hypot(dq, dr);
    const t = seg ? Math.max(0, Math.min(1, ((at.q - a.q) * dq + (at.r - a.r) * dr) / (seg * seg))) : 0;
    const off = Math.hypot(a.q + dq * t - at.q, a.r + dr * t - at.r);
    if (off < best.off) best = { along: len + seg * t, off };
    len += seg;
  }
  return { f: len ? best.along / len : 0, off: best.off, len };
}

type RouteFit = { path: MapPoint[]; fTown: number; fSite: number; tripS: number };
/** Which route serves a far site, per layout: sites and routes do not move, so it is worked out once. */
const fits = new WeakMap<readonly LayoutRoute[], Map<string, RouteFit | null>>();

function routeFit(routes: readonly LayoutRoute[], town: MapPoint & { id: string }, siteKey: string, front: Pt): RouteFit | null {
  let byKey = fits.get(routes);
  if (!byKey) fits.set(routes, (byKey = new Map()));
  if (byKey.has(siteKey)) return byKey.get(siteKey)!;
  const spot = { q: (front.x - TILE_PX / 2) / TILE_PX, r: (front.y - TILE_PX) / TILE_PX };
  let best: { r: LayoutRoute; f: number; off: number; len: number } | null = null;
  for (const r of routes) {
    if (r.from !== town.id && r.to !== town.id) continue;
    const n = nearestAlong(r.path, spot);
    if (n.off <= ROUTE_REACH_TILES && (!best || n.off < best.off)) best = { r, ...n };
  }
  let fit: RouteFit | null = null;
  if (best) {
    const fTown = nearestAlong(best.r.path, town).f;
    fit = { path: best.r.path, fTown, fSite: best.f, tripS: Math.max(TRIP_S, (2 * Math.abs(best.f - fTown) * best.len * TILE_PX) / ROAD_PACE_PX) };
  }
  byKey.set(siteKey, fit);
  return fit;
}

/**
 * Haulers of a town's far working sites (beyond FAR_PX of its stores — on the default world the road
 * facilities, the only sites working in the first weeks), each on the town route passing nearest their site.
 * A site with no hired hauler is hauled by its manager (civic/hauling: selfHaul), so the manager walks the
 * road. A site with no route of its town within reach shows no road traveller (there is no road to walk).
 * Until the town's stores are found (its streets not yet drawn) the town centre stands in for them.
 */
export function farHaulTrips(ctx: GameContext, townId: string, routes: readonly LayoutRoute[]): FarHaulTrip[] {
  const st = ctx.session.getState();
  const town = ctx.layout.settlements.find((t) => t.id === townId);
  if (!st || !town) return [];
  const anchor = ctx.world.storesAt?.(townId) ?? { x: town.q * TILE_PX + TILE_PX / 2, y: town.r * TILE_PX + TILE_PX };
  const out: FarHaulTrip[] = [];
  for (const s of sitesIn(st, townId)) {
    if (s.status !== 'working' || !s.store) continue;
    const front = siteFront(ctx, s);
    if (!front || !isFar(front, anchor)) continue;
    const hired = haulersAt(st, s);
    const ids = hired.length ? hired : s.managerId ? [s.managerId] : [];
    // Nothing on the shelves to take in and no input running short: no trip to make today.
    const load = biggest(s, false), short = shortOf(s);
    if (!ids.length || (!load && !short)) continue;
    const fit = routeFit(routes, town, `${townId}|${s.id}|${Math.round(front.x)},${Math.round(front.y)}`, front);
    if (!fit) continue;
    for (const id of ids) out.push({ id, townId, siteName: s.name, ...fit, out: load, back: short ? biggest(s, true) ?? short : undefined });
  }
  return out;
}

/**
 * Where along the road a far hauler is now (fraction of the route) and which leg: laden with the site's
 * output on the way in, an input on the way back. Each hauler keeps their own offset in the round trip.
 */
export function farHaulAt(trip: FarHaulTrip, nowSec: number): { f: number; leg: 'in' | 'back' } {
  const u = ((nowSec / trip.tripS + (hash(trip.id) % 1000) / 1000) % 1 + 1) % 1;
  return u < 0.5
    ? { f: trip.fSite + (trip.fTown - trip.fSite) * u * 2, leg: 'in' }
    : { f: trip.fTown + (trip.fSite - trip.fTown) * (u - 0.5) * 2, leg: 'back' };
}

/** Which way a hauler is walking now: to the stores (laden with output) or back to the site. */
export const haulLeg = (id: string, nowSec: number): 'in' | 'back' => ((nowSec + (hash(id) % TRIP_S)) % TRIP_S < TRIP_S / 2 ? 'in' : 'back');

/** The spot a hauler aims for in working hours (null: not a hauler, or not working hours). */
export function haulAim(role: HaulRole | undefined, id: string, phase: number): Pt | null {
  if (!role || placeAt(phase) !== 'work') return null;
  const at = haulLeg(id, performance.now() / 1000) === 'in' ? role.store : role.site;
  const side = hash(id) % 2 ? 1 : -1;
  return { x: at.x + side * TILE_PX * 0.6, y: at.y + 6 };
}

/** The loads over haulers' heads, pooled per person. */
export type HaulLoads = { begin(): void; put(id: string, head: Pt, foot: number, item: string | undefined): void; end(): void; destroy(): void };

/** `counter`: the dev/visual-counts name this pool reports under (the street haulers, or the road ones). */
export function createHaulLoads(scene: Phaser.Scene, counter = 'haulers'): HaulLoads {
  const imgs = new Map<string, { img: Phaser.GameObjects.Image; seen: boolean; key: string }>();
  let shown = 0;
  const texFor = (item: string): string | null => {
    const k = `carry-${loadRow(item)?.shape ?? (/grain|flour|bread|wheat|meal/.test(item) ? 'sack' : 'crate')}`;
    return scene.textures.exists(k) ? k : scene.textures.exists('carry-crate') ? 'carry-crate' : null;
  };
  return {
    begin() { shown = 0; for (const v of imgs.values()) v.seen = false; },
    put(id, head, foot, item) {
      if (!item) return;
      const key = texFor(item);
      if (!key) return;
      let v = imgs.get(id);
      if (!v || v.key !== key) { v?.img.destroy(); v = { img: scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(2), seen: true, key }; imgs.set(id, v); }
      v.seen = true;
      v.img.setPosition(head.x, head.y + 4).setDepth(foot + 0.5).setVisible(true);
      shown++;
    },
    end() {
      for (const [id, v] of imgs) if (!v.seen) { v.img.destroy(); imgs.delete(id); }
      countVisual(counter, shown);
    },
    destroy() { for (const v of imgs.values()) v.img.destroy(); imgs.clear(); },
  };
}
