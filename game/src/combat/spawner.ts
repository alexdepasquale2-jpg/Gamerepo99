/**
 * Who comes out of the wilds around you. The cells near you each may hold today's pack (sim/hero/spawns
 * packFor); a pack is brought to life when you come within sight of its den spot and let go when you are
 * far away (unhurt, it is there again later today; killed to the last, the cell is cleared). Lairs stand
 * off the roads with a mark you can see (a camp, a rift, a den); come close to an awake one and its boss
 * and guard rise. Packs never stand in a town, and nothing spawns inside one.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt } from '../app/contracts';
import { addStrip, ART_SCALE } from '../actors/looks';
import { tentStrip } from '../actors/draw-works';
import { footOf } from '../actors/towns';
import { foeRow, type Family } from '../sim/hero/data';
import { clearCell, clearLair } from '../sim/hero/deeds';
import { CELL_PX, hostileTowns, lairAwake, lairPack, lairSites, packFor, type LairSite, type Pack } from '../sim/hero/spawns';
import { deriveRng } from '../sim/rng';
import { Foe } from './foe';

const WAKE_PX = 640;
const SLEEP_PX = 1500;
const LAIR_WAKE_PX = 560;

type Live = { pack: Pack; foes: Foe[]; lair?: LairSite & { at: Pt }; anchor: Pt; nearTown?: string; rivalTown?: string };
type Mark = { site: LairSite & { at: Pt }; objs: Phaser.GameObjects.GameObject[] };

export type Spawner = {
  update(hero: Pt): void;
  /** The pack a foe belongs to (its town context for the kill). */
  contextOf(f: Foe): { nearTown?: string; rivalTown?: string };
  /** Call after deaths: clears packs whose foes are all gone. Returns lairs cleared now. */
  settle(): { site: LairSite; coin: number; gearName: string; at: Pt }[];
  lairs(): (LairSite & { at: Pt; awake: boolean })[];
  clear(): void;
};

export function createSpawner(ctx: GameContext, foes: Foe[]): Spawner {
  const scene = ctx.scene;
  const live = new Map<string, Live>();
  const marks = new Map<string, Mark>();
  const towns = ctx.layout.settlements.map((s) => ({ id: s.id, ...footOf(s.q, s.r) }));
  const roadPts: Pt[] = [];
  for (const r of ctx.layout.routes) for (let i = 0; i < r.path.length; i += 3) roadPts.push(footOf(r.path[i]!.q, r.path[i]!.r));
  let sites: (LairSite & { at: Pt })[] | null = null;

  const st = () => ctx.session.getState();
  const nearestTown = (p: Pt): { id: string; d: number } | null => {
    let best: { id: string; d: number } | null = null;
    for (const t of towns) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (!best || d < best.d) best = { id: t.id, d }; }
    return best;
  };
  const nearRoad = (p: Pt): boolean => roadPts.some((q) => Math.abs(q.x - p.x) < 220 && Math.abs(q.y - p.y) < 220);
  const okGround = (p: Pt): boolean => ctx.world.passable(p) && !ctx.world.townAt(p);

  /** A cell's den spot: a seeded point in the cell on open ground, or none. */
  const anchorOf = (cx: number, cy: number): Pt | null => {
    const rng = deriveRng(ctx.seed, 'den', cx, cy);
    for (let i = 0; i < 6; i++) {
      const p = { x: (cx + 0.15 + rng.next() * 0.7) * CELL_PX, y: (cy + 0.15 + rng.next() * 0.7) * CELL_PX };
      if (okGround(p)) return p;
    }
    return null;
  };

  const spawn = (pack: Pack, anchor: Pt, lair?: LairSite & { at: Pt }): void => {
    const s = st();
    if (!s) return;
    const near = nearestTown(anchor);
    const hostile = hostileTowns(s);
    const rivalTown = pack.family === 'rival' ? [...hostile].sort((a, b) => dist(a) - dist(b))[0] : undefined;
    function dist(id: string): number { const t = towns.find((x) => x.id === id); return t ? Math.hypot(t.x - anchor.x, t.y - anchor.y) : Infinity; }
    const list: Foe[] = [];
    pack.members.forEach((m, i) => {
      const row = foeRow(m.id);
      if (!row) return;
      const a = (i / pack.members.length) * Math.PI * 2;
      let p = { x: anchor.x + Math.cos(a) * (i ? 46 : 0), y: anchor.y + Math.sin(a) * (i ? 30 : 0) };
      if (!okGround(p)) p = anchor;
      const f = new Foe(ctx, row, m.level, p, pack.key, i);
      list.push(f);
      foes.push(f);
    });
    live.set(pack.key, { pack, foes: list, ...(lair ? { lair } : {}), anchor, ...(near && near.d < 2400 ? { nearTown: near.id } : {}), ...(rivalTown ? { rivalTown } : {}) });
  };

  const despawn = (key: string): void => {
    const l = live.get(key);
    if (!l) return;
    for (const f of l.foes) if (!f.dead) { f.destroy(); f.dead = true; }
    live.delete(key);
  };

  const siteList = (): (LairSite & { at: Pt })[] => {
    const s = st();
    if (!s) return [];
    if (sites) return sites;
    sites = [];
    for (const site of lairSites(s, ctx.layout.routes.map((r) => r.id))) {
      const r = ctx.layout.routes.find((x) => x.id === site.routeId)!;
      const m = ctx.world.nav.roadPoint(r.path, site.f), n = ctx.world.nav.roadPoint(r.path, Math.min(1, site.f + 0.02));
      const p = footOf(m.q, m.r), q = footOf(n.q, n.r);
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.max(1, Math.hypot(dx, dy));
      let at: Pt | null = null;
      for (const off of [300, 360, 240, 420, 200]) {
        const c = { x: p.x + (-dy / d) * off * site.side, y: p.y + (dx / d) * off * site.side };
        if (okGround(c)) { at = c; break; }
      }
      if (at) sites.push({ ...site, at });
    }
    return sites;
  };

  const drawMark = (site: LairSite & { at: Pt }): Mark => {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const { x, y } = site.at;
    const fam: Family = site.family;
    if (fam === 'bandit' || fam === 'rival') {
      const key = addStrip(scene, 'works-tent', tentStrip);
      for (const [ox, oy] of [[-40, -10], [36, -4], [0, 26]]) objs.push(scene.add.sprite(x + ox, y + oy, key, '0').setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(y + oy).setTint(fam === 'rival' ? 0xd09090 : 0xc8a888));
      const fire = scene.add.graphics().setDepth(y);
      fire.fillStyle(0x3a2a1a, 1).fillEllipse(x, y + 4, 22, 9).fillStyle(0xe8602a, 1).fillTriangle(x - 6, y + 2, x + 6, y + 2, x, y - 12).fillStyle(0xffd060, 1).fillTriangle(x - 3, y + 2, x + 3, y + 2, x, y - 6);
      objs.push(fire);
    } else if (fam === 'despair') {
      const g = scene.add.graphics().setDepth(y - 2);
      g.fillStyle(0x1a1020, 0.9).fillEllipse(x, y, 120, 46).fillStyle(0x7a3aa8, 0.35).fillEllipse(x, y, 90, 30).fillStyle(0xe8602a, 0.5).fillEllipse(x, y, 30, 10);
      objs.push(g);
    } else {
      const g = scene.add.graphics().setDepth(y);
      g.fillStyle(0x5a5650, 1).fillEllipse(x - 30, y - 6, 50, 34).fillEllipse(x + 26, y - 4, 44, 30).fillStyle(0x14100c, 1).fillEllipse(x, y + 2, 34, 22);
      g.fillStyle(0xe8e0d0, 1).fillRect(x - 46, y + 10, 8, 3).fillRect(x + 40, y + 12, 6, 3);
      objs.push(g);
    }
    objs.push(scene.add.text(x, y + 44, site.name, { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#e8dcc8', stroke: '#0b0a0f', strokeThickness: 3, resolution: 2 }).setOrigin(0.5, 0).setDepth(y + 3000));
    return { site, objs };
  };

  return {
    update(hero) {
      const s = st();
      if (!s || ctx.world.room()) return;
      // Wild cells around you.
      const hx = Math.floor(hero.x / CELL_PX), hy = Math.floor(hero.y / CELL_PX);
      const night = (() => { const p = ctx.world.phase(); return p > 0.8 || p < 0.04; })();
      const hostile = hostileTowns(s);
      for (let cx = hx - 1; cx <= hx + 1; cx++) for (let cy = hy - 1; cy <= hy + 1; cy++) {
        const key = `${cx},${cy}`;
        if (live.has(key)) continue;
        const anchor = anchorOf(cx, cy);
        if (!anchor) continue;
        const d = Math.hypot(anchor.x - hero.x, anchor.y - hero.y);
        if (d > WAKE_PX || d < 220) continue;
        const near = nearestTown(anchor);
        const pack = packFor(s, cx, cy, {
          nearRoad: nearRoad(anchor),
          despair: near && near.d < 2400 ? s.towns?.[near.id]?.despair ?? 0 : 0,
          night,
          hostile: !!near && near.d < 2600 && hostile.has(near.id),
        });
        if (pack) spawn(pack, anchor);
      }
      // Lairs: marks in sight, and the awake ones rise when you come close.
      for (const site of siteList()) {
        const d = Math.hypot(site.at.x - hero.x, site.at.y - hero.y);
        if (d < 1400 && !marks.has(site.id)) marks.set(site.id, drawMark(site));
        if (d > 1800 && marks.has(site.id)) { marks.get(site.id)!.objs.forEach((o) => o.destroy()); marks.delete(site.id); }
        if (d < LAIR_WAKE_PX && !live.has(site.id) && lairAwake(s, site.id)) spawn(lairPack(s, site), site.at, site);
      }
      for (const [key, l] of live) if (Math.hypot(l.anchor.x - hero.x, l.anchor.y - hero.y) > SLEEP_PX) despawn(key);
    },
    contextOf(f) {
      const l = live.get(f.packKey);
      return { ...(l?.nearTown ? { nearTown: l.nearTown } : {}), ...(l?.rivalTown ? { rivalTown: l.rivalTown } : {}) };
    },
    settle() {
      const s = st();
      const out: { site: LairSite; coin: number; gearName: string; at: Pt }[] = [];
      if (!s) return out;
      for (const [key, l] of live) {
        if (!l.foes.every((f) => f.dead)) continue;
        if (l.lair) {
          const r = clearLair(s, l.lair.id, l.lair.name, l.pack.members[0]?.level ?? 1, l.nearTown);
          out.push({ site: l.lair, coin: r.coin, gearName: r.gear.name, at: l.lair.at });
        } else clearCell(s, key);
        live.delete(key);
      }
      return out;
    },
    lairs() {
      const s = st();
      return siteList().map((x) => ({ ...x, awake: !!s && lairAwake(s, x.id) }));
    },
    clear() {
      for (const key of [...live.keys()]) despawn(key);
      for (const m of marks.values()) m.objs.forEach((o) => o.destroy());
      marks.clear();
      sites = null;
    },
  };
}
