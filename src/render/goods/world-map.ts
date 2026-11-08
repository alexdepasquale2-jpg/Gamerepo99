import { coarseBiomeAt, BIOME_COLOR } from '../../sim/map/terrain';
import type { LayoutRoute, SettlementKind } from '../../sim/map/world-layout';
/** World map (M) + corner minimap: towns sized by polity, roads, player, caravans, despair tint. */

import Phaser from 'phaser';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
import { phaserText } from '../../ui/kit/tokens';
import { drawPhaserPanel } from '../../ui/kit/phaser-panel';

type Town = { id: string; q: number; r: number; name: string; size: number; kind?: SettlementKind };
type Pt = { x: number; y: number };
/** Economy overlay: village carts (world px), treaty/war lines between towns, and each town's reach in tiles. */
export type MapEconomyFeed = { carts: Pt[]; links: { a: string; b: string; kind: 'trade' | 'alliance' | 'war' }[]; reach: Record<string, number> };
/** A facility on the roads (world px): mill, wood camp, quarry, waystation. */
export type MapFacility = Pt & { kind: string; name: string; idle: boolean };
export type MapFeed = { player: () => Pt; caravans: () => Pt[]; despair: () => Record<string, number>; economy?: () => MapEconomyFeed; facilities?: () => MapFacility[] };

const FACILITY_COLOR: Record<string, number> = { mill: 0xe8d27a, lumber_camp: 0x9a6a3a, mine: 0xa0a0b0, waystation: 0xd98a5a };
export type WorldMap = { toggle: () => void; isOpen: () => boolean; update: (time: number) => void; /** Step the minimap aside (a side sheet is open there). */ setMiniHidden: (hidden: boolean) => void };

const D = 1_000_200;
const font = { ...phaserText('body'), fontSize: '10px' };

/** 0 despair -> warm gold, 1 -> ashen grey-blue. */
export function despairColor(d: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(0xf2b84b), Phaser.Display.Color.ValueToColor(0x5a6070), 100, Phaser.Math.Clamp(d, 0, 1) * 100,
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

const sizeClass = (t: Town): { label: string; rad: number } => {
  const label = t.kind ?? (t.size >= 500 ? 'city' : t.size >= 200 ? 'town' : 'village');
  return { label, rad: label === 'city' ? 7 : label === 'town' ? 5 : 3.5 };
};

export function createWorldMap(scene: Phaser.Scene, towns: Town[], routes: LayoutRoute[], feed: MapFeed, seed = 0): WorldMap {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const pos = new Map(towns.map((t) => [t.id, tileFootWorld(t.q, t.r)]));
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const pad = TILE_PX * 40;
  const bx = Math.min(...(xs.length ? xs : [0])) - pad, by = Math.min(...(ys.length ? ys : [0])) - pad;
  const bw = Math.max(...(xs.length ? xs : [0])) - bx + pad, bh = Math.max(...(ys.length ? ys : [0])) - by + pad;

  const draw = (g: Phaser.GameObjects.Graphics, ox: number, oy: number, w: number, h: number, big: boolean): ((p: Pt) => Pt) => {
    const s = Math.min(w / bw, h / bh);
    const tx = (p: Pt): Pt => ({ x: ox + (p.x - bx) * s + (w - bw * s) / 2, y: oy + (p.y - by) * s + (h - bh * s) / 2 });
    g.clear();
    // Kit panel frame; the land inside keeps its own map colours.
    drawPhaserPanel(g, ox - 2, oy - 2, w + 4, h + 4, { alpha: 0.94, lineWidth: big ? 2 : 1 });
    // Draw only the bounded world rectangle, not a stretched strip.
    const cell = big ? 5 : 3;
    const left = ox + (w - bw * s) / 2, top = oy + (h - bh * s) / 2;
    for (let x = 0; x < bw * s; x += cell) for (let y = 0; y < bh * s; y += cell) {
      const q = (bx + (x + cell / 2) / s) / TILE_PX;
      const r = (by + (y + cell / 2) / s) / TILE_PX;
      g.fillStyle(BIOME_COLOR[coarseBiomeAt(seed, q, r)], 0.9).fillRect(left + x, top + y, Math.min(cell, bw * s - x), Math.min(cell, bh * s - y));
    }
    g.lineStyle(big ? 2 : 1, 0xc8a878, 0.8);
    for (const r of routes) {
      const a = pos.get(r.from), b = pos.get(r.to);
      if (!a || !b) continue;
      const path = r.path.map((p) => tx(tileFootWorld(p.q, p.r)));
      g.beginPath();
      path.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.strokePath();
    }
    const eco = feed.economy?.();
    if (eco) {
      for (const t of towns) {
        const p = tx(pos.get(t.id)!), reach = (eco.reach[t.id] ?? 0) * TILE_PX * s;
        if (reach > 2) g.lineStyle(1, 0xf2e6b8, big ? 0.35 : 0.25).strokeCircle(p.x, p.y, reach);
      }
      for (const l of eco.links) {
        const a = pos.get(l.a), b = pos.get(l.b);
        if (!a || !b) continue;
        const pa = tx(a), pb = tx(b);
        g.lineStyle(l.kind === 'war' ? (big ? 3 : 2) : 1.5, l.kind === 'war' ? 0xd0422e : l.kind === 'alliance' ? 0x7fd08a : 0xc8d878, l.kind === 'war' ? 0.9 : 0.55).lineBetween(pa.x, pa.y, pb.x, pb.y);
      }
      g.fillStyle(0xf09a3a);
      for (const c of eco.carts) { const p = tx(c); g.fillRect(p.x - (big ? 2.5 : 1.5), p.y - (big ? 2.5 : 1.5), big ? 5 : 3, big ? 5 : 3); }
    }
    // Facilities: a small diamond beside the road, greyed when it stands idle.
    for (const f of feed.facilities?.() ?? []) {
      const p = tx(f), d = big ? 4 : 2;
      g.fillStyle(f.idle ? 0x6a6a6a : (FACILITY_COLOR[f.kind] ?? 0xd9c79a)).fillTriangle(p.x - d, p.y, p.x, p.y - d, p.x + d, p.y).fillTriangle(p.x - d, p.y, p.x, p.y + d, p.x + d, p.y);
      if (big) g.lineStyle(1, 0x1b1612).strokeTriangle(p.x - d, p.y, p.x, p.y - d, p.x + d, p.y).strokeTriangle(p.x - d, p.y, p.x, p.y + d, p.x + d, p.y);
    }
    const desp = feed.despair();
    for (const t of towns) {
      const p = tx(pos.get(t.id)!);
      const { rad } = sizeClass(t);
      g.fillStyle(despairColor(desp[t.id] ?? 0)).fillCircle(p.x, p.y, big ? rad : Math.max(2, rad * 0.5));
      g.lineStyle(1, 0x1b1612).strokeCircle(p.x, p.y, big ? rad : Math.max(2, rad * 0.5));
    }
    g.fillStyle(0xe8dcc0);
    for (const c of feed.caravans()) {
      const p = tx(c);
      g.fillRect(p.x - (big ? 2 : 1), p.y - (big ? 2 : 1), big ? 4 : 2, big ? 4 : 2);
    }
    const pl = tx(feed.player());
    g.fillStyle(0xff4a3a).fillCircle(pl.x, pl.y, big ? 4 : 2.5).lineStyle(1, 0xffffff).strokeCircle(pl.x, pl.y, big ? 4 : 2.5);
    return tx;
  };

  const mini = scene.add.graphics().setScrollFactor(0).setDepth(D);
  const MW = 120, MH = 84;
  const big = scene.add.graphics().setScrollFactor(0).setDepth(D + 5).setVisible(false);
  const labels = scene.add.container(0, 0).setScrollFactor(0).setDepth(D + 6).setVisible(false);
  let last = -1e9;
  let miniHidden = false;

  const drawBig = (): void => {
    const tx = draw(big, 30, 30, W - 60, H - 60, true);
    labels.removeAll(true);
    labels.add(scene.add.text(W / 2, 36, 'The Known World  (M to close)', phaserText('heading')).setOrigin(0.5, 0));
    const desp = feed.despair();
    for (const t of towns) {
      const p = tx(pos.get(t.id)!);
      const d = desp[t.id] ?? 0;
      labels.add(scene.add.text(p.x, p.y + 6, `${t.name} · ${sizeClass(t).label}${d > 0.4 ? ' (despairing)' : ''}`, font).setOrigin(0.5, 0));
    }
    for (const f of feed.facilities?.() ?? []) {
      const p = tx(f);
      labels.add(scene.add.text(p.x + 6, p.y - 5, `${f.name}${f.idle ? ' (idle)' : ''}`, { ...font, fontSize: '9px', color: f.idle ? '#a8a8a8' : '#e8d8a8' }).setName('map-facility'));
    }
    labels.add(scene.add.text(40, H - 58, 'Forest · hills · blue water · golden fields | red: you · pale: caravans · orange: village carts\ndiamonds: mills, wood camps, quarries, waystations (grey: idle) | rings: land · green line: allies · red: war', font));
  };

  return {
    toggle() {
      big.setVisible(!big.visible);
      labels.setVisible(big.visible);
      mini.setVisible(!big.visible && !miniHidden);
      if (big.visible) drawBig();
    },
    setMiniHidden(hidden) {
      if (hidden === miniHidden) return;
      miniHidden = hidden;
      mini.setVisible(!big.visible && !hidden);
    },
    isOpen: () => big.visible,
    update(time) {
      if (time - last < 250) return;
      last = time;
      if (big.visible) drawBig();
      else draw(mini, W - MW - 8, 8, MW, MH, false);
    },
  };
}
