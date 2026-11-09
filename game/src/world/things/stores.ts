/**
 * A town's stores, standing in the open where you can see them (civic/town-stores): the granary (an open
 * lean-to of grain sacks), the storehouse (stacked crates under a roof) and the yard (whatever did not fit,
 * logs and stone in the weather). Each heap grows and shrinks with what is in it, so a lean granary looks
 * lean: under the low-cover line its last sacks lie slumped and empty. On a day food spoiled in town, crows
 * circle over the yard. Drawn only for towns near the camera; the stand is found once per town on open
 * ground beside the plaza (nothing saved). Haulers carry their loads here (actors/haulers via storesAt).
 */
import type Phaser from 'phaser';
import { DEPOTS, GRANARY_CAPACITY, STOREHOUSE_CAPACITY, STORES, granaryFood, storesIfAny, type Depot } from '../../sim/civic/town-stores';
import { total } from '../../sim/civic/store';
import { civicIfAny } from '../../sim/civic/sites';
import { TILE_PX } from '../../sim/map/constants';
import type { TerrainAccess } from '../../sim/map/terrain-access';
import type { SimState } from '../../sim/types/runtime';
import { countVisual } from '../../dev/visual-counts';
import { ART_SCALE, makeTex, type Px } from '../art/px';
import { DECAL_DEPTH, tileFoot, type Pt } from '../depth';
import type { TownSpots } from '../town-spots';
import { townPlan } from '../../sim/map/town-plan';
import { storeSpots } from '../civic-ground';
import type { DrawnTile } from '../chunk-layer';

const T = TILE_PX;
const NEAR = T * 34;
const MAX_UNITS = 9;
/** Below this much spoiled today (units) the crows do not bother. */
const CROW_AT = 0.3;

const ART: Record<string, [number, number, (p: Px) => void]> = {
  shed: [30, 24, (p) => {
    p.shadow(15, 14, 2).rect(1, 5, 2, 19, '#6a4a2a').rect(27, 5, 2, 19, '#6a4a2a');
    for (let i = 0; i < 6; i++) p.rect(0, 2 + i, 30, 1, i % 2 ? '#8a5a32' : '#9a6a3a');
    p.rect(0, 1, 30, 1, '#b8844e').rect(3, 22, 24, 2, '#5a4a30', 0.6);
  }],
  sack: [8, 8, (p) => { p.disc(4, 5, 3.6, 2.8, '#c8a46a').rect(2, 1, 4, 2, '#b08a54').px(4, 0, '#7a5a34').rect(1, 5, 6, 1, '#a88a58'); }],
  empty: [8, 4, (p) => { p.disc(4, 2.5, 3.8, 1.4, '#a88a58').rect(1, 2, 2, 1, '#8a6a40'); }],
  crate: [9, 8, (p) => { p.rect(0, 0, 9, 8, '#9a6a3a').rect(0, 0, 9, 1, '#c8945a').rect(1, 3, 7, 1, '#6a4a2a').rect(4, 1, 1, 6, '#6a4a2a'); }],
  roof: [30, 8, (p) => { p.roof(0, 0, 30, 8, '#8a4a3a', '#a85a44'); }],
  logs: [12, 7, (p) => { for (const [x, y] of [[0, 3], [5, 3], [2, 0]] as const) p.rect(x, y, 7, 3, '#8a5a2b').rect(x, y, 7, 1, '#b8844e').rect(x + 6, y + 1, 1, 1, '#e0bf8a'); }],
  stone: [10, 6, (p) => { p.disc(3, 4, 2.6, 2, '#8e8e86').disc(7, 4, 2.6, 2, '#a3a39a').disc(5, 2, 2.2, 1.6, '#b8b8ae'); }],
  crow: [7, 4, (p) => { p.rect(0, 0, 2, 1, '#1a1a20').rect(2, 1, 3, 2, '#1a1a20').rect(5, 0, 2, 1, '#1a1a20').px(3, 3, '#1a1a20'); }],
};
const tex = (scene: Phaser.Scene, k: string): string => { const [w, h, d] = ART[k]!; return makeTex(scene, `w-store-${k}`, w, h, d); };

type Stand = { townId: string; at: Pt };
type View = { stand: Stand; objs: Phaser.GameObjects.GameObject[]; sig: string; crows: Phaser.GameObjects.Image[] };

export type StoresLayer = {
  refresh(): void;
  update(timeSec: number): void;
  /** Where a town's stores stand (the haulers' drop point), once found. */
  at(townId: string): Pt | null;
  list(): { townId: string; x: number; y: number; granary: number; storehouse: number; yard: number; lean: boolean; crows: number }[];
  setVisible(on: boolean): void;
  destroy(): void;
};

/** Units of a heap: a little shows as one, a full store as MAX_UNITS (square root, so small stocks still read). */
const units = (have: number, cap: number): number => (have <= 0.5 ? 0 : Math.max(1, Math.min(MAX_UNITS, Math.round(Math.sqrt(have / Math.max(1, cap)) * MAX_UNITS))));

/** What was lost to spoilage in a town today, from the stores' log (depots `${town}:…`, site shelves `site:…`). */
export function spoiledToday(s: SimState, townId: string): number {
  const log = storesIfAny(s)?.log;
  if (!log) return 0;
  const sites = civicIfAny(s)?.sites ?? {};
  let n = 0;
  for (const e of log.entries) {
    if (e.day !== s.day || e.to !== 'sink:spoiled') continue;
    const here = e.from.startsWith(`${townId}:`) || (e.from.startsWith('site:') && sites[e.from.slice(5)]?.townId === townId);
    if (here) n += e.qty;
  }
  return n;
}

export function createStores(o: { scene: Phaser.Scene; getState: () => SimState | undefined; towns: TownSpots[]; terrain: TerrainAccess; drawn: (q: number, r: number) => DrawnTile }): StoresLayer {
  const { scene, getState } = o;
  const stands = new Map<string, Stand | null>();
  const views = new Map<string, View>();
  let visible = true;

  /** Three open tiles in a row near the plaza: not road, not water, not a prop, clear of doors and fixtures. */
  const findStand = (t: TownSpots): Stand | null => {
    const plan = townPlan(t.town);
    const off = (p: { q: number; r: number }): Pt => ({ x: t.centre.x + p.q * T, y: t.centre.y + p.r * T });
    // The civic granary and storehouse (world/civic-marks): their feet and roofs.
    const civic = Object.values(storeSpots(t)).flatMap((p) => [p, { x: p.x, y: p.y - T * 1.6 }]);
    const fixed = [t.hearth, t.board, t.signpost, t.stall, t.chest, t.well, t.grave(0), t.grave(6), ...civic, ...[...plan.gardens, ...plan.fences, ...plan.walls].map(off)];
    const doors = t.buildings.map((b) => b.door);
    const free = (q: number, r: number): boolean => {
      if (!o.terrain.passable(q, r) || o.terrain.onRoad(q, r)) return false;
      // Trees and bushes overhang their tile: keep a tile of clear ground all round.
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 2; b++) if (o.drawn(q + a, r + b).props.length) return false;
      const f = tileFoot(q, r);
      if (fixed.some((p) => Math.hypot(p.x - f.x, p.y - f.y) < T * 2.2)) return false;
      // A building stands above and around its door.
      return !doors.some((d) => Math.abs(d.x - f.x) < T * 2.6 && f.y > d.y - T * 4.2 && f.y < d.y + T * 1.2);
    };
    const h = { q: Math.floor(t.hearth.x / T), r: Math.floor((t.hearth.y - 2) / T) };
    for (let ring = 3; ring <= 9; ring++) {
      for (let dr = -ring; dr <= ring; dr++) for (const dq of [-ring, ring, ...Array.from({ length: ring * 2 - 1 }, (_, i) => i - ring + 1)]) {
        if (Math.max(Math.abs(dq), Math.abs(dr)) !== ring) continue;
        const q = h.q + dq, r = h.r + dr;
        if (free(q - 1, r) && free(q, r) && free(q + 1, r) && free(q, r - 1)) return { townId: t.town.id, at: tileFoot(q, r) };
      }
    }
    return null;
  };

  const standOf = (t: TownSpots): Stand | null => {
    // Props are only known once the town's chunks are drawn: wait for them rather than stand in a wood.
    if (!stands.has(t.town.id)) {
      if (o.drawn(Math.floor(t.hearth.x / T), Math.floor((t.hearth.y - 2) / T)).ground === undefined) return null;
      stands.set(t.town.id, findStand(t));
    }
    return stands.get(t.town.id) ?? null;
  };

  const drawView = (v: View, have: Record<Depot, number>, topYard: string[], lean: boolean): void => {
    v.objs.forEach((x) => x.destroy());
    v.objs = [];
    const { x, y } = v.stand.at;
    const img = (px: number, py: number, k: string, depth = py) => { const i = scene.add.image(px, py, tex(scene, k)).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(depth); v.objs.push(i); return i; };
    const g = scene.add.graphics().setDepth(DECAL_DEPTH);
    g.fillStyle(0x6a5a40, 0.3).fillEllipse(x, y - 4, T * 3.4, 18);
    v.objs.push(g);
    // Granary (left): the shed, its sacks inside, three to a row; lean, the last few lie empty.
    const gx = x - T;
    img(gx, y, 'shed', y - 1);
    const gn = units(have.granary, GRANARY_CAPACITY);
    for (let i = 0; i < gn; i++) img(gx - 18 + (i % 3) * 16 + (Math.floor(i / 3) % 2) * 6, y - 4 - Math.floor(i / 3) * 9, 'sack', y - 0.5 + i * 0.01);
    if (lean) for (let i = 0; i < 3 - Math.min(3, gn); i++) img(gx - 14 + i * 14, y - 3, 'empty', y - 0.6);
    // Storehouse (centre): crates in a stack under a little roof on posts.
    const cn = units(have.storehouse, STOREHOUSE_CAPACITY);
    img(x + T * 0.1, y - 50, 'roof', y - 0.2);
    for (const dx of [-26, 26]) { const post = scene.add.rectangle(x + T * 0.1 + dx, y, 3, 36, 0x6a4a2a).setOrigin(0.5, 1).setDepth(y - 0.3); v.objs.push(post); }
    for (let i = 0; i < cn; i++) img(x + T * 0.1 - 18 + (i % 3) * 18, y - Math.floor(i / 3) * 15, 'crate', y + i * 0.01);
    // Yard (right): in the weather, logs and stone by what it holds most of.
    const yn = units(have.yard, STORES.yardCapacity);
    for (let i = 0; i < yn; i++) img(x + T * 1.3 + (i % 2) * 20 - 6, y + 2 - Math.floor(i / 2) * 9, topYard[i % Math.max(1, topYard.length)] === 'stone' ? 'stone' : 'logs', y + 2 + i * 0.01);
    for (const ob of v.objs) (ob as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
  };

  const refresh = (): void => {
    const s = getState();
    const cam = scene.cameras.main.worldView;
    const seen = new Set<string>();
    if (s) for (const t of o.towns) {
      if (Math.hypot(t.centre.x - cam.centerX, t.centre.y - cam.centerY) > NEAR) continue;
      const ts = storesIfAny(s)?.towns[t.town.id];
      const stand = ts ? standOf(t) : null;
      if (!ts || !stand) continue;
      seen.add(t.town.id);
      const have = Object.fromEntries(DEPOTS.map((d) => [d, total(ts[d])])) as Record<Depot, number>;
      const need = s.villageEconomy?.towns[t.town.id]?.need.food ?? 0;
      const lean = need > 0 && granaryFood(s, t.town.id) / need < STORES.lowCoverDays;
      const topYard = Object.entries(ts.yard.items).filter(([, q]) => q > 0.5).sort((a, b) => b[1] - a[1]).map(([i]) => (/stone|ore/.test(i) ? 'stone' : 'logs'));
      const crowsWanted = spoiledToday(s, t.town.id) > CROW_AT ? 3 : 0;
      const sig = `${DEPOTS.map((d) => units(have[d], d === 'granary' ? GRANARY_CAPACITY : d === 'storehouse' ? STOREHOUSE_CAPACITY : STORES.yardCapacity)).join(',')}:${lean}:${topYard.slice(0, 2).join(',')}`;
      let v = views.get(t.town.id);
      if (!v) { v = { stand, objs: [], sig: '#', crows: [] }; views.set(t.town.id, v); }
      if (v.sig !== sig) { v.sig = sig; drawView(v, have, topYard, lean); }
      while (v.crows.length < crowsWanted) v.crows.push(scene.add.image(0, 0, tex(scene, 'crow')).setScale(ART_SCALE).setDepth(1e6).setVisible(visible));
      while (v.crows.length > crowsWanted) v.crows.pop()!.destroy();
    }
    for (const [id, v] of views) if (!seen.has(id)) { v.objs.forEach((x) => x.destroy()); v.crows.forEach((c) => c.destroy()); views.delete(id); }
  };

  return {
    refresh,
    update(timeSec) {
      let crows = 0, heaps = 0, lean = 0;
      for (const v of views.values()) {
        heaps += v.objs.length > 0 ? 1 : 0;
        if (v.sig.includes(':true:')) lean++;
        v.crows.forEach((c, i) => {
          // Lazy circles over the yard, each bird on its own beat; wings flap by squashing the sprite.
          const a = timeSec * (0.9 + i * 0.17) + i * 2.1;
          c.setPosition(v.stand.at.x + T * 1.3 + Math.cos(a) * (22 + i * 6), v.stand.at.y - 70 - i * 8 + Math.sin(a) * 10);
          c.setScale(ART_SCALE, ART_SCALE * (0.6 + Math.abs(Math.sin(timeSec * 7 + i)) * 0.6)).setFlipX(Math.sin(a) < 0);
          crows++;
        });
      }
      countVisual('storeHeaps', visible ? heaps : 0);
      countVisual('leanGranaries', visible ? lean : 0);
      countVisual('crows', visible ? crows : 0);
    },
    at: (townId) => { const t = o.towns.find((x) => x.town.id === townId); const st = t ? standOf(t) : null; return st ? { ...st.at } : null; },
    list: () => {
      const s = getState();
      return [...views.values()].map((v) => {
        const ts = s && storesIfAny(s)?.towns[v.stand.townId];
        return { townId: v.stand.townId, x: v.stand.at.x, y: v.stand.at.y, granary: ts ? Math.round(total(ts.granary)) : 0, storehouse: ts ? Math.round(total(ts.storehouse)) : 0, yard: ts ? Math.round(total(ts.yard)) : 0, lean: v.sig.includes(':true:'), crows: v.crows.length };
      });
    },
    setVisible(on) { visible = on; for (const v of views.values()) { for (const ob of v.objs) (ob as unknown as Phaser.GameObjects.Components.Visible).setVisible(on); v.crows.forEach((c) => c.setVisible(on)); } },
    destroy() { for (const v of views.values()) { v.objs.forEach((x) => x.destroy()); v.crows.forEach((c) => c.destroy()); } views.clear(); },
  };
}
