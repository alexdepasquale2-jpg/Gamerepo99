/**
 * Villager records grouped by town: who lives where (one resident per enterable building, sim/map/residency),
 * where each one's home, work and gathering spots are, and where the day's schedule wants them now.
 * No Phaser here; people.ts draws and walks them.
 */
import type { GameContext, Pt } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { townBuildings, type Building } from '../sim/map/interiors';
import { houseNewcomers, placeAt, scheduledBuilding } from '../sim/map/residency';
import type { LayoutSettlement, SettlementKind } from '../sim/map/world-layout';
import type { Figure } from './figure';
import { villagerLook, type PersonLook } from './looks';
import type { MarkTell } from './marks';
import { hash } from './paint';
import { footOf } from './towns';

export type Villager = {
  id: string;
  name: string;
  first: string;
  townId: string;
  pl: PersonLook;
  x: number;
  y: number;
  /** Outdoor home spot (their door step when housed). */
  home: Pt;
  target: Pt;
  path: Pt[];
  nextPick: number;
  entering: string | null;
  enteringMs: number;
  inside: Building | null;
  moving: boolean;
  tell: MarkTell | null;
  leader: boolean;
  fig?: Figure;
};

export type Folk = {
  town: LayoutSettlement;
  kind: SettlementKind;
  centre: Pt;
  buildings: Building[];
  /** Resident id -> their building (stable across days; newcomers take free ones). */
  homes: Map<string, Building>;
  people: Villager[];
  active: boolean;
  work: Pt[];
  gather: Pt | null;
};

export type PersonRow = { id: string; name?: string; townId?: string; age?: number; tags?: string[] };

export const doorStep = (b: Building): Pt => ({ x: b.door.x, y: b.door.y + 12 });

export const prettyId = (id: string): string =>
  id.split(/[_-]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

/** Snap a point onto walkable footing near it (people never aim at water). */
export function footing(ctx: GameContext, p: Pt, radius = 6): Pt {
  const nav = ctx.world.nav;
  if (nav.walkableAt(p.x, p.y)) return p;
  const t = nav.tileAt(p.x, p.y);
  const s = nav.snap(t.q, t.r, radius);
  if (!s) return p;
  const c = nav.centerOf(s.q, s.r);
  return { x: c.x, y: c.y + TILE_PX * 0.4 };
}

export function makeFolk(town: LayoutSettlement): Folk {
  return { town, kind: town.kind ?? 'village', centre: footOf(town.q, town.r), buildings: townBuildings(town), homes: new Map(), people: [], active: false, work: [], gather: null };
}

export function makeVillager(ctx: GameContext, row: PersonRow, folk: Folk, slot: number): Villager {
  const name = row.name ?? prettyId(row.id);
  const pl = villagerLook(row, folk.kind, ctx.seed);
  const h = hash(row.id);
  const ang = ((slot * 2.399 + (h % 100) / 100) % (Math.PI * 2)) + 0.4;
  const rad = TILE_PX * (2.4 + (slot % 3) * 1.1 + ((h >> 8) % 5) * 0.15);
  const home = { x: folk.centre.x + Math.cos(ang) * rad, y: folk.centre.y + 20 + Math.abs(Math.sin(ang)) * rad * 0.7 };
  return {
    id: row.id, name, first: name.split(' ')[0]!, townId: folk.town.id, pl,
    x: home.x, y: home.y, home, target: { ...home }, path: [], nextPick: (h % 4000) / 1000,
    entering: null, enteringMs: 0, inside: null, moving: false, tell: null, leader: false,
  };
}

/** Re-deal homes after arrivals and departures; housed folk wait at their own door. */
export function rehouse(folk: Folk): void {
  houseNewcomers(folk.homes, folk.buildings, folk.people.map((p) => p.id));
  for (const v of folk.people) {
    const b = folk.homes.get(v.id);
    if (b) v.home = doorStep(b);
  }
}

/** Work and gathering spots: the town's nodes and facilities, its hearth or board; else a ring around it. */
export function findSpots(ctx: GameContext, folk: Folk): void {
  if (folk.gather) return;
  let things: { kind: string; x: number; y: number }[] = [];
  try { things = ctx.world.things(folk.centre, TILE_PX * 16); } catch { things = []; }
  folk.work = things.filter((t) => t.kind === 'node' || t.kind === 'facility' || t.kind === 'plot').map((t) => footing(ctx, { x: t.x, y: t.y + 14 }));
  const hearth = things.find((t) => t.kind === 'hearth') ?? things.find((t) => t.kind === 'board');
  folk.gather = footing(ctx, hearth ? { x: hearth.x, y: hearth.y + 22 } : { x: folk.centre.x, y: folk.centre.y + TILE_PX * 2.5 });
  if (folk.work.length < 3) {
    const h = hash(folk.town.id);
    for (let i = folk.work.length; i < 4; i++) {
      const a = (h % 628) / 100 + i * 1.7;
      const r = TILE_PX * (7 + (i % 2) * 3);
      folk.work.push(footing(ctx, { x: folk.centre.x + Math.cos(a) * r, y: folk.centre.y + Math.sin(a) * r * 0.8 }));
    }
  }
  for (const v of folk.people) v.home = folk.homes.get(v.id) ? v.home : footing(ctx, v.home);
}

/** The building the schedule puts this person in now, or null when they belong outdoors. */
export const wantInside = (folk: Folk, v: Villager, phase: number): Building | null => scheduledBuilding(v.id, folk.homes, phase);

/** Where the schedule sends someone outdoors now: home, work or the gathering spot. */
export function scheduleSpot(folk: Folk, v: Villager, phase: number): Pt {
  const place = placeAt(phase);
  const h = hash(v.id);
  if (place === 'work' && folk.work.length) {
    const w = folk.work[h % folk.work.length]!;
    // Each worker keeps their own patch around a shared node.
    const a = ((h >> 6) % 628) / 100, r = TILE_PX * (0.8 + ((h >> 3) % 5) * 0.35);
    return { x: w.x + Math.cos(a) * r, y: w.y + Math.sin(a) * r * 0.6 };
  }
  if (place === 'gather' && folk.gather) {
    const a = ((h >> 6) % 628) / 100, r = TILE_PX * (1 + ((h >> 3) % 4) * 0.5);
    return { x: folk.gather.x + Math.cos(a) * r, y: folk.gather.y + Math.sin(a) * r * 0.6 };
  }
  return v.home;
}
