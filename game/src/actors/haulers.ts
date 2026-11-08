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
import { SITE_KIND_BY_ID, sitesIn, type Site } from '../sim/civic/sites';
import { total } from '../sim/civic/store';
import { claimRect } from '../sim/economy/borders';
import type { Claim } from '../sim/economy/build-plans';
import { loadRow } from '../sim/carry';
import { TILE_PX } from '../sim/map/constants';
import { placeAt } from '../sim/map/residency';
import { countVisual } from '../dev/visual-counts';
import { hash } from './paint';

/** One round trip (s): long enough to walk a town's width and back. */
const TRIP_S = 32;

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

/** Every hauler in a town now, with their trip (read once a second at most by the folk). */
export function haulRoles(ctx: GameContext, townId: string): Map<string, HaulRole> {
  const out = new Map<string, HaulRole>();
  const st = ctx.session.getState();
  const store = ctx.world.storesAt?.(townId);
  if (!st || !store) return out;
  for (const s of sitesIn(st, townId)) {
    if (s.status !== 'working' || !s.store) continue;
    const front = siteFront(ctx, s);
    if (!front || Math.hypot(front.x - store.x, front.y - store.y) > TILE_PX * 40) continue;
    const role: HaulRole = { site: front, store, siteName: s.name, out: biggest(s, false), back: biggest(s, true) ?? (SITE_KIND_BY_ID.get(s.kind)?.inputs ?? [])[0] };
    for (const id of haulersAt(st, s)) out.set(id, role);
  }
  return out;
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

export function createHaulLoads(scene: Phaser.Scene): HaulLoads {
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
      countVisual('haulers', shown);
    },
    destroy() { for (const v of imgs.values()) v.img.destroy(); imgs.clear(); },
  };
}
