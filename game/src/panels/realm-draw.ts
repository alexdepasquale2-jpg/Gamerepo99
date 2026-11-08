/**
 * The realm view of the world map: every district as one cell of the grid, tinted by its despair, with a
 * dot per town, the home district outlined and where you stand marked. Districts come from the seed
 * (sim/map/districts); the home district's tint follows its live towns. Pure canvas drawing.
 */
import type { GameContext } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { DISTRICTS, districtAtTile, realm, type District } from '../sim/map/districts';
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
  return seen?.despair ?? d.despair;
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
  return cell;
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

/** One line about a district for the sheet. */
export function districtLine(d: District, homeDesp?: number): string {
  if (d.home) return `${d.name}: your home district. ${homeDesp !== undefined && homeDesp > 0.4 ? 'Its towns are despairing.' : 'Its hearths still hold.'}`;
  const c = d.character;
  const towns = d.towns.map((t) => (t.seat ? `${t.name} (seat)` : t.name)).join(', ');
  return `${d.name}. A ${c.woundLabel} land of ${d.towns.length} settlements and about ${d.population} people, ruled by the ${c.doctrine.name}, which promises ${c.doctrine.promise}. ${d.despair > 0.5 ? 'Most hearths there have gone cold.' : 'Some hearths there still burn.'} Towns: ${towns}.`;
}
