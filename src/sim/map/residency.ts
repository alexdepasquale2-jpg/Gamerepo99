/**
 * Who is indoors when. Pure, data-driven (data/world/npc-schedules.json): the day phase says which
 * building kinds hold their resident, and each building has exactly one resident (see `occupantOf`).
 * The overworld people layer and the interior room both read this, so a villager is never drawn
 * outdoors while standing in a room, and a room only shows the people actually home at that hour.
 */
import sched from '../../data/world/npc-schedules.json';
import { TILE_PX } from './constants';
import { occupantOf, type Building, type InteriorKind } from './interiors';

export type SchedulePlace = 'home' | 'work' | 'gather';
export type SchedulePhase = { until: number; place: SchedulePlace; inside: InteriorKind[] };

const PHASES = sched.phases as SchedulePhase[];

/** Schedule row for a day-clock value (0..1). Wraps past the end to the last row. */
export function phaseRow(day01: number): SchedulePhase {
  const t = ((day01 % 1) + 1) % 1;
  return PHASES.find((x) => t < x.until) ?? PHASES[PHASES.length - 1]!;
}

/** Where a villager should be at this hour: 'home' | 'work' | 'gather'. */
export const placeAt = (day01: number): SchedulePlace => phaseRow(day01).place;

/** Does the resident of a `kind` building stay indoors at this hour? */
export const isIndoorsAt = (kind: InteriorKind, day01: number): boolean => phaseRow(day01).inside.includes(kind);

/** How close (px) a villager must get to a door to step through it; give-up is how long they try (ms). */
export const DOOR_ARRIVE_PX = sched.doorArriveTiles * TILE_PX;
export const DOOR_GIVE_UP_MS = sched.doorGiveUpMs;

/** Resident -> their building, for one town (people not given a building have none and stay outdoors). */
export function residences(townBuildingList: Building[], townPeopleIds: string[]): Map<string, Building> {
  const out = new Map<string, Building>();
  for (const b of townBuildingList) {
    const id = occupantOf(b, townBuildingList, townPeopleIds);
    if (id) out.set(id, b);
  }
  return out;
}

/**
 * Keep a town's homes current without reshuffling anyone already housed: whoever left the town (or the
 * world) frees their building, and newcomers (a child come of age, an arrival) take a free one in id
 * order. People with no free building stay outdoors, as extra villagers always have. Mutates `homes`.
 * Returns the ids newly housed.
 */
export function houseNewcomers(homes: Map<string, Building>, townBuildingList: Building[], townPeopleIds: string[]): string[] {
  const here = new Set(townPeopleIds);
  const mine = new Set(townBuildingList.map((b) => b.id));
  for (const [id, b] of [...homes]) if (mine.has(b.id) && !here.has(id)) homes.delete(id);
  const taken = new Set([...homes.values()].map((b) => b.id));
  const free = townBuildingList.filter((b) => !taken.has(b.id));
  const housed: string[] = [];
  for (const id of [...townPeopleIds].sort()) {
    if (!free.length) break;
    const cur = homes.get(id);
    if (cur && mine.has(cur.id)) continue; // already housed here (a home in another town means they moved)
    homes.set(id, free.shift()!);
    housed.push(id);
  }
  return housed;
}

/** The building this person should be inside right now, or null (outdoors / no building). */
export function scheduledBuilding(personId: string, homes: Map<string, Building>, day01: number): Building | null {
  const b = homes.get(personId);
  return b && isIndoorsAt(b.kind, day01) ? b : null;
}

/** Residents the schedule puts inside this building at this hour (0 or 1 today; a list so rooms can grow). */
export function scheduledResidents(building: Building, townBuildingList: Building[], townPeopleIds: string[], day01: number): string[] {
  const id = occupantOf(building, townBuildingList, townPeopleIds);
  return id && isIndoorsAt(building.kind, day01) ? [id] : [];
}
