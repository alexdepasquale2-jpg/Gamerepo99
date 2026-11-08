/**
 * Shops as Things: each town's market-square stall (drawn by world/settlements at the plan's stall spot)
 * and, inside a shop building, its counter. Both are kind `stall`: the id is the town id for a square stall
 * and the building id for a counter (sim/goods/shop shopRefOfStall tells them apart); a counter carries who
 * keeps it, so the sheet speaks with the face the room was furnished for. Their one verb is Shop.
 */
import type { Thing } from '../../app/contracts';
import type { StallData } from '../../sim/contrib/shop';
import type { Pt } from '../depth';
import type { TownSpots } from '../town-spots';

const STALL_REACH = 52;
/** The counter stands a tile in front of the keeper's seat; you reach it from the shop floor. */
const COUNTER_REACH = 64;

/** Square stalls within `radius` of a point. */
export function stallThings(towns: readonly TownSpots[], near: Pt, radius: number): Thing[] {
  const out: Thing[] = [];
  for (const s of towns) {
    if (Math.hypot(s.stall.x - near.x, s.stall.y - near.y) > radius) continue;
    const id = s.town.id;
    out.push({ key: `stall:${id}`, kind: 'stall', id, x: s.stall.x, y: s.stall.y, reach: STALL_REACH, label: 'Market stall', target: { kind: 'stall', id } });
  }
  return out;
}

/** The counter of a shop room (null for any other room), at the keeper's seat. */
export function counterThing(room: { buildingId: string; kind: string; seat?: Pt }, keeperId: string | undefined, near: Pt, radius: number): Thing | null {
  if (room.kind !== 'shop' || !room.seat) return null;
  const at = { x: room.seat.x, y: room.seat.y + 16 };
  if (Math.hypot(at.x - near.x, at.y - near.y) > radius) return null;
  const data: StallData = keeperId ? { keeperId } : {};
  return { key: `stall:${room.buildingId}`, kind: 'stall', id: room.buildingId, x: at.x, y: at.y, reach: COUNTER_REACH, label: 'Counter', target: { kind: 'stall', id: room.buildingId, data } };
}
