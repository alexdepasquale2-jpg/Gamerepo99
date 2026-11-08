/**
 * Procedural town layout — one pure, seeded plan per settlement. Both the sim's doors
 * (interiors.townBuildings) and the painter (world/settlements) read this plan, so the
 * doors always sit on the painted buildings. Rules (counts, stamp weights, spacing) live
 * in data/art/settlements.json; everything here is tile offsets from the centre tile's foot.
 */
import art from '../../data/art/settlements.json';
import { deriveRng, type Rng } from '../rng';
import { bresenhamLine } from './corridor';
import type { LayoutRoute, LayoutSettlement } from './world-layout';

export type TileOff = { q: number; r: number };
/**
 * `slot` is the building's stable name inside its town: its role (house / shop / inn / office / tower)
 * plus an ordinal among the town's wanted buildings of that role (`inn`, `house`, `house-2`, ...).
 * Building ids are `${townId}:${slot}`, so they survive placement tweaks that move, reorder or drop lots.
 * Required buildings' slots depend only on the required list; the random fill is named in draw order, so
 * changing a rule's count or stamp weights can rename those (not their required neighbours).
 */
export type PlanBuilding = TileOff & { type: string; interior?: string; slot: string };
export type StreetAxis = 'h' | 'v' | 'd';
export type TownPlan = {
  axis: StreetAxis;
  /** Door feet (bottom-centre of each stamp). Ids come from each entry's `slot`, not its index. */
  buildings: PlanBuilding[];
  /** Index of the building whose chimney smokes. */
  main: number;
  gardens: TileOff[];
  fences: TileOff[];
  walls: TileOff[];
  hearth: TileOff; board: TileOff; signpost: TileOff; stall: TileOff; chest: TileOff; well: TileOff; spawn: TileOff;
  /** Grave 0's foot; later graves fill a 4-wide yard from here. */
  graves: TileOff;
};

type Kind = keyof typeof art.rules;
type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Stamp footprints in tiles (64x72 textures at 2x over 32px tiles; generous so roofs never touch). */
const FOOT: Record<string, { w: number; h: number }> = {
  cottage: { w: 3.6, h: 3.8 }, shop: { w: 3.8, h: 3.8 }, hall: { w: 4.4, h: 4.2 }, tower: { w: 2.2, h: 4.4 },
  garden: { w: 3.2, h: 1.6 }, fence: { w: 4, h: 1.4 }, wall: { w: 4, h: 2.2 },
};
/** Stamps the building art can draw; rules naming anything else are ignored. */
const STAMPS = new Set(['cottage', 'shop', 'hall', 'tower']);
/** A stamp's role for slot names, like interiors.interiorKindOf: a layout `interior` wins (any name: it only has to be stable). */
const ROLE: Record<string, string> = { cottage: 'house', shop: 'shop', hall: 'inn', tower: 'tower' };
/** Everything stays this far inside the 13-tile town box terrain-access calls inTown. */
const LIMIT = 11;
/** Furniture around a plaza on a street running across (wide) or along (tall) the screen. */
const PLAZA = {
  wide: { rect: [-4.6, -0.4, 4.6, 3.8], hearth: [1.6, 2.1], board: [-3.5, 3.2], signpost: [3.5, 3.2], stall: [-2.2, 2.6], chest: [0.3, 0.6], well: [-1.7, 1.6], spawn: [0, 2] },
  tall: { rect: [-2.8, -2.6, 2.8, 5], hearth: [0.5, 1.6], board: [-1.9, 4.3], signpost: [1.9, 4.6], stall: [1.8, -0.9], chest: [-0.4, -0.2], well: [-1.6, -1.6], spawn: [0, 3] },
} as const;

/**
 * Default plan seed when a caller has no world seed: settlement positions are themselves
 * seed-derived, so hashing the spot gives each world (and each district) its own towns while
 * every caller (folk, interiors, painter) lands on the same plan without threading a seed.
 */
export const townSeed = (town: LayoutSettlement): number => (Math.imul(town.q | 0, 73856093) ^ Math.imul(town.r | 0, 19349663)) >>> 0;

/** Graveyard: GRAVE_COLS x GRAVE_ROWS plots; later graves lie between earlier ones, inside the same yard. */
const GRAVE_COLS = 4, GRAVE_ROWS = 3, GRAVE_STEP = { q: 0.9, r: 0.8 };
/** How far south a graveyard steps when roads cross both of its usual spots (stays inside the town box). */
const GRAVE_SOUTH = 3.5;
export function graveOff(plan: TownPlan, n: number): TileOff {
  const layer = Math.floor(n / (GRAVE_COLS * GRAVE_ROWS)) % 2, k = n % (GRAVE_COLS * GRAVE_ROWS);
  return { q: plan.graves.q + (k % GRAVE_COLS) * GRAVE_STEP.q + layer * GRAVE_STEP.q / 2, r: plan.graves.r + Math.floor(k / GRAVE_COLS) * GRAVE_STEP.r + layer * GRAVE_STEP.r / 2 };
}

/** Wall/roof palette of a town's i-th plan building — shared by the painter and the room inside. */
export function paletteIndexOf(town: LayoutSettlement, i: number): number {
  let h = 0;
  for (const c of town.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h + i) % art.palettes.length;
}

/** Clear verge kept either side of a road tile, so a track runs into town between buildings, not under them. */
const LANE_VERGE = 0.25;

/**
 * Road tiles inside a town's box, as offsets from its centre (the same Bresenham cells the road raster paints,
 * stamp-raster buildRoads), sorted so the plan cache key is stable. Any route crossing the box counts, not only
 * the ones that end here.
 */
export function townLanes(town: LayoutSettlement, routes: readonly LayoutRoute[]): TileOff[] {
  const seen = new Set<string>(), out: TileOff[] = [];
  const reach = LIMIT + 2;
  for (const route of routes) for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    // Skip segments whose bounding box misses the town box before tracing them.
    if (Math.max(a.q, b.q) < town.q - reach - 1 || Math.min(a.q, b.q) > town.q + reach + 1 || Math.max(a.r, b.r) < town.r - reach - 1 || Math.min(a.r, b.r) > town.r + reach + 1) continue;
    for (const c of bresenhamLine(Math.round(a.q), Math.round(a.r), Math.round(b.q), Math.round(b.r))) {
      const q = c.q - town.q, r = c.r - town.r, k = `${q},${r}`;
      if (Math.abs(q) > reach || Math.abs(r) > reach || seen.has(k)) continue;
      seen.add(k); out.push({ q, r });
    }
  }
  return out.sort((x, y) => x.r - y.r || x.q - y.q);
}

/** A road tile's footprint in plan space (offsets are from the centre tile's foot: a tile spans y in [r-1, r]). */
const laneRect = (c: TileOff, verge = LANE_VERGE): Rect => pad({ x0: c.q - 0.5, y0: c.r - 1, x1: c.q + 0.5, y1: c.r }, verge);
const laneKeys = new WeakMap<LayoutSettlement, string>();
const laneKey = (town: LayoutSettlement): string => {
  let k = laneKeys.get(town);
  if (k === undefined) laneKeys.set(town, (k = (town.lanes ?? []).map((c) => `${c.q},${c.r}`).join(';')));
  return k;
};

const cache = new Map<string, TownPlan>();

export function townPlan(town: LayoutSettlement, seed = townSeed(town)): TownPlan {
  const key = `${seed}|${town.id}|${town.kind ?? 'village'}|${laneKey(town)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const plan = makePlan(town, seed);
  if (cache.size > 512) cache.clear();
  cache.set(key, plan);
  return plan;
}

function makePlan(town: LayoutSettlement, seed: number): TownPlan {
  const rng = deriveRng(seed, 'town-plan', town.id);
  const kind = ((town.kind ?? 'village') in art.rules ? town.kind ?? 'village' : 'village') as Kind;
  const rule = art.rules[kind];
  const axis: StreetAxis = (['h', 'v', 'd'] as const)[rng.int(0, 3)]!;
  const tall = axis === 'v';
  const flip = rng.next() < 0.5 ? -1 : 1;
  // Street direction: across, along, or a gentle slope (still on the tile grid, just stepped).
  const slope = axis === 'd' ? (rng.next() < 0.5 ? -0.45 : 0.45) : 0;
  const shift = Math.round((rng.next() * 2 - 1) * 2) / 2; // the plaza slides a little along the street
  const pz = tall ? PLAZA.tall : PLAZA.wide;
  const px = tall ? 0 : shift, py = tall ? shift : 0;
  const at = (p: readonly [number, number]): TileOff => ({ q: round(px + p[0] * flip), r: round(py + p[1]) });
  const taken: Rect[] = [rectOf(pz.rect, px, py, flip)];
  // Graveyard: a small yard beside the plaza, on the side the dice pick.
  const gSide = rng.next() < 0.5 ? -1 : 1;
  // Road tiles (and a verge) are kept clear of everything placed below; plaza furniture may stand by the road.
  const lanes = (town.lanes ?? []).map((c) => laneRect(c));
  const onLane = (r: Rect): boolean => lanes.some((l) => hits(r, l));
  const graveAt = (side: number): TileOff => tall ? { q: side > 0 ? 3.6 : -6.6, r: round(py + 3) } : { q: side > 0 ? round(px + 5.6) : round(px - 8.3), r: 3.6 };
  const yardOf = (g: TileOff): Rect => ({ x0: g.q - 0.6, y0: g.r - 1.2, x1: g.q + (GRAVE_COLS - 1) * GRAVE_STEP.q + 0.6, y1: g.r + (GRAVE_ROWS - 1) * GRAVE_STEP.r + 0.6 });
  // A road through the yard the dice picked moves it to the plaza's other side, then a row further south (no extra roll).
  const yards = [graveAt(gSide), graveAt(-gSide)].flatMap((g) => [g, { q: g.q, r: round(g.r + GRAVE_SOUTH) }]);
  const graves = [yards[0]!, yards[2]!, yards[1]!, yards[3]!].find((g) => !onLane(yardOf(g))) ?? yards[0]!;
  taken.push(yardOf(graves));
  // A city's wall runs along its back (north) edge; reserve the band before the buildings go in.
  const walls: TileOff[] = [];
  const nWall = rng.int(rule.wall[0]!, rule.wall[1]! + 1);
  const wx = Math.round((rng.next() * 2 - 1) * Math.max(0, LIMIT - 2 - nWall * 2)) / 2;
  for (let i = 0; i < nWall; i++) {
    const w = { q: wx + (i - (nWall - 1) / 2) * 4, r: -LIMIT - 1 + FOOT.wall!.h };
    if (!onLane(footRect('wall', w))) walls.push(w); // a road through the wall line leaves a gate gap
  }
  for (const w of walls) taken.push(footRect('wall', w));
  const solid = taken.length; // everything after this index is a building lot
  taken.push(...lanes);
  const offLanes = (): Rect[] => taken.filter((_, k) => k < solid || k >= solid + lanes.length);

  const want: { type: string; interior?: string; slot?: string }[] = rule.required.filter((b) => STAMPS.has(b.type)).map((b) => ({ ...b }));
  const total = Math.max(want.length, rng.int(rule.count[0]!, rule.count[1]! + 1));
  const weights = Object.entries(rule.stamps).filter(([t]) => STAMPS.has(t));
  while (want.length < total && weights.length) want.push({ type: pick(rng, weights) });
  // Slots are dealt over the wanted list, before placement: a lot that fails to place leaves a gap
  // rather than renumbering the rest, and placement changes never touch them.
  const perRole = new Map<string, number>();
  for (const b of want) {
    const role = b.interior ?? ROLE[b.type] ?? b.type;
    const n = (perRole.get(role) ?? 0) + 1;
    perRole.set(role, n);
    b.slot = n === 1 ? role : `${role}-${n}`;
  }

  const buildings: PlanBuilding[] = [];
  const nRequired = rule.required.length;
  for (const [i, b] of want.entries()) {
    // A required stamp (the inn, the ledger office) that finds no lot squeezes in with no gap.
    const spot = placeBuilding(rng, b.type, taken, tall, slope, px, py, pz.rect, flip, rule.spacing, i === 0)
      // Roads take lots, so with a road in town an ordinary house may squeeze in too (footprints are generous).
      ?? (i < nRequired || lanes.length ? placeBuilding(rng, b.type, taken, tall, slope, px, py, pz.rect, flip, 0, false) : null)
      // Then drop the verges (the road tiles themselves stay clear), and only then the roads, rather than lose the inn or office.
      ?? (i < nRequired && lanes.length ? placeBuilding(rng, b.type, [...offLanes(), ...(town.lanes ?? []).map((c) => laneRect(c, 0))], tall, slope, px, py, pz.rect, flip, 0, false) : null)
      ?? (i < nRequired && lanes.length ? placeBuilding(rng, b.type, offLanes(), tall, slope, px, py, pz.rect, flip, 0, false) : null);
    if (!spot) continue;
    buildings.push({ ...b, slot: b.slot!, ...spot });
    taken.push(pad(footRect(b.type, spot), rule.spacing));
  }
  const hall = buildings.findIndex((b) => b.type === 'hall');
  const main = hall >= 0 ? hall : Math.max(0, buildings.findIndex((b) => b.type !== 'tower'));

  // Kitchen gardens beside the dwellings, each with a fence along its front.
  const gardens: TileOff[] = [], fences: TileOff[] = [];
  const nGarden = rng.int(rule.gardens[0]!, rule.gardens[1]! + 1);
  for (const b of buildings) {
    if (gardens.length >= nGarden) break;
    if (b.type === 'tower' || b.type === 'hall') continue;
    const side = rng.next() < 0.5 ? -1 : 1;
    for (const s of [side, -side]) {
      const g = { q: round(b.q + s * (FOOT[b.type]!.w / 2 + FOOT.fence!.w / 2 + rule.spacing + 0.1)), r: round(b.r - 0.4) };
      const f = { q: g.q, r: round(g.r + 0.5) };
      const rects = [footRect('garden', g), footRect('fence', f)];
      if (!rects.every((r) => inBox(r) && !taken.some((t) => hits(r, t)))) continue;
      gardens.push(g); fences.push(f); taken.push(...rects);
      break;
    }
  }
  return {
    axis, buildings, main, gardens, fences, walls, graves,
    hearth: at(pz.hearth), board: at(pz.board), signpost: at(pz.signpost), stall: at(pz.stall), chest: at(pz.chest), well: at(pz.well), spawn: at(pz.spawn),
  };
}

/**
 * Try lots along the street, nearest the plaza first: on a wide street the stamp sits on the
 * north kerb (door on the street), a back lane behind it, or south of the plaza; on a tall
 * street it flanks either side. The head building (the hall) always fronts the plaza.
 */
function placeBuilding(rng: Rng, type: string, taken: Rect[], tall: boolean, slope: number, px: number, py: number, plaza: readonly number[], flip: number, gap: number, head: boolean): TileOff | null {
  const f = FOOT[type]!;
  for (let a = 0; a < 120; a++) {
    const reach = Math.min(LIMIT - 1, (head ? 1 : 3) + a * 0.2);
    const t = (rng.next() * 2 - 1) * reach;
    const lot = head ? 0 : rng.next(), south = lot > 0.7, back = lot > 0.55 && !south;
    let q: number, r: number;
    if (tall) {
      const side = rng.next() < 0.5 ? -1 : 1;
      q = side * (plaza[2]! + f.w / 2 + 0.3 + rng.next() * 0.8);
      r = py + t + f.h / 2;
    } else {
      q = px + t;
      const street = py + plaza[1]! + slope * t * flip;
      r = south ? py + plaza[3]! + f.h + 0.6 + rng.next() : street - 0.2 - rng.next() * 0.6 - (back ? 4.8 : 0);
    }
    const spot = { q: round(q), r: round(r) };
    const rect = footRect(type, spot);
    if (inBox(rect) && !taken.some((x) => hits(pad(rect, gap / 2), x))) return spot;
  }
  return null;
}

const round = (v: number): number => Math.round(v * 10) / 10;
const footRect = (type: string, p: TileOff): Rect => {
  const f = FOOT[type]!;
  return { x0: p.q - f.w / 2, y0: p.r - f.h, x1: p.q + f.w / 2, y1: p.r };
};
const rectOf = (r: readonly number[], dx: number, dy: number, flip: number): Rect => {
  const a = r[0]! * flip + dx, b = r[2]! * flip + dx;
  return { x0: Math.min(a, b), y0: r[1]! + dy, x1: Math.max(a, b), y1: r[3]! + dy };
};
const pad = (r: Rect, p: number): Rect => ({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p });
const hits = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inBox = (r: Rect): boolean => r.x0 >= -LIMIT && r.x1 <= LIMIT && r.y0 >= -LIMIT - 1 && r.y1 <= LIMIT;
function pick(rng: Rng, weights: [string, number][]): string {
  let x = rng.next() * weights.reduce((s, [, w]) => s + w, 0);
  for (const [t, w] of weights) if ((x -= w) < 0) return t;
  return weights[weights.length - 1]![0];
}
