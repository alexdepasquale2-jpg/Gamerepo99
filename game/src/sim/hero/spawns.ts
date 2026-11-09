/**
 * What waits in the wilds. The land is cut into cells; each cell may hold one pack a day, its family drawn
 * from where it lies (bandits near the roads, despair-born near despairing towns and at night, beasts far
 * out, soldiers near a town at war with yours or the one your band marches on). Lairs sit off some roads,
 * one per road at most: a boss and its guard, quiet for a while once cleared. Levels follow yours.
 * Pure + deterministic (deriveRng).
 */
import { atWar } from '../economy/polity';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { worksIfAny } from '../works/state';
import { FOE_SCALING, LAIRS, LAIR_RESPAWN, PACKS, foeRow, type Family, type FoeRow } from './data';
import { heroIfAny } from './hero';
import { STORY } from '../storyteller/data';
import { pressureAt } from '../storyteller/state';

export const CELL_PX = 900;
export type Member = { id: string; level: number };
export type Pack = { key: string; family: Family; members: Member[] };
/** `nearTown`: the town the cell lies by, when one is close (the storyteller gathers packs round a town in trouble). */
export type CellContext = { nearRoad: boolean; despair: number; night: boolean; hostile: boolean; nearTown?: string };

export function scaled(row: FoeRow, level: number): { hp: number; dmg: number; xp: number } {
  const l = level - 1;
  return { hp: Math.round(row.hp * (1 + FOE_SCALING.hp * l)), dmg: Math.round(row.dmg * (1 + FOE_SCALING.dmg * l)), xp: Math.round(row.xp * (1 + FOE_SCALING.xp * l)) };
}

export const cellKey = (cx: number, cy: number): string => `${cx},${cy}`;
const heroLevel = (state: SimState): number => heroIfAny(state)?.level ?? 1;

/** Towns whose soldiers walk the wilds against you: at war with your home town, or your band's target. */
export function hostileTowns(state: SimState): Set<string> {
  const out = new Set<string>();
  const home = state.player.homeTownId;
  if (home) for (const t of Object.keys(state.towns ?? {})) if (t !== home && atWar(state, home, t)) out.add(t);
  const m = worksIfAny(state)?.band?.march;
  if (m && !worksIfAny(state)?.depots[m.target] && !worksIfAny(state)?.vassals.some((v) => v.townId === m.target)) out.add(m.target);
  return out;
}

/** The pack in a wild cell today, or null (none, or you cleared it today). */
export function packFor(state: SimState, cx: number, cy: number, c: CellContext): Pack | null {
  const key = cellKey(cx, cy);
  if (heroIfAny(state)?.cleared[key] === state.day) return null;
  const rng = deriveRng(state.seed, 'pack', state.day, key);
  // A raid, a wolf winter, a grey tide (sim/storyteller): that family is thick round the town until routed.
  const press = pressureAt(state, c.nearTown);
  if (rng.next() > (press ? STORY.tuning.pressureChance : 0.5)) return null;
  const w: [Family, number][] = [
    ['beast', c.nearRoad ? 1.5 : 4],
    ['bandit', c.nearRoad ? 3.5 : 0.6],
    ['despair', 0.5 + c.despair * 10 + (c.night ? 3 : 0)],
    ['rival', c.hostile ? 7 : 0],
  ];
  const total = w.reduce((n, [, x]) => n + x, 0);
  let r = rng.next() * total;
  let family: Family = 'beast';
  for (const [f, x] of w) { r -= x; if (r <= 0) { family = f; break; } }
  if (press?.family && deriveRng(state.seed, 'pack-press', state.day, key).next() < STORY.tuning.pressureForce) family = press.family;
  const shapes = PACKS[family];
  const shape = shapes[rng.int(0, shapes.length)]!;
  const base = Math.max(1, heroLevel(state) - 1 + rng.int(0, 3) + (family === 'rival' ? 1 : 0));
  return { key, family, members: shape.map((id) => ({ id, level: base })) };
}

export type LairSite = { id: string; routeId: string; family: Family; f: number; side: 1 | -1; name: string };
/** The lairs along a district's roads (stable for the save: one in five roads has none). */
export function lairSites(state: SimState, routeIds: string[]): LairSite[] {
  const out: LairSite[] = [];
  for (const routeId of routeIds) {
    const rng = deriveRng(state.seed, 'lair', routeId);
    if (rng.next() < 0.2) continue;
    const fams: Family[] = ['despair', 'bandit', 'beast', 'despair', 'bandit', 'beast', 'rival'];
    const family = fams[rng.int(0, fams.length)]!;
    out.push({ id: `lair:${routeId}`, routeId, family, f: 0.3 + rng.next() * 0.4, side: rng.next() < 0.5 ? 1 : -1, name: LAIRS[family].name });
  }
  return out;
}
export function lairAwake(state: SimState, id: string): boolean {
  const d = heroIfAny(state)?.lairs[id];
  return d === undefined || state.day - d >= LAIR_RESPAWN;
}
/** A lair's boss and guard, a level or two above you. */
export function lairPack(state: SimState, site: LairSite): Pack {
  const l = LAIRS[site.family];
  const level = heroLevel(state) + 1;
  return { key: site.id, family: site.family, members: [{ id: l.boss, level: level + 1 }, ...l.guard.map((id) => ({ id, level }))] };
}

export const foeName = (id: string): string => foeRow(id)?.name ?? id;
