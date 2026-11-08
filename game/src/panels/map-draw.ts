/**
 * Draws the known world onto a 2D canvas, in tile space: land (cached biome cells), roads, each town's land
 * ring, ally / trade / war lines, carts and wagons on the roads, facilities, towns tinted by despair, and
 * you. Used by the big map sheet and the corner minimap.
 */
import type { GameContext } from '../app/contracts';
import type { LayoutRoute, SettlementKind } from '../sim/map/world-layout';
import { pointOnRoad } from '../sim/map/world-layout';
import { BIOME_COLOR, coarseBiomeAt } from '../sim/map/terrain';
import { TILE_PX } from '../sim/map/constants';
import { mapEconomy } from '../sim/economy/economy-view';
import { townReach } from '../sim/economy/borders';
import { facilityPlaces } from '../sim/economy/facilities';
import { townNamer } from './dom';

type Town = { id: string; name: string; q: number; r: number; kind: SettlementKind };
export type MapModel = { towns: Town[]; routes: LayoutRoute[]; q0: number; r0: number; w: number; h: number };
type Pt = { x: number; y: number };

export const LINK_COLOR = { alliance: '#7fd08a', trade: '#c8d878', war: '#d0422e' } as const;
export const CART_COLOR = '#f09a3a';
export const WAGON_COLOR = '#e8dcc0';
export const PLAYER_COLOR = '#ff4a3a';
const ROAD_COLOR = 'rgba(200,168,120,0.85)';
const FACILITY_COLOR: Record<string, string> = { mill: '#e8d27a', lumber_camp: '#9a6a3a', mine: '#a0a0b0', waystation: '#d98a5a' };

export function mapModel(ctx: GameContext): MapModel {
  const nameOf = townNamer(ctx);
  const towns = ctx.layout.settlements.map((t) => ({ id: t.id, name: nameOf(t.id), q: t.q, r: t.r, kind: t.kind ?? 'village' }));
  const qs = towns.map((t) => t.q), rs = towns.map((t) => t.r);
  for (const r of ctx.layout.routes) for (const p of r.path) { qs.push(p.q); rs.push(p.r); }
  const range = (v: number[]): number => (v.length ? Math.max(...v) - Math.min(...v) : 0);
  const span = Math.max(1, range(qs), range(rs));
  const pad = Math.max(40, Math.round(span * 0.06));
  const q0 = Math.min(...(qs.length ? qs : [0])) - pad, r0 = Math.min(...(rs.length ? rs : [0])) - pad;
  const w = Math.max(...(qs.length ? qs : [0])) + pad - q0, h = Math.max(...(rs.length ? rs : [0])) + pad - r0;
  return { towns, routes: ctx.layout.routes, q0, r0, w: Math.max(1, w), h: Math.max(1, h) };
}

/** 0 despair → warm gold, 1 → ashen grey-blue. */
export function despairColor(d: number): string {
  const f = Math.max(0, Math.min(1, d));
  const a = [0xf2, 0xb8, 0x4b], b = [0x5a, 0x60, 0x70];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const lands = new Map<string, HTMLCanvasElement>();

/** Biome cells for the whole model at this canvas size (computed once per size and seed). */
function land(model: MapModel, seed: number, cw: number, ch: number, cell: number): HTMLCanvasElement {
  const key = `${seed}|${cw}x${ch}|${cell}|${model.q0},${model.r0},${model.w},${model.h}`;
  const hit = lands.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  const s = Math.min(cw / model.w, ch / model.h);
  const ox = (cw - model.w * s) / 2, oy = (ch - model.h * s) / 2;
  for (let x = 0; x < model.w * s; x += cell) for (let y = 0; y < model.h * s; y += cell) {
    const q = model.q0 + (x + cell / 2) / s, r = model.r0 + (y + cell / 2) / s;
    g.fillStyle = hex(BIOME_COLOR[coarseBiomeAt(seed, Math.floor(q), Math.floor(r))]);
    g.fillRect(Math.floor(ox + x), Math.floor(oy + y), cell, cell);
  }
  if (lands.size > 8) lands.delete(lands.keys().next().value!);
  lands.set(key, c);
  return c;
}

const playerTile = (ctx: GameContext): { q: number; r: number } | null => {
  try {
    const p = ctx.actors.player.pos();
    return { q: (p.x - TILE_PX / 2) / TILE_PX, r: (p.y - TILE_PX) / TILE_PX };
  } catch { return null; }
};

export function drawMap(canvas: HTMLCanvasElement, ctx: GameContext, model: MapModel, big: boolean): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const cw = canvas.width, ch = canvas.height;
  const s = Math.min(cw / model.w, ch / model.h);
  const ox = (cw - model.w * s) / 2, oy = (ch - model.h * s) / 2;
  const tx = (q: number, r: number): Pt => ({ x: ox + (q - model.q0) * s, y: oy + (r - model.r0) * s });
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#14110e';
  g.fillRect(0, 0, cw, ch);
  g.drawImage(land(model, ctx.seed, cw, ch, big ? 4 : 2), 0, 0);

  const st = ctx.session.getState();
  const k = big ? 1 : 0.6;
  // Roads.
  g.strokeStyle = ROAD_COLOR;
  g.lineWidth = big ? 2 : 1;
  for (const r of model.routes) {
    g.beginPath();
    r.path.forEach((p, i) => { const v = tx(p.q, p.r); if (i) g.lineTo(v.x, v.y); else g.moveTo(v.x, v.y); });
    g.stroke();
  }
  const pos = new Map(model.towns.map((t) => [t.id, tx(t.q, t.r)]));
  const routeById = new Map(model.routes.map((r) => [r.id, r]));
  if (st) {
    const eco = mapEconomy(st, (id) => townReach(st, id));
    // Land rings: how far each town's claims reach.
    g.lineWidth = 1;
    g.strokeStyle = big ? 'rgba(242,230,184,0.4)' : 'rgba(242,230,184,0.28)';
    for (const t of model.towns) {
      const p = pos.get(t.id)!, rad = (eco.reach[t.id] ?? 0) * s;
      if (rad > 1.5) { g.beginPath(); g.arc(p.x, p.y, rad, 0, Math.PI * 2); g.stroke(); }
    }
    // Ally / trade / war lines.
    for (const l of eco.links) {
      const a = pos.get(l.a), b = pos.get(l.b);
      if (!a || !b) continue;
      g.strokeStyle = LINK_COLOR[l.kind];
      g.globalAlpha = l.kind === 'war' ? 0.95 : 0.7;
      g.lineWidth = (l.kind === 'war' ? 2.5 : 1.5) * k;
      g.setLineDash(l.kind === 'trade' ? [4 * k, 3 * k] : []);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
    // Village carts.
    g.fillStyle = CART_COLOR;
    const d = big ? 2.5 : 1.5;
    for (const c of eco.carts) {
      const route = routeById.get(c.routeId);
      if (!route) continue;
      const q = pointOnRoad(route.path, c.from === route.from ? c.f : 1 - c.f);
      const p = tx(q.q, q.r);
      g.fillRect(p.x - d, p.y - d, d * 2, d * 2);
    }
    // Caravan wagons.
    g.fillStyle = WAGON_COLOR;
    for (const m of st.caravans ?? []) {
      const route = routeById.get(m.routeId);
      if (!route) continue;
      const q = pointOnRoad(route.path, m.heading === 'outbound' ? m.progress01 : 1 - m.progress01);
      const p = tx(q.q, q.r);
      g.fillRect(p.x - d, p.y - d, d * 2, d * 2);
    }
    // Facilities: small diamonds, grey when idle.
    for (const f of facilityPlaces(st)) {
      const p = tx(f.q, f.r), r = big ? 4 : 2;
      g.fillStyle = st.facilityStaff?.[f.id]?.idle ? '#6a6a6a' : FACILITY_COLOR[f.kind] ?? '#d9c79a';
      g.beginPath(); g.moveTo(p.x - r, p.y); g.lineTo(p.x, p.y - r); g.lineTo(p.x + r, p.y); g.lineTo(p.x, p.y + r); g.closePath(); g.fill();
    }
  }
  // Towns, tinted by despair.
  const desp = ctx.session.townDespair();
  for (const t of model.towns) {
    const p = pos.get(t.id)!;
    const rad = (t.kind === 'city' ? 7 : t.kind === 'town' ? 5 : 3.5) * (big ? 1 : 0.5) + (big ? 0 : 1);
    g.fillStyle = despairColor(desp[t.id] ?? 0);
    g.strokeStyle = '#1b1612';
    g.lineWidth = 1;
    g.beginPath(); g.arc(p.x, p.y, rad, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (big) {
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const t of model.towns) {
      const p = pos.get(t.id)!;
      // Keep every label inside the canvas: nudge in from the sides, flip above near the bottom.
      const half = g.measureText(t.name).width / 2 + 2;
      const x = Math.max(half, Math.min(cw - half, p.x));
      const y = p.y + 20 > ch ? p.y - 18 : p.y + 7;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(11,10,15,0.85)';
      g.strokeText(t.name, x, y);
      g.fillStyle = (desp[t.id] ?? 0) > 0.4 ? '#a8a8b0' : '#efe2c4';
      g.fillText(t.name, x, y);
    }
  }
  // You.
  const me = playerTile(ctx);
  if (me) {
    const p = tx(me.q, me.r), r = big ? 4 : 2.5;
    g.fillStyle = PLAYER_COLOR;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
