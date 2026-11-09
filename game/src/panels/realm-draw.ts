/**
 * The realm view of the world map: every district as one cell of the grid, tinted by its despair, with a
 * dot per town, the home district outlined and where you stand marked. Districts come from the seed
 * (sim/map/districts); the home district's tint follows its live towns. Neighbouring districts under a trade
 * pact are joined by a gold line, those at war by a red dashed one (sim/civic/district-relations); peace is
 * the plain map. Pure canvas drawing.
 */
import type { GameContext } from '../app/contracts';
import { polityIfAny, refOf } from '../sim/civic/district-relations';
import { TILE_PX } from '../sim/map/constants';
import { DISTRICTS, districtAtTile, realm, type District } from '../sim/map/districts';
import { bakeOf, districtTale, standingOf, yearsOf } from '../sim/realm-bake';
import { despairColor, PLAYER_COLOR } from './map-draw';

const LAND_TINT: Record<string, string> = { forest: '#2f4a2c', hills: '#5a5246', fields: '#6a6a3a', meadow: '#4f6a3a', water: '#2e4a5a' };

/** The live district's despair: the mean of its towns now. */
function liveDespair(ctx: GameContext): number {
  const d = Object.values(ctx.session.townDespair());
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0.3;
}

/** A district's despair as you know it: live where you are, as you left it where you have been, else its seed. */
function knownDespair(ctx: GameContext, d: District, live: number): number {
  const here = ctx.session.district();
  if (here.col === d.col && here.row === d.row) return live;
  const seen = (ctx.session.getState() as { realm?: { summaries?: Record<string, { despair: number }> } } | undefined)?.realm?.summaries?.[d.id];
  return seen?.despair ?? bakeOf(ctx.session.getState())?.byId[d.id]?.despair ?? d.despair;
}

export function playerDistrict(ctx: GameContext): { col: number; row: number } | null {
  try {
    const p = ctx.actors.player.pos();
    return districtAtTile(Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX));
  } catch { return null; }
}

/** Draw the realm onto a canvas; returns the cell size so callers can map a click to a district. */
export function drawRealm(canvas: HTMLCanvasElement, ctx: GameContext, selected?: District | null): number {
  const g = canvas.getContext('2d');
  if (!g) return 0;
  const { cols, rows } = DISTRICTS.grid;
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cell * cols) / 2), oy = Math.floor((canvas.height - cell * rows) / 2);
  g.fillStyle = '#14120f';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const here = playerDistrict(ctx);
  const live = liveDespair(ctx);
  const bake = bakeOf(ctx.session.getState());
  for (const d of realm(ctx.seed)) {
    const x = ox + d.col * cell, y = oy + d.row * cell;
    g.fillStyle = LAND_TINT[d.character.land] ?? '#3a3a30';
    g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    // Despair washes the land toward ash.
    g.globalAlpha = 0.55;
    g.fillStyle = despairColor(knownDespair(ctx, d, live));
    g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    g.globalAlpha = 1;
    const span = d.box.q1 - d.box.q0;
    for (const t of d.towns) {
      const tx = x + ((t.q - d.box.q0) / span) * cell, ty = y + ((t.r - d.box.r0) / span) * cell;
      const rad = t.kind === 'city' ? 2.6 : t.kind === 'town' ? 1.9 : 1.3;
      g.fillStyle = t.seat ? '#f2e6b8' : 'rgba(242,230,184,0.75)';
      g.beginPath(); g.arc(tx, ty, Math.max(1, rad * cell / 40), 0, Math.PI * 2); g.fill();
    }
    // What the realm's past left: a beacon wears a gold ring, a fallen land a dark cross (sim/realm-bake).
    const past = bake?.byId[d.id];
    if (past?.beacon || past?.fallen) {
      const cx = x + cell - Math.max(5, cell / 6), cy = y + Math.max(5, cell / 6), k = Math.max(2, cell / 12);
      g.lineWidth = Math.max(1.5, cell / 26);
      if (past.beacon) { g.strokeStyle = '#ffd86b'; g.beginPath(); g.arc(cx, cy, k, 0, Math.PI * 2); g.stroke(); }
      else { g.strokeStyle = '#0b0a0f'; g.beginPath(); g.moveTo(cx - k, cy - k); g.lineTo(cx + k, cy + k); g.moveTo(cx + k, cy - k); g.lineTo(cx - k, cy + k); g.stroke(); }
    }
    if (d.home) {
      g.strokeStyle = '#f2b84b'; g.lineWidth = 2;
      g.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    }
    if (selected && selected.id === d.id) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    if (here && here.col === d.col && here.row === d.row) {
      g.fillStyle = PLAYER_COLOR;
      g.beginPath(); g.arc(x + cell / 2, y + cell / 2, Math.max(3, cell / 10), 0, Math.PI * 2); g.fill();
    }
  }
  drawRelations(g, ctx, cell, ox, oy);
  return cell;
}

/** Pacts and wars between neighbouring districts, centre to centre (drawn over the cells). */
function drawRelations(g: CanvasRenderingContext2D, ctx: GameContext, cell: number, ox: number, oy: number): void {
  const rel = polityIfAny(ctx.session.getState())?.relations;
  if (!rel) return;
  const mid = (id: string): [number, number] => { const d = refOf(id); return [ox + (d.col + 0.5) * cell, oy + (d.row + 0.5) * cell]; };
  g.save();
  g.lineCap = 'round';
  for (const key of Object.keys(rel).sort()) {
    const r = rel[key]!;
    if (r.state === 'peace') continue;
    const [x0, y0] = mid(r.a), [x1, y1] = mid(r.b);
    const war = r.state === 'war';
    g.strokeStyle = war ? 'rgba(214,64,48,0.95)' : 'rgba(242,200,96,0.8)';
    g.lineWidth = Math.max(war ? 2.5 : 1.5, cell / (war ? 14 : 22));
    g.setLineDash(war ? [Math.max(3, cell / 9), Math.max(2, cell / 14)] : []);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    if (war) {
      // Crossed blades at the border between them.
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = Math.max(3, cell / 10);
      g.setLineDash([]);
      g.beginPath(); g.moveTo(cx - k, cy - k); g.lineTo(cx + k, cy + k); g.moveTo(cx + k, cy - k); g.lineTo(cx - k, cy + k); g.stroke();
    }
  }
  g.restore();
}

/** The district under a canvas point (client coordinates relative to the canvas), or null. */
export function districtAtPoint(canvas: HTMLCanvasElement, ctx: GameContext, px: number, py: number): District | null {
  const { cols, rows } = DISTRICTS.grid;
  const sx = canvas.width / (canvas.clientWidth || canvas.width), sy = canvas.height / (canvas.clientHeight || canvas.height);
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cell * cols) / 2), oy = Math.floor((canvas.height - cell * rows) / 2);
  const col = Math.floor((px * sx - ox) / cell), row = Math.floor((py * sy - oy) / cell);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return realm(ctx.seed).find((d) => d.col === col && d.row === row) ?? null;
}

/** One line about a district for the sheet. `despair`: as known now (live, as you left it, or as its past left it). */
export function districtLine(d: District, homeDesp?: number, despair = d.despair): string {
  if (d.home) return `${d.name}: your home district. ${homeDesp !== undefined && homeDesp > 0.4 ? 'Its towns are despairing.' : 'Its hearths still hold.'}`;
  const c = d.character;
  const towns = d.towns.map((t) => (t.seat ? `${t.name} (seat)` : t.name)).join(', ');
  return `${d.name}. A ${c.woundLabel} land of ${d.towns.length} settlements and about ${d.population} people, ruled by the ${c.doctrine.name}, which promises ${c.doctrine.promise}. ${despair > 0.5 ? 'Most hearths there have gone cold.' : 'Some hearths there still burn.'} Towns: ${towns}.`;
}

/** What a district's past left (an older world only): how it stands, and the tales it keeps, newest first. */
export function districtPast(ctx: GameContext, d: District): { standing: string; tales: string[] } | null {
  const bake = bakeOf(ctx.session.getState());
  const b = bake?.byId[d.id];
  if (!bake || !b) return null;
  const wars = (b.counts.war_won ?? 0) + (b.counts.war_lost ?? 0);
  const standing = `After ${yearsOf(bake.dawns).toLocaleString('en-US')} years: ${standingOf(b)}. ${b.rulers} seat-holders, ${wars} wars, ${b.counts.sparkbearer ?? 0} spark-carriers came through.`;
  return { standing, tales: districtTale(bake, d.id).reverse().map((t) => t.line) };
}

/** The realm's ages, oldest first, as one line (an older world only). */
export function realmAges(ctx: GameContext): string | null {
  const bake = bakeOf(ctx.session.getState());
  if (!bake?.ages.length) return null;
  return `The realm is ${yearsOf(bake.dawns).toLocaleString('en-US')} years old. Its ages: ${bake.ages.map((a) => a.name).join(', ')}.`;
}
