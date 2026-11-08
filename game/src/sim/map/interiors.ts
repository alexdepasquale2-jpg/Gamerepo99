/**
 * Enterable building interiors — pure layout + door logic (no Phaser, no DOM).
 * Overworld stamps (cottage / shop / hall) own the doors; each maps to a small
 * room plan with furniture and, when the town has someone to spare, an occupant.
 */
import art from '../../data/art/settlements.json';
import lines from '../../data/dialogue/interior-lines.json';
import { TILE_PX } from './constants';
import type { LayoutSettlement } from './world-layout';
import { paletteIndexOf, townPlan } from './town-plan';

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
  /** `${townId}:${slot}` (town-plan slot: `inn`, `house-2`, ...) — stable across plan tweaks and saves. */
  id: string;
  /** The pre-slot id, `${townId}:${planIndex}`: only for adopting per-building flags from older saves (building-ids.ts). */
  legacyId: string;
  townId: string;
  kind: InteriorKind;
  stampType: string;
  /** World pixel position of the door threshold (matches the painted stamp's door). */
  door: Pt;
  /** Index into the settlement art palettes — same pick the overworld stamp uses, so wall colours match. */
  paletteIndex: number;
};

/**
 * Enterable buildings of one settlement, in plan order (sim/map/town-plan — the same plan the
 * overworld painter stamps, so every door is on a painted building). Ids name the plan's slot,
 * so a reordered or re-placed plan keeps each building's id (and the lantern lit in it).
 */
export function townBuildings(town: LayoutSettlement): Building[] {
  const plan = townPlan(town);
  const fx = town.q * TILE_PX + TILE_PX / 2;
  const fy = town.r * TILE_PX + TILE_PX;
  const out: Building[] = [];
  plan.buildings.forEach((b, i) => {
    const kind = interiorKindOf(b.type, b.interior);
    if (!kind) return;
    out.push({ id: `${town.id}:${b.slot}`, legacyId: `${town.id}:${i}`, townId: town.id, kind, stampType: b.type, door: { x: Math.round(fx + b.q * TILE_PX), y: Math.round(fy + b.r * TILE_PX) }, paletteIndex: paletteIndexOf(town, i) });
  });
  return out;
}

export const allBuildings = (towns: LayoutSettlement[]): Building[] => towns.flatMap((t) => townBuildings(t));

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
  | 'counter' | 'armchair' | 'window' | 'sign' | 'lantern'
  // Occupant swaps: trade pieces, then wound tells.
  | 'anvil' | 'loom' | 'sacks' | 'pots' | 'tools' | 'herbs' | 'net'
  | 'candle' | 'covered' | 'clutter' | 'litter' | 'stack' | 'shutters';

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
  /** Hearths and candles: gone cold (default burning). */
  unlit?: boolean;
};

/** Who lives here, as far as the room can show it. All optional: an unknown occupant keeps the bare base plan. */
export type Occupant = { jobId?: string; woundId?: string; flame?: number };

export type InteriorPlan = {
  kind: InteriorKind;
  /** Which of the kind's base plans (0..n-1) this building uses. */
  variant: number;
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

/**
 * A base plan plus two free spots the occupant may fill: `work` (a 2x1 floor gap for a trade piece)
 * and `nook` (one floor tile for a wound tell). Both sit off every path in the base plan.
 */
type Base = Omit<InteriorPlan, 'kind' | 'mirrored' | 'accent' | 'variant'> & { work?: { col: number; row: number }; nook?: { col: number; row: number } };

const PLANS: Record<InteriorKind, Base[]> = {
  house: [
    { // the family cottage: bed in the corner, hearth on the back wall, table on a rug
      cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 8, row: 4 }, work: { col: 9, row: 4 }, nook: { col: 1, row: 3 },
      furniture: [
        deco('window', 2, 2), deco('window', 7, 2),
        f('bed', 1, 0, 2, 2), f('hearth', 5, 0, 2, 1), f('books', 9, 0, 2, 1),
        rug(4, 2, 4, 3), f('table', 5, 3, 2, 2), f('stool', 4, 3), f('stool', 7, 3),
        f('chest', 1, 5), f('plant', 10, 5), f('lantern', 10, 2),
      ],
    },
    { // the one-room hut: small, hearth and armchair, the bed tucked away opposite
      cols: 10, rows: 6, doorCol: 4, spawn: { col: 4, row: 5 }, npc: { col: 2, row: 2 }, work: { col: 5, row: 1 }, nook: { col: 3, row: 1 },
      furniture: [
        deco('window', 4, 2),
        f('hearth', 1, 0, 2, 1), f('bed', 7, 0, 2, 2), rug(1, 1, 3, 2), f('armchair', 1, 2),
        f('table', 5, 3, 2, 1), f('stool', 7, 3), f('chest', 9, 3), f('lantern', 0, 5), f('plant', 9, 5),
      ],
    },
    { // the long house: books at the door end, hearth mid-wall, the bed in its own corner
      cols: 14, rows: 7, doorCol: 4, spawn: { col: 4, row: 6 }, npc: { col: 10, row: 3 }, work: { col: 8, row: 5 }, nook: { col: 5, row: 2 },
      furniture: [
        deco('window', 1, 2), deco('window', 9, 2),
        f('books', 1, 0, 3, 1), f('hearth', 6, 0, 2, 1), f('bed', 12, 0, 2, 2), f('chest', 12, 2),
        rug(5, 1, 4, 3), f('armchair', 6, 2), f('table', 1, 3, 2, 2), f('stool', 3, 3), f('stool', 1, 5),
        f('lantern', 10, 1), f('barrel', 0, 6), f('plant', 13, 6),
      ],
    },
    { // the narrow house: deep rather than wide, the table on a big rug at its heart
      cols: 9, rows: 8, doorCol: 4, spawn: { col: 4, row: 7 }, npc: { col: 6, row: 3 }, work: { col: 0, row: 5 }, nook: { col: 7, row: 5 },
      furniture: [
        deco('window', 5, 2),
        f('books', 0, 0, 2, 1), f('hearth', 3, 0, 2, 1), f('bed', 7, 0, 2, 2),
        rug(2, 2, 5, 3), f('table', 3, 3, 2, 1), f('stool', 2, 3),
        f('chest', 0, 3), f('lantern', 8, 3), f('plant', 0, 7), f('crate', 8, 7),
      ],
    },
  ],
  shop: [
    { // the general store: shelves either side, a long counter across the middle
      cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 5, row: 1 }, work: { col: 8, row: 4 }, nook: { col: 10, row: 1 },
      furniture: [
        deco('sign', 5, 2), deco('window', 4), deco('window', 7),
        f('shelf', 1, 0, 3, 1), f('shelf', 8, 0, 3, 1),
        f('counter', 3, 2, 6, 1),
        rug(4, 4, 4, 2),
        f('crate', 1, 4), f('crate', 2, 4), f('crate', 1, 5), f('barrel', 10, 4), f('barrel', 10, 5), f('plant', 10, 2),
      ],
    },
    { // the corner stall: small, the counter off to one side with the keeper behind it
      cols: 10, rows: 6, doorCol: 5, spawn: { col: 5, row: 5 }, npc: { col: 7, row: 1 }, work: { col: 1, row: 2 }, nook: { col: 5, row: 0 },
      furniture: [
        deco('window', 1), deco('sign', 6, 2),
        f('shelf', 0, 0, 3, 1), f('plant', 3, 0), f('shelf', 7, 0, 3, 1),
        f('counter', 5, 2, 5, 1), rug(2, 3, 4, 2),
        f('crate', 0, 3), f('crate', 0, 4), f('crate', 1, 4), f('barrel', 9, 4), f('barrel', 9, 5),
      ],
    },
    { // the market hall: the counter in the back corner, goods laid out on a display table
      cols: 13, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 2, row: 2 }, work: { col: 8, row: 1 }, nook: { col: 3, row: 1 },
      furniture: [
        deco('window', 5), deco('sign', 8, 2), deco('window', 11),
        f('shelf', 0, 0, 4, 1), f('plant', 5, 0), f('shelf', 8, 0, 4, 1),
        f('counter', 0, 3, 4, 1), f('lantern', 5, 2), f('table', 7, 3, 2, 1), rug(6, 4, 4, 2),
        f('crate', 11, 3), f('crate', 12, 3), f('crate', 12, 4), f('barrel', 11, 6), f('barrel', 12, 6),
      ],
    },
  ],
  office: [
    { // the ledger office: shelves of books along the back, the clerk's counter, a reading table
      cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 6, row: 1 }, nook: { col: 11, row: 2 },
      furniture: [
        deco('sign', 5, 2), deco('window', 2), deco('window', 9),
        f('books', 1, 0, 3, 1), f('books', 8, 0, 3, 1), f('shelf', 4, 0, 1, 1),
        f('counter', 4, 2, 5, 1), f('lantern', 9, 2),
        rug(3, 4, 6, 2), f('table', 2, 4, 2, 1), f('stool', 1, 4), f('chest', 10, 5), f('crate', 10, 4), f('plant', 1, 2),
      ],
    },
    { // the clerk's room: a short counter in the corner, one reading table
      cols: 10, rows: 6, doorCol: 5, spawn: { col: 5, row: 5 }, npc: { col: 2, row: 1 }, nook: { col: 9, row: 2 },
      furniture: [
        deco('window', 4), deco('sign', 6, 2),
        f('books', 0, 0, 3, 1), f('books', 6, 0, 4, 1),
        f('counter', 0, 2, 4, 1), rug(1, 3, 3, 2), f('table', 6, 3, 2, 2), f('stool', 8, 3),
        f('chest', 9, 5), f('plant', 0, 5),
      ],
    },
    { // the records hall: deep, walled in books, two reading tables before the counter
      cols: 12, rows: 8, doorCol: 6, spawn: { col: 6, row: 7 }, npc: { col: 6, row: 2 }, nook: { col: 10, row: 2 },
      furniture: [
        deco('window', 2), deco('sign', 5, 2), deco('window', 9),
        f('books', 0, 0, 4, 1), f('shelf', 4, 0, 1, 1), f('books', 8, 0, 4, 1),
        f('counter', 4, 3, 5, 1), f('lantern', 0, 2), f('chest', 11, 2),
        f('table', 1, 5, 2, 1), f('stool', 0, 5), f('table', 9, 5, 2, 1), f('stool', 11, 5), rug(4, 5, 4, 2),
        f('crate', 0, 7), f('plant', 11, 7),
      ],
    },
  ],
  inn: [
    { // the common room: hearth and armchairs left, the bar right, tables between
      cols: 14, rows: 7, doorCol: 7, spawn: { col: 7, row: 6 }, npc: { col: 10, row: 0 }, nook: { col: 5, row: 2 },
      furniture: [
        deco('window', 4, 2), deco('sign', 6, 2), deco('shelf', 9, 4),
        f('hearth', 1, 0, 3, 1), rug(1, 1, 4, 2), f('armchair', 1, 2), f('armchair', 4, 2),
        f('counter', 8, 1, 5, 1), f('stool', 9, 2), f('stool', 11, 2),
        f('table', 7, 3, 2, 2), f('stool', 6, 3), f('stool', 9, 3),
        f('table', 2, 5, 2, 1), f('stool', 1, 5), f('stool', 4, 5),
        f('barrel', 12, 5), f('barrel', 13, 5), f('plant', 13, 3), f('lantern', 6, 1),
      ],
    },
    { // the roadside tavern: the bar in the back-left corner, the fire opposite
      cols: 12, rows: 7, doorCol: 6, spawn: { col: 6, row: 6 }, npc: { col: 2, row: 0 }, nook: { col: 11, row: 3 },
      furniture: [
        deco('shelf', 0, 4), deco('sign', 5, 2), deco('window', 11),
        f('counter', 0, 1, 4, 1), f('stool', 1, 2), f('stool', 3, 2), f('lantern', 5, 1),
        f('hearth', 8, 0, 3, 1), rug(7, 1, 5, 2), f('armchair', 7, 2), f('armchair', 10, 2),
        f('table', 2, 4, 2, 2), f('stool', 1, 4), f('stool', 4, 4),
        f('table', 8, 4, 2, 1), f('stool', 7, 4), f('stool', 10, 4),
        f('barrel', 0, 6), f('barrel', 1, 6), f('plant', 11, 6),
      ],
    },
    { // the great hall: wide and deep, the bar centred under the sign, the fire in its own corner
      cols: 16, rows: 8, doorCol: 8, spawn: { col: 8, row: 7 }, npc: { col: 8, row: 1 }, nook: { col: 4, row: 3 },
      furniture: [
        deco('window', 4, 2), deco('sign', 7, 2), deco('window', 11, 2),
        f('hearth', 1, 0, 3, 1), rug(0, 1, 5, 2), f('armchair', 1, 2), f('armchair', 3, 2),
        f('counter', 6, 2, 5, 1), f('stool', 7, 3), f('stool', 9, 3), f('lantern', 11, 1),
        f('barrel', 12, 0), f('barrel', 13, 0), f('shelf', 14, 0, 2, 1),
        f('table', 12, 4, 2, 2), f('stool', 11, 4), f('stool', 14, 4),
        f('table', 1, 5, 2, 1), f('stool', 0, 5), f('stool', 3, 5),
        f('table', 5, 5, 2, 1), f('stool', 5, 6), f('stool', 6, 6),
        f('barrel', 0, 7), f('barrel', 1, 7), f('plant', 15, 7),
      ],
    },
  ],
};

/** How many base plans a kind has (for checks and dev probes). */
export const planCount = (kind: InteriorKind): number => PLANS[kind].length;

/** Trade pieces: floor pieces fill the work spot left to right; a wall piece replaces the first window. */
const TRADE: Record<string, { floor?: FurnitureType[]; wall?: FurnitureType }> = {
  smith: { floor: ['anvil'], wall: 'tools' },
  weaver: { floor: ['loom'] },
  ropemaker: { floor: ['loom'] },
  herbalist: { floor: ['pots'], wall: 'herbs' },
  potter: { floor: ['pots', 'pots'] },
  baker: { floor: ['sacks', 'barrel'] },
  miller: { floor: ['sacks', 'sacks'] },
  farmer: { floor: ['sacks'], wall: 'tools' },
  fisher: { floor: ['barrel'], wall: 'net' },
  mason: { floor: ['crate'], wall: 'tools' },
  miner: { floor: ['crate'], wall: 'tools' },
  woodcutter: { floor: ['crate'], wall: 'tools' },
};
/**
 * Flame below this (0..100): the hearth is let go cold and the candle unlit. Folk start around 5-20 and
 * burn at 35, so only the nearly-out keep a cold room; relighting someone warms their hearth again.
 */
const COLD_FLAME = 10;
/** Wound tells set in the nook tile. */
const NOOK_TELL: Record<string, FurnitureType> = { grief: 'covered', apathy: 'clutter', disillusionment: 'stack' };

const hashOf = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** Spawn clear, seat and exit-mat tile reachable from it, and no sealed pocket of open floor anywhere. */
export function planIsValid(plan: InteriorPlan): boolean {
  const solid = solidTiles(plan);
  if (solid.has(`${plan.spawn.col},${plan.spawn.row}`)) return false;
  const reach = reachableTiles(plan);
  return reach.size + solid.size === plan.cols * plan.rows
    && reach.has(`${plan.npc.col},${plan.npc.row}`) && reach.has(`${plan.doorCol},${plan.rows - 1}`);
}

/** The occupant's swaps on an unmirrored base plan. Solids only go into the base's kept-free spots. */
function furnish(b: Base, occ: Occupant, h: number): Furniture[] {
  const out = b.furniture.map((o) => ({ ...o }));
  // Trades show only where the plan keeps a work spot (homes and shops; an inn or office is not a workshop).
  const work = b.work;
  const trade = occ.jobId && work ? TRADE[occ.jobId] : undefined;
  if (trade?.floor && work) {
    if (trade.floor[0] === 'loom') out.push(f('loom', work.col, work.row, 2, 1));
    else trade.floor.forEach((t, i) => out.push(f(t, work.col + i, work.row)));
  }
  const win = out.find((o) => o.type === 'window');
  if (trade?.wall && win) win.type = trade.wall;
  const w = occ.woundId;
  if (w === 'fear') for (const o of out) if (o.type === 'window') o.type = 'shutters';
  const cold = occ.flame !== undefined && occ.flame < COLD_FLAME;
  if (cold) for (const o of out) if (o.type === 'hearth') o.unlit = true;
  // A candle on the first table whenever someone is home: lit, unless the room grieves or has let go.
  const table = out.find((o) => o.type === 'table');
  if (table && (w || occ.flame !== undefined || occ.jobId)) out.push({ ...f('candle', table.col, table.row, 1, table.h, false), ...(w === 'grief' || cold ? { unlit: true } : {}) });
  const tell = w ? NOOK_TELL[w] : undefined;
  if (tell && b.nook) out.push(f(tell, b.nook.col, b.nook.row));
  if (w === 'apathy' || w === 'exhaustion') {
    // Litter on two open floor tiles: underfoot, never in the way (not solid).
    const taken = new Set<string>([`${b.npc.col},${b.npc.row}`]);
    for (const o of out) if (!o.wall) for (let dc = 0; dc < o.w; dc++) for (let dr = 0; dr < o.h; dr++) taken.add(`${o.col + dc},${o.row + dr}`);
    const open: { col: number; row: number }[] = [];
    for (let row = 1; row < b.rows - 1; row++) for (let col = 0; col < b.cols; col++) if (!taken.has(`${col},${row}`) && col !== b.doorCol) open.push({ col, row });
    for (let i = 0; i < 2 && open.length; i++) {
      const p = open.splice((h >>> (7 + i * 5)) % open.length, 1)[0]!;
      out.push(f('litter', p.col, p.row, 1, 1, false));
    }
  }
  return out;
}

/**
 * Deterministic room plan: same kind + seed string (+ occupant) -> same room. The building id picks one of
 * the kind's base plans, the mirroring and the accent; what is known of the occupant swaps furniture in.
 */
export function interiorPlan(kind: InteriorKind, seedKey: string, occupant: Occupant = {}): InteriorPlan {
  const h = hashOf(seedKey);
  const bases = PLANS[kind];
  // High bits of a second hash: FNV's low bits over a shared prefix track `h`'s, which would tie plan to mirror.
  const variant = (hashOf(`${seedKey}|plan`) >>> 13) % bases.length;
  const b = bases[variant]!;
  const mirrored = kind !== 'inn' && (h & 1) === 1;
  const flip = <T extends { col: number }>(o: T, w = 1): T => ({ ...o, col: b.cols - o.col - w });
  const make = (furniture: Furniture[]): InteriorPlan => ({
    kind, variant, cols: b.cols, rows: b.rows, doorCol: mirrored ? b.cols - b.doorCol - 1 : b.doorCol,
    mirrored,
    accent: (h >>> 3) % 3,
    furniture: mirrored ? furniture.map((o) => flip(o, o.w)) : furniture,
    npc: mirrored ? flip(b.npc) : { ...b.npc },
    spawn: mirrored ? flip(b.spawn) : { ...b.spawn },
  });
  const plan = make(furnish(b, occupant, h));
  // Swaps only fill spots kept clear in the base; should one ever close a path, show the bare room instead.
  return planIsValid(plan) ? plan : make(b.furniture.map((o) => ({ ...o })));
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
