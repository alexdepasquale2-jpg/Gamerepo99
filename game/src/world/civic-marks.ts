/**
 * What a town's civic life looks like from the street, so the tables are felt by walking:
 *   stores   the common granary and storehouse every town keeps (sites.json), with sacks / crates in
 *            front for how full each is (civic/town-stores);
 *   tier     a pole by the signpost flying one pennant per tier above hamlet (zones.json tiers);
 *   zones    a stake with the zone's colour and emblem at the heart of each of the 16 lots (zoning);
 *   quarrels while the district is at war a levy poster by the noticeboard and a war banner by the
 *            hearth; under a trade pact a gold ribbon (civic/district-relations).
 * Reads the sim only (never writes). Redrawn when a town's signature changes.
 */
import type Phaser from 'phaser';
import { TILE_PX } from '../sim/map/constants';
import type { SimState } from '../sim/types/runtime';
import { GRANARY_CAPACITY, STOREHOUSE_CAPACITY, storesIfAny } from '../sim/civic/town-stores';
import { total } from '../sim/civic/store';
import { residentsOf, tierIndex, tierOf } from '../sim/civic/tiers';
import { LOTS, zoneOfLot } from '../sim/civic/zoning';
import { liveId, polityIfAny } from '../sim/civic/district-relations';
import { CELL_TILES, stakePlan } from '../sim/economy/build-plans';
import { ART_SCALE } from './art/px';
import { civicMarkTex, paintCivicTextures } from './art/civic-art';
import type { TownSpots } from './town-spots';
import type { Pt } from './depth';
import type { GameContext } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';

const FILL_MAX = 6;
const PENNANT = ['', 'pennant-village', 'pennant-town', 'pennant-city'];
/** Each lot's stake stands mid-band: inner rings centre 7 cells out, outer 10 (innerMaxRing 8, maxRing 11). */
const RING = { inner: 7, outer: 10 };

export type CivicMarksLook = { townId: string; granary: number; storehouse: number; tier: string; zones: string[]; war: boolean; pact: boolean };
type View = { look: CivicMarksLook; sig: string; objs: Phaser.GameObjects.GameObject[] };

export type CivicMarks = {
  refresh(state: SimState | undefined): void;
  list(): CivicMarksLook[];
  setVisible(on: boolean): void;
  destroy(): void;
};

const storeFill = (state: SimState, townId: string, depot: 'granary' | 'storehouse'): number => {
  const s = storesIfAny(state)?.towns[townId]?.[depot];
  if (!s) return 0;
  const n = Object.keys(s.items).reduce((m, i) => m + total(s, i), 0);
  return Math.min(1, n / Math.max(1, depot === 'granary' ? GRANARY_CAPACITY : STOREHOUSE_CAPACITY));
};

/** The live district's quarrels: at war with any neighbour, under a pact with any. */
function quarrels(state: SimState): { war: boolean; pact: boolean } {
  const rel = polityIfAny(state)?.relations;
  if (!rel) return { war: false, pact: false };
  const live = liveId(state);
  const mine = Object.values(rel).filter((r) => r.a === live || r.b === live);
  return { war: mine.some((r) => r.state === 'war'), pact: mine.some((r) => r.state === 'pact') };
}

function lookOf(state: SimState, townId: string, q: { war: boolean; pact: boolean }): CivicMarksLook {
  return {
    townId,
    granary: storeFill(state, townId, 'granary'),
    storehouse: storeFill(state, townId, 'storehouse'),
    tier: tierOf(state, townId).id,
    zones: Array.from({ length: LOTS }, (_, i) => zoneOfLot(state, townId, i)),
    ...q,
  };
}

/** The tile offset (from the town centre) of lot i's stake: its sector's compass line at the band's ring. */
function lotStake(i: number): { dq: number; dr: number } {
  const a = ((i % 8) * Math.PI) / 4;
  const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
  const ring = i < 8 ? RING.inner : RING.outer;
  return { dq: (Math.round((ring * c) / m) + 0.5) * CELL_TILES, dr: (Math.round((ring * s) / m) + 0.5) * CELL_TILES };
}

export function createCivicMarks(scene: Phaser.Scene, towns: TownSpots[]): CivicMarks {
  paintCivicTextures(scene);
  const views = new Map<string, View>();
  let visible = true;

  const draw = (spots: TownSpots, look: CivicMarksLook): Phaser.GameObjects.GameObject[] => {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const img = (p: Pt, key: string, bias = 0): Phaser.GameObjects.Image => {
      const o = scene.add.image(p.x, p.y, civicMarkTex(key)).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(p.y + bias);
      objs.push(o);
      return o;
    };
    const up = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });
    // Stores: the granary behind the signpost, the storehouse behind the noticeboard, goods out front.
    const gran = up(spots.signpost, 0, -TILE_PX * 2.3), house = up(spots.board, 0, -TILE_PX * 2.3);
    img(gran, 'store-granary');
    img(house, 'store-house');
    const pile = (at: Pt, key: string, frac: number) => {
      const n = Math.ceil(frac * FILL_MAX);
      for (let k = 0; k < n; k++) img(up(at, -24 + (k % 3) * 14 + (k >= 3 ? 7 : 0), 6 - (k >= 3 ? 7 : 0)), key, 0.2 + k * 0.01);
    };
    pile(gran, 'sack', look.granary);
    pile(house, 'crate', look.storehouse);
    // Tier: a pole by the signpost, one pennant per tier above hamlet.
    const t = tierIndex(look.tier);
    if (t > 0) {
      // Left of the signpost (the town's goods pile on its right), drawn at the pole's foot depth.
      const pole = up(spots.signpost, -44, 4);
      img(pole, 'tier-pole');
      // Pennants fly from the top of the pole down, the newest (grandest) highest; origin at their hoist.
      for (let k = 0; k < t; k++) img(up(pole, 2, -40 + (t - 1 - k) * 15), PENNANT[k + 1]!).setOrigin(0, 1).setDepth(pole.y + 0.2);
    }
    // Zones: a stake at each lot's heart.
    look.zones.forEach((z, i) => {
      const o = lotStake(i);
      // A little larger than the art scale: a stake has to be seen from across the lot.
      img({ x: spots.centre.x + o.dq * TILE_PX, y: spots.centre.y + o.dr * TILE_PX }, `zone-${z}`).setScale(ART_SCALE * 1.5);
    });
    // The district's quarrels, where the town reads its news.
    if (look.war) { img(up(spots.board, 40, 2), 'levy-poster'); img(up(spots.hearth, -34, 0), 'war-banner'); }
    if (look.pact) img(up(spots.hearth, 34, 0), 'pact-ribbon');
    for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    return objs;
  };

  return {
    refresh(state) {
      if (!state) return;
      const q = quarrels(state);
      for (const spots of towns) {
        const id = spots.town.id;
        if (!state.towns?.[id]) continue;
        const look = lookOf(state, id, q);
        const sig = `${Math.ceil(look.granary * FILL_MAX)}|${Math.ceil(look.storehouse * FILL_MAX)}|${look.tier}|${look.zones.join(',')}|${look.war}|${look.pact}`;
        const cur = views.get(id);
        if (cur?.sig === sig) { cur.look = look; continue; }
        cur?.objs.forEach((o) => o.destroy());
        views.set(id, { look, sig, objs: draw(spots, look) });
      }
    },
    list: () => [...views.values()].map((v) => v.look),
    setVisible(on) { visible = on; for (const v of views.values()) for (const o of v.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on); },
    destroy() { for (const v of views.values()) v.objs.forEach((o) => o.destroy()); views.clear(); },
  };
}

/** Per-run layer (world/index sets it) for the QA hook: what each town's marks show now. */
export const civicMarksOf = new WeakMap<GameContext, CivicMarks>();
registerDevHook('civicMarks', (ctx) => () => civicMarksOf.get(ctx)?.list());

/**
 * QA: raise a finished building of `kind` in a town (its first resident owns it), or set every relation of
 * the live district to `war` / `pact` / `peace`, then redraw — so each look can be seen without waiting years.
 */
registerDevHook('civicForce', (ctx) => ({
  raise(kind: string, townId?: string) {
    const s = ctx.session.getState();
    const town = townId ?? s?.player.townId;
    const owner = s && town ? residentsOf(s, town)[0] : undefined;
    const got = s && town && owner ? stakePlan(s, owner, town, kind, { built: true, founding: true }) : null;
    ctx.world.refresh('all');
    return got ? { claimId: got.claim.id, dx: got.claim.dx, dy: got.claim.dy } : null;
  },
  relations(state: 'war' | 'pact' | 'peace') {
    const s = ctx.session.getState();
    const rel = s ? polityIfAny(s)?.relations : undefined;
    if (!s || !rel) return 0;
    const live = liveId(s);
    let n = 0;
    for (const r of Object.values(rel)) if (r.a === live || r.b === live) { r.state = state; if (state === 'war') r.warEnds = s.day + 30; n++; }
    ctx.world.refresh('all');
    return n;
  },
}));
