/**
 * What a town is going through, read for happenings (sim/happenings): the `when` of an events.json row
 * and the roles its `townBias` names. matchesWhen (sim/hooks) reads the player and the act in hand; these
 * read one candidate town of the world, so they are their own small vocabulary:
 *
 *   starving: true          households there went without at the last dawn's meal
 *   foodCoverBelow: n       fewer than n days of food in its stores
 *   despairAbove: n         the town's despair is over n
 *   legitimacyBelow: n      a live doctrine held there has legitimacy under n
 *   litAtLeast: n           at least share n of its residents burn
 *   hasCreed: true          a chapel keeps a creed there (state.polity faiths)
 *   newChapelWithin: n      that chapel was founded in the last n days
 *   deathWithin: n          someone of the town died in the last n days (state.life)
 *   atWar: true             the town is a party to an active war (state.polity wars)
 *   warNearby: true         an active war involves another town of this district, not this one
 *   collapsedWithin: n      a doctrine held there collapsed in the last n days
 *   any: [when, …]          one of these holds
 *
 * Every clause must hold. A match carries what it was about (the dead, the war, the doctrine), so a
 * happening can name it and never fires twice for the same cause. Roles for townBias: den / home (your
 * home hearth; in a generated district its den-like town, start-rules denOf), village / town / city,
 * despairing (despair at least DESPAIRING), lit (at least half its residents burn). Pure.
 */
import { foodCover, foodShortToday } from './economy/food-stock';
import { loadWorldTables } from './gen/load/load-world-tables';
import type { DataTables } from './load-data';
import { districtAt, districtOfTown } from './map/districts';
import { settlementKind, type SettlementKind } from './map/world-layout';
import { denOf } from './start-rules';
import type { SimState } from './types/runtime';

export type HappeningWhen = {
  starving?: boolean;
  foodCoverBelow?: number;
  despairAbove?: number;
  legitimacyBelow?: number;
  litAtLeast?: number;
  hasCreed?: boolean;
  newChapelWithin?: number;
  deathWithin?: number;
  atWar?: boolean;
  warNearby?: boolean;
  collapsedWithin?: number;
  any?: HappeningWhen[];
};

/** What a matched `when` was about. `about` keys the cause (one happening per cause per town). */
export type HappeningSubject = { about?: string; deadId?: string; deadName?: string; tellerId?: string };

const DESPAIRING = 0.5;
const LIT_TOWN = 0.5;

/** Flame at which a person burns (the reignite line); happenings reads the same one. */
export const burnAt = (state: SimState): number => (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;

/** Share of a town's working residents (not the retired) who burn. 0 for an empty town. */
export function litShare(state: SimState, townId: string): number {
  const line = burnAt(state);
  const folk = Object.values(state.people).filter((p) => p.townId === townId && !p.tags?.includes('retired'));
  return folk.length ? folk.filter((p) => p.flame >= line).length / folk.length : 0;
}

/** Has this cause already been told here (by this event)? Lets a clause pass over causes already told. */
export type ToldFn = (about: string) => boolean;

/** Day each doctrine was first seen collapsed (kept in state.happenings by tickHappenings). */
export type CollapseDays = Record<string, number>;

/**
 * Stamp doctrines that collapsed since the last look. Runs after the doctrine tick, so a new stamp is the
 * collapse dawn. The first look on a save that already holds collapsed doctrines takes their day from the
 * world delta log, else counts them as long ago (no power vacuum for an old fall).
 */
export function stampCollapses(state: SimState, seen: CollapseDays | undefined): CollapseDays {
  const out: CollapseDays = { ...seen };
  for (const d of Object.values(state.doctrines ?? {})) {
    if (!d.collapsed || out[d.id] !== undefined) continue;
    if (seen) { out[d.id] = state.day; continue; }
    const logged = (state.legacy?.deltas ?? []).filter((x) => x.t === 'doctrine' && (x as { doctrineId?: string }).doctrineId === d.id && (x as { patch?: { collapsed?: number } }).patch?.collapsed);
    out[d.id] = (logged[0] as { day?: number } | undefined)?.day ?? -1e9;
  }
  return out;
}

function clause(state: SimState, townId: string, key: string, want: unknown, collapses: CollapseDays, sub: HappeningSubject, told: ToldFn): boolean {
  const n = Number(want);
  const day = state.day;
  const town = state.towns?.[townId];
  switch (key) {
    case 'starving': return (foodShortToday(state, townId) > 1e-9) === !!want;
    case 'foodCoverBelow': return foodCover(state, townId) < n;
    case 'despairAbove': return (town?.despair ?? 0) > n;
    case 'legitimacyBelow':
      return Object.values(state.doctrines ?? {}).some((d) => d.townId === townId && !d.collapsed && d.legitimacy < n);
    case 'litAtLeast': return litShare(state, townId) >= n;
    case 'hasCreed': return !!state.polity?.faiths?.[townId] === !!want;
    case 'newChapelWithin': {
      const f = state.polity?.faiths?.[townId];
      if (!f || day - f.founded >= n) return false;
      sub.about ??= `chapel:${townId}:${f.founded}`;
      return true;
    }
    case 'deathWithin': {
      // Newest first, past the ones already mourned: two deaths in a dawn get two funerals.
      const dead = (state.life?.events ?? []).filter((x) => x.kind === 'died' && x.townId === townId && day - x.day < n && !told(`death:${x.personId}`));
      const e = dead[dead.length - 1];
      if (!e) return false;
      const teller = e.teller && state.people[e.teller]?.townId === townId ? e.teller : undefined;
      Object.assign(sub, { about: `death:${e.personId}`, deadId: e.personId, deadName: e.name, ...(teller ? { tellerId: teller } : {}) });
      return true;
    }
    case 'atWar':
    case 'warNearby': {
      const present = state.towns ?? {};
      const wars = (state.polity?.wars ?? []).filter((w) => w.status === 'active');
      const ours = wars.find((w) => w.aggressor === townId || w.defender === townId);
      const near = wars.find((w) => w.aggressor !== townId && w.defender !== townId && (w.aggressor in present || w.defender in present) && !told(`war:${w.id}`));
      const w = key === 'atWar' ? ours : ours ? undefined : near;
      if (!w !== !want) return false;
      if (w) sub.about ??= `war:${w.id}`;
      return true;
    }
    case 'collapsedWithin': {
      const fell = Object.values(state.doctrines ?? {})
        .filter((d) => d.townId === townId && d.collapsed && day - (collapses[d.id] ?? -1e9) < n && !told(`collapse:${d.id}`))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!fell.length) return false;
      sub.about ??= `collapse:${fell[0]!.id}`;
      return true;
    }
    case 'any': {
      for (const alt of Array.isArray(want) ? (want as HappeningWhen[]) : []) {
        const s = matchTownWhen(state, townId, alt, collapses, told);
        if (s) { Object.assign(sub, s); return true; }
      }
      return false;
    }
    default:
      // An unknown clause never holds: a typo in data should stop an event, not fire it everywhere.
      return false;
  }
}

/** The subject of a matched `when` in this town (empty for no `when`), or null when it does not hold. */
export function matchTownWhen(state: SimState, townId: string, when: HappeningWhen | undefined, collapses: CollapseDays, told: ToldFn = () => false): HappeningSubject | null {
  const sub: HappeningSubject = {};
  for (const [k, v] of Object.entries(when ?? {})) if (!clause(state, townId, k, v, collapses, sub, told)) return null;
  return sub;
}

// ---------- roles for townBias ----------

const ROLES = new Set(['den', 'home', 'village', 'town', 'city', 'despairing', 'lit']);
export const isTownRole = (s: string): boolean => ROLES.has(s);

const gapOf = new Map<string, number>();
/** District town kinds per seed:district (districtAt re-places every town, so it is worked out once). */
const kindCache = new Map<string, Map<string, SettlementKind>>();
/** A town's kind: a district town's own, else the authored gap axis (as world-layout reads it). */
export function townKind(state: SimState, townId: string): SettlementKind | undefined {
  const d = districtOfTown(townId);
  if (d) {
    const key = `${state.seed}:${d.col}_${d.row}`;
    let kinds = kindCache.get(key);
    if (!kinds) kindCache.set(key, (kinds = new Map(districtAt(state.seed, d.col, d.row).towns.map((t) => [t.id, t.kind]))));
    return kinds.get(townId);
  }
  if (!gapOf.size) for (const t of loadWorldTables().towns) gapOf.set(t.id, t.gapAxis);
  const g = gapOf.get(townId);
  return g === undefined ? undefined : settlementKind({ gap01: g });
}

const denCache = new Map<string, string | undefined>();
/** The den role among present towns: the home hearth when it is here, else a generated district's den-like town. */
export function denTown(state: SimState, present: string[]): string | undefined {
  const home = state.player.homeTownId;
  if (home && present.includes(home)) return home;
  const d = present.map(districtOfTown).find((x) => !!x);
  if (!d) return undefined;
  const key = `${state.seed}:${d.col}_${d.row}`;
  if (!denCache.has(key)) denCache.set(key, denOf(districtAt(state.seed, d.col, d.row).towns, state.seed));
  const den = denCache.get(key);
  return den && present.includes(den) ? den : undefined;
}

/** The present towns a role names. */
export function roleTowns(state: SimState, role: string, present: string[]): string[] {
  if (role === 'den' || role === 'home') { const d = denTown(state, present); return d ? [d] : []; }
  if (role === 'despairing') return present.filter((id) => (state.towns?.[id]?.despair ?? 0) >= DESPAIRING);
  if (role === 'lit') return present.filter((id) => litShare(state, id) >= LIT_TOWN);
  return present.filter((id) => townKind(state, id) === role);
}
