import { describe, expect, it } from 'vitest';
import {
  allBuildings, exitMat, interiorKindOf, interiorPlan, interiorWalkable, nearExit, nearestDoor,
  interiorLine, occupantOf, reachableTiles, solidTiles, townBuildings, DOOR_REACH, type InteriorKind,
} from '../../../src/sim/map/interiors';
import { TILE_PX } from '../../../src/sim/map/constants';
import type { LayoutSettlement } from '../../../src/sim/map/world-layout';

const village: LayoutSettlement = { id: 'v1', q: 100, r: 50, kind: 'village' };
const town: LayoutSettlement = { id: 't1', q: 300, r: 80, kind: 'town' };
const city: LayoutSettlement = { id: 'c1', q: 0, r: 0, kind: 'city' };
const KINDS: InteriorKind[] = ['house', 'shop', 'inn'];

describe('building doors', () => {
  it('maps stamp types to interior kinds and skips towers', () => {
    expect(interiorKindOf('cottage')).toBe('house');
    expect(interiorKindOf('shop')).toBe('shop');
    expect(interiorKindOf('hall')).toBe('inn');
    expect(interiorKindOf('tower')).toBeNull();
  });

  it('villages have houses; towns have shops and an inn; cities skip towers', () => {
    expect(townBuildings(village).map((b) => b.kind)).toEqual(['house', 'house', 'house']);
    expect(townBuildings(town).map((b) => b.kind)).toEqual(['shop', 'inn', 'shop']);
    expect(townBuildings(city)).toHaveLength(3);
  });

  it('places doors at the painted stamp foot (town foot + layout offset) with stable ids', () => {
    const b = townBuildings(town);
    expect(b.map((x) => x.id)).toEqual(['t1:0', 't1:1', 't1:2']);
    // hall at q 0, r -2 from the town foot
    expect(b[1]!.door).toEqual({ x: 300 * TILE_PX + TILE_PX / 2, y: 80 * TILE_PX + TILE_PX - 2 * TILE_PX });
    expect(townBuildings(town)).toEqual(b);
  });

  it('nearestDoor finds the closest door within reach only', () => {
    const bs = allBuildings([village, town]);
    const target = bs.find((b) => b.id === 't1:1')!;
    const hit = nearestDoor(bs, { x: target.door.x + 5, y: target.door.y + 10 });
    expect(hit?.building.id).toBe('t1:1');
    expect(nearestDoor(bs, { x: target.door.x, y: target.door.y + DOOR_REACH + 20 })).toBeNull();
  });
});

describe('occupants', () => {
  it('deals one resident per building by sorted id; leftovers stay outdoors', () => {
    const bs = townBuildings(town);
    const people = ['zed', 'amy', 'bob', 'cy'];
    expect(bs.map((b) => occupantOf(b, bs, people))).toEqual(['amy', 'bob', 'cy']);
  });

  it('leaves a building empty when nobody is left over', () => {
    const bs = townBuildings(town);
    expect(occupantOf(bs[2]!, bs, ['amy', 'bob'])).toBeUndefined();
    expect(occupantOf(bs[0]!, bs, [])).toBeUndefined();
  });
});

describe('occupant lines', () => {
  it('cycles per visit and turns sombre when the town is despairing', () => {
    for (const kind of KINDS) {
      const calm = [0, 1, 2].map((v) => interiorLine(kind, 0.1, v));
      expect(new Set(calm).size).toBe(3);
      expect(interiorLine(kind, 0.1, 3)).toBe(calm[0]);
      const low = [0, 1, 2].map((v) => interiorLine(kind, 0.9, v));
      expect(low.some((l) => calm.includes(l))).toBe(false);
    }
  });
});

describe('interior plans', () => {
  for (const kind of KINDS) {
    for (const seedKey of ['a', 'b', 'c', 'd', 't1:1', 'v1:0']) {
      it(`${kind}/${seedKey}: furniture in bounds, no solid overlap, door/npc reachable`, () => {
        const plan = interiorPlan(kind, seedKey);
        const taken = new Set<string>();
        for (const o of plan.furniture) {
          if (o.wall) continue;
          expect(o.col).toBeGreaterThanOrEqual(0);
          expect(o.row).toBeGreaterThanOrEqual(0);
          expect(o.col + o.w).toBeLessThanOrEqual(plan.cols);
          expect(o.row + o.h).toBeLessThanOrEqual(plan.rows);
          if (!o.solid) continue;
          for (let c = 0; c < o.w; c++) for (let r = 0; r < o.h; r++) {
            const k = `${o.col + c},${o.row + r}`;
            expect(taken.has(k), `overlap at ${k}`).toBe(false);
            taken.add(k);
          }
        }
        for (const o of plan.furniture.filter((x) => x.wall)) {
          expect(o.col).toBeGreaterThanOrEqual(0);
          expect(o.col + o.w).toBeLessThanOrEqual(plan.cols);
        }
        const solid = solidTiles(plan);
        expect(solid.has(`${plan.spawn.col},${plan.spawn.row}`)).toBe(false);
        expect(solid.has(`${plan.npc.col},${plan.npc.row}`)).toBe(false);
        const reach = reachableTiles(plan);
        // The occupant is standing on or right beside floor the player can reach.
        const near = [...reach].some((k) => {
          const [c, r] = k.split(',').map(Number) as [number, number];
          return Math.hypot(c - plan.npc.col, r - plan.npc.row) <= 2.3;
        });
        expect(near).toBe(true);
        // Every non-solid floor tile is reachable (no sealed pockets).
        for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
          if (!solid.has(`${c},${r}`)) expect(reach.has(`${c},${r}`), `sealed ${c},${r}`).toBe(true);
        }
        expect(plan.doorCol).toBeGreaterThanOrEqual(0);
        expect(plan.doorCol).toBeLessThan(plan.cols);
      });
    }
  }

  it('is deterministic and varies across buildings', () => {
    expect(interiorPlan('house', 'x')).toEqual(interiorPlan('house', 'x'));
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => JSON.stringify(interiorPlan('house', s))));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('houses have a bed and hearth; shops a counter and shelves; the inn a bar and hearth', () => {
    const types = (k: InteriorKind) => new Set(interiorPlan(k, 'z').furniture.map((o) => o.type));
    expect(types('house')).toContain('bed');
    expect(types('house')).toContain('hearth');
    expect(types('shop')).toContain('counter');
    expect(types('shop')).toContain('shelf');
    expect(types('inn')).toContain('counter');
    expect(types('inn')).toContain('hearth');
  });

  it('spawn is walkable, solid furniture blocks movement, and the exit is near the spawn', () => {
    for (const kind of KINDS) {
      const plan = interiorPlan(kind, 'walk');
      const sx = (plan.spawn.col + 0.5) * TILE_PX, sy = (plan.spawn.row + 0.5) * TILE_PX;
      expect(interiorWalkable(plan, sx, sy)).toBe(true);
      expect(nearExit(plan, { x: sx, y: sy })).toBe(true);
      const bar = plan.furniture.find((o) => o.solid)!;
      expect(interiorWalkable(plan, (bar.col + 0.5) * TILE_PX, (bar.row + 0.5) * TILE_PX)).toBe(false);
      expect(interiorWalkable(plan, -3, sy)).toBe(false);
      expect(interiorWalkable(plan, sx, plan.rows * TILE_PX + 8)).toBe(false);
      // Far from the door you cannot leave.
      expect(nearExit(plan, { x: exitMat(plan).x, y: 0 })).toBe(false);
    }
  });
});
