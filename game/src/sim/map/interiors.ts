/**
 * Enterable building interiors — pure layout + door logic (no Phaser, no DOM).
 * Overworld stamps (cottage / shop / hall) own the doors; each maps to a small
 * room plan with furniture and, when the town has someone to spare, an occupant.
 */
import art from '../../data/art/settlements.json';
import lines from '../../data/dialogue/interior-lines.json';
import { TILE_PX } from './constants';
import type { LayoutSettlement } from './world-layout';

export type InteriorKind = 'house' | 'shop' | 'inn' | 'office';
export type Pt = { x: number; y: number };

/** Overworld stamp type -> interior. Towers and decor are not enterable. */
const KIND_OF: Record<string, InteriorKind | undefined> = { cottage: 'house', shop: 'shop', hall: 'inn' };
const ROOM_KINDS = new Set<string>(['house', 'shop', 'inn', 'office']);
/** A layout entry's room: its own `interior` (a shop stamp kept as a ledger office), else by stamp type. */
export const interiorKindOf = (stampType: string, interior?: string): InteriorKind | null =>
  (interior && ROOM_KINDS.has(interior) ? (interior as InteriorKind) : KIND_OF[stampType]) ?? null;

/** How close (px) the player must be to a door to be offered "Enter". */
export const DOOR_REACH = 44;

export type Building = {
  /** `${townId}:${index}` — stable for a given layout. */
  id: string;
  townId: string;
  kind: InteriorKind;
  stampType: string;
  /** World pixel position of the door threshold (matches the painted stamp's door). */
  door: Pt;
  /** Index into the settlement art palettes — same pick the overworld stamp uses, so wall colours match. */
  paletteIndex: number;
};

/** Enterable buildings of one settlement, in art-layout order. Mirrors paintSettlement's placement. */
export function townBuildings(town: LayoutSettlement): Building[] {
  const layout = art.layouts[town.kind ?? 'village'];
  const fx = town.q * TILE_PX + TILE_PX / 2;
  const fy = town.r * TILE_PX + TILE_PX;
  let sh = 0;
  for (const c of town.id) sh = (sh * 31 + c.charCodeAt(0)) >>> 0;
  const out: Building[] = [];
  layout.forEach((b, i) => {
    const kind = interiorKindOf(b.type, (b as { interior?: string }).interior);
    if (!kind) return;
    out.push({ id: `${town.id}:${i}`, townId: town.id, kind, stampType: b.type, door: { x: fx + b.q * TILE_PX, y: fy + b.r * TILE_PX }, paletteIndex: (sh + i) % art.palettes.length });
  });
  return out;
}

export const allBuildings = (towns: LayoutSettlement[]): Building[] => towns.flatMap(townBuildings);

/** Nearest door within reach of a world position, or null. */
export function nearestDoor(buildings: Building[], at: Pt, reach = DOOR_REACH): { building: Building; dist: number } | null {
  let best: { building: Building; dist: number } | null = null;
  for (const b of buildings) {
    const dist = Math.hypot(b.door.x - at.x, b.door.y - at.y);
    if (dist <= reach && (!best || dist < best.dist)) best = { building: b, dist };
  }
  return best;
}

/**
 * Who lives/works in each enterable building: the town's people sorted by id,
 * dealt out one per building in layout order. Extra people stay outdoors; a
 * building with nobody to spare is simply empty.
 */
export function occupantOf(building: Building, townBuildingsList: Building[], townPeopleIds: string[]): string | undefined {
  const idx = townBuildingsList.findIndex((b) => b.id === building.id);
  if (idx < 0) return undefined;
  return [...townPeopleIds].sort()[idx];
}

export const OCCUPANT_ROLE: Record<InteriorKind, string> = { house: 'lives here', shop: 'keeps the shop', inn: 'keeps the inn', office: 'keeps the ledgers' };
export const INTERIOR_TITLE: Record<InteriorKind, string> = { house: 'Cottage', shop: 'General Store', inn: 'The Inn', office: 'Ledger Office' };

// ── room plans ────────────────────────────────────────────────────────────

export type FurnitureType =
  | 'bed' | 'table' | 'stool' | 'hearth' | 'rug' | 'shelf' | 'books' | 'plant' | 'chest' | 'crate' | 'barrel'
  | 'counter' | 'armchair' | 'window' | 'sign' | 'lantern';

export type Furniture = {
  type: FurnitureType;
  /** Tile column / row in the floor grid (row 0 = floor row against the back wall). */
  col: number;
  row: number;
  w: number;
  h: number;
  /** Solid furniture blocks walking; rugs and wall decor do not. */
  solid: boolean;
  /** Wall decor sits on the back-wall band above row 0 (row is ignored for collision). */
  wall?: boolean;
};

export type InteriorPlan = {
  kind: InteriorKind;
  cols: number;
  rows: number;
  /** Floor tile just inside the door where the player appears. */
  spawn: { col: number; row: number };
  /** Door column on the front wall; the exit mat is the bottom row around it. */
  doorCol: number;
  /** Where the occupant stands. */
  npc: { col: number; row: number };
  mirrored: boolean;
  /** 0..2 colour accent (rug / bedding / awning). */
  accent: number;
  furniture: Furniture[];
};

const f = (type: FurnitureType, col: number, row: number, w = 1, h = 1, solid = true, wall = false): Furniture => ({ type, col, row, w, h, solid, ...(wall ? { wall } : {}) });
const rug = (col: number, row: number, w: number, h: number) => f('rug', col, row, w, h, false);
const deco = (type: FurnitureType, col: number, w = 1) => f(type, col, -1, w, 1, false, true);

function base(kind: InteriorKind): Omit<InteriorPlan, 'mirrored' | 'accent'> {
  if (kind === 'house') {
    return {
      kind, cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 8, row: 4 },
      furniture: [
        deco('window', 2, 2), deco('window', 7, 2),
        f('bed', 1, 0, 2, 2), f('hearth', 5, 0, 2, 1), f('books', 9, 0, 2, 1),
        rug(4, 2, 4, 3), f('table', 5, 3, 2, 2), f('stool', 4, 3), f('stool', 7, 3),
        f('chest', 1, 5), f('plant', 10, 5), f('lantern', 10, 2),
      ],
    };
  }
  if (kind === 'shop') {
    return {
      kind, cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 5, row: 1 },
      furniture: [
        deco('sign', 5, 2), deco('window', 4), deco('window', 7),
        f('shelf', 1, 0, 3, 1), f('shelf', 8, 0, 3, 1),
        f('counter', 3, 2, 6, 1),
        rug(4, 4, 4, 2),
        f('crate', 1, 4), f('crate', 2, 4), f('crate', 1, 5), f('barrel', 10, 4), f('barrel', 10, 5), f('plant', 10, 2),
      ],
    };
  }
  if (kind === 'office') {
    // The ledger office: shelves of books along the back, the clerk's counter, a reading table.
    return {
      kind, cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 6, row: 1 },
      furniture: [
        deco('sign', 5, 2), deco('window', 2), deco('window', 9),
        f('books', 1, 0, 3, 1), f('books', 8, 0, 3, 1), f('shelf', 4, 0, 1, 1),
        f('counter', 4, 2, 5, 1), f('lantern', 9, 2),
        rug(3, 4, 6, 2), f('table', 2, 4, 2, 1), f('stool', 1, 4), f('chest', 10, 5), f('crate', 10, 4), f('plant', 1, 2),
      ],
    };
  }
  return {
    kind, cols: 14, rows: 7, doorCol: 7, spawn: { col: 7, row: 6 }, npc: { col: 10, row: 0 },
    furniture: [
      deco('window', 4, 2), deco('sign', 6, 2), deco('shelf', 9, 4),
      f('hearth', 1, 0, 3, 1), rug(1, 1, 4, 2), f('armchair', 1, 2), f('armchair', 4, 2),
      f('counter', 8, 1, 5, 1), f('stool', 9, 2), f('stool', 11, 2),
      f('table', 7, 3, 2, 2), f('stool', 6, 3), f('stool', 9, 3),
      f('table', 2, 5, 2, 1), f('stool', 1, 5), f('stool', 4, 5),
      f('barrel', 12, 5), f('barrel', 13, 5), f('plant', 13, 3), f('lantern', 6, 1),
    ],
  };
}

/** Deterministic room plan: same kind + seed string -> same room (mirroring and accent vary by building). */
export function interiorPlan(kind: InteriorKind, seedKey: string): InteriorPlan {
  let h = 2166136261;
  for (const c of seedKey) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const b = base(kind);
  const mirrored = kind !== 'inn' && (h & 1) === 1;
  const flip = <T extends { col: number }>(o: T, w = 1): T => ({ ...o, col: b.cols - o.col - w });
  const plan: InteriorPlan = {
    ...b,
    mirrored,
    accent: (h >>> 3) % 3,
    furniture: mirrored ? b.furniture.map((o) => flip(o, o.w)) : b.furniture.map((o) => ({ ...o })),
    npc: mirrored ? flip(b.npc) : { ...b.npc },
    spawn: { ...b.spawn },
  };
  return plan;
}

/** Tiles blocked by solid furniture (key `col,row`). */
export function solidTiles(plan: InteriorPlan): Set<string> {
  const s = new Set<string>();
  for (const o of plan.furniture) {
    if (!o.solid) continue;
    for (let dc = 0; dc < o.w; dc++) for (let dr = 0; dr < o.h; dr++) s.add(`${o.col + dc},${o.row + dr}`);
  }
  return s;
}

/** True when a foot box (px, room-local, origin = floor top-left) is clear of walls and furniture. */
export function interiorWalkable(plan: InteriorPlan, x: number, y: number, half = 5): boolean {
  const T = TILE_PX;
  if (x - half < 0 || x + half > plan.cols * T || y - 4 < 0 || y > plan.rows * T) return false;
  const solid = solidTiles(plan);
  for (const px of [x - half, x + half]) for (const py of [y - 4, y]) {
    if (solid.has(`${Math.floor(px / T)},${Math.floor(Math.min(py, plan.rows * T - 1) / T)}`)) return false;
  }
  return true;
}

/** Px position of the exit mat centre (bottom edge of the floor, at the door column). */
export const exitMat = (plan: InteriorPlan): Pt => ({ x: (plan.doorCol + 0.5) * TILE_PX, y: plan.rows * TILE_PX });
export const EXIT_REACH = TILE_PX * 1.6;
export const nearExit = (plan: InteriorPlan, at: Pt): boolean => {
  const m = exitMat(plan);
  return Math.hypot(m.x - at.x, m.y - at.y) <= EXIT_REACH;
};

/** Floor tiles reachable from the spawn by 4-neighbour steps (for layout validation). */
export function reachableTiles(plan: InteriorPlan): Set<string> {
  const solid = solidTiles(plan);
  const seen = new Set<string>([`${plan.spawn.col},${plan.spawn.row}`]);
  const queue = [plan.spawn];
  while (queue.length) {
    const c = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const col = c.col + dc, row = c.row + dr, k = `${col},${row}`;
      if (col < 0 || row < 0 || col >= plan.cols || row >= plan.rows || solid.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push({ col, row });
    }
  }
  return seen;
}

/** What an occupant says on the n-th time you speak to them; mood follows town despair (0..1). */
export function interiorLine(kind: InteriorKind, despair01: number, visit: number): string {
  const pool = lines[kind][despair01 >= lines.lowAt ? 'low' : 'calm'];
  return pool[((visit % pool.length) + pool.length) % pool.length]!;
}
export const EMPTY_ROOM_LINE: string = lines.empty;

/** Plain-words time of day for the room HUD (matches the sky stops: night is ~0.76-0.92). */
export function dayPartLabel(day01: number): string {
  const t = ((day01 % 1) + 1) % 1;
  if (t < 0.12) return 'Dawn';
  if (t < 0.45) return 'Morning';
  if (t < 0.55) return 'Midday';
  if (t < 0.68) return 'Afternoon';
  if (t < 0.76) return 'Dusk';
  if (t < 0.92) return 'Night';
  return 'Dawn';
}
