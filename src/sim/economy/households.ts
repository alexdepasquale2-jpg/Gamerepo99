/**
 * Households and lineage. Adults pair into man+woman households (limited by housing); founders pick
 * a family name, so every line has its own ancestry. Secure households have children; a warm,
 * secure household can rarely have a gifted child. Children grow up into villagers who can found
 * their own household, continuing the line. Heirs inherit claims, plans and companies.
 * Sex is derived from the seed, not stored. Pure + deterministic.
 */

import namesJson from '../../data/people/names.json';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { purseOf } from './companies';
import { scarcity } from './village-economy';

export const KIN = {
  /** Residents per home before any are built: ceil(adults / this) households fit. */
  adultsPerHome: 3,
  pairChance: 0.04,
  birthChance: 0.012,
  maxKids: 4,
  /** Dawns together before a first child. */
  settleDays: 10,
  /** Household security needed to have children at all. */
  birthSecurity: 0.4,
  /** Flame (0..100) and security needed for the high-vibration chance of a gifted child. */
  warmFlame: 55,
  giftedSecurity: 0.7,
  giftedChanceWarm: 0.2,
  giftedChanceBase: 0.02,
  comeOfAgeDays: 80,
  purseForSecurity: 20,
};
export const GIFTS = ['healer', 'maker', 'speaker', 'seer'];

export type Household = { id: string; townId: string; adults: [string, string]; surname: string; generation: number; formed: number; kids: string[] };
export type Child = { id: string; householdId: string; townId: string; given: string; surname: string; sex: 'm' | 'f'; gift?: string; parents: [string, string]; born: number; status: 'child' | 'adult'; personId?: string };
export type Lineage = { surname: string; founders: string[]; founded: number; generation: number };
export type KinState = { households: Household[]; children: Child[]; lineages: Record<string, Lineage>; next: number };

const kin = (state: SimState): KinState => (state.kin ??= { households: [], children: [], lineages: {}, next: 1 });
const NAMES = namesJson as { given: string[]; family: string[] };

export const sexOf = (state: SimState, id: string): 'm' | 'f' => (deriveRng(state.seed, 'sex', id).next() < 0.5 ? 'm' : 'f');
export const householdOf = (state: SimState, personId: string): Household | undefined =>
  (state.kin?.households ?? []).find((h) => h.adults.includes(personId) || h.kids.some((k) => state.kin!.children.find((c) => c.id === k)?.personId === personId));
export const householdsIn = (state: SimState, townId: string): Household[] => (state.kin?.households ?? []).filter((h) => h.townId === townId);

const familyOf = (state: SimState, id: string): string | undefined => state.people[id]?.name?.split(' ').slice(1).join(' ') || undefined;
const ancestry = (state: SimState, id: string): { surname: string; generation: number } | undefined => {
  const c = state.kin?.children.find((x) => x.personId === id);
  return c ? { surname: c.surname, generation: state.kin!.lineages[c.surname]?.generation ?? 1 } : undefined;
};

/** 0..1: food cover in town plus the adults' savings. */
export function security(state: SimState, h: Household): number {
  const purse = h.adults.reduce((n, id) => n + purseOf(state, id), 0);
  return 0.7 * (1 - scarcity(state, h.townId, 'bread')) + 0.3 * Math.min(1, purse / KIN.purseForSecurity);
}
export const warmth = (state: SimState, h: Household): number => h.adults.reduce((n, id) => n + (state.people[id]?.flame ?? 0), 0) / 2;

/** Who takes over a person's claims, plans and company: eldest grown child in the household, else the spouse. */
export function heirOf(state: SimState, personId: string): string | null {
  const h = (state.kin?.households ?? []).find((x) => x.adults.includes(personId));
  if (!h) return null;
  const grown = state.kin!.children.filter((c) => h.kids.includes(c.id) && c.status === 'adult' && c.personId && state.people[c.personId]).sort((a, z) => a.born - z.born || a.id.localeCompare(z.id))[0];
  return grown?.personId ?? h.adults.find((a) => a !== personId && state.people[a]) ?? null;
}

/** Hand a person's land, plans and company to their heir. Returns the heir, or null if none. */
export function inheritFrom(state: SimState, personId: string): string | null {
  const heir = heirOf(state, personId);
  if (!heir) return null;
  for (const c of state.build?.claims ?? []) if (c.ownerId === personId) c.ownerId = heir;
  for (const p of state.build?.plans ?? []) if (p.ownerId === personId) p.ownerId = heir;
  for (const c of state.companies?.list ?? []) if (c.ownerId === personId) { c.ownerId = heir; c.workers = c.workers.filter((w) => w !== heir); }
  return heir;
}

const pick = (list: string[], taken: Set<string>, start: number): string => {
  for (let i = 0; i < list.length; i++) { const v = list[(start + i) % list.length]!; if (!taken.has(v)) return v; }
  return list[start % list.length]!;
};

export function tickHouseholds(state: SimState): void {
  const k = kin(state);
  const adultsBy = new Map<string, string[]>();
  for (const [id, p] of Object.entries(state.people ?? {})) if (p.townId && (p.age === undefined || p.age >= 18)) (adultsBy.get(p.townId) ?? adultsBy.set(p.townId, []).get(p.townId)!).push(id);

  // 1. Couples form while the town has a home for them.
  for (const [townId, ids] of [...adultsBy].sort(([a], [b]) => a.localeCompare(b))) {
    const paired = new Set(k.households.flatMap((h) => h.adults));
    const free = ids.filter((id) => !paired.has(id)).sort();
    const homes = Math.ceil(ids.length / KIN.adultsPerHome) + (state.build?.claims ?? []).filter((c) => c.townId === townId && c.status === 'built' && c.kind === 'house').length;
    let count = k.households.filter((h) => h.townId === townId).length;
    for (const m of free.filter((id) => sexOf(state, id) === 'm')) {
      if (count >= homes) break;
      if (paired.has(m) || deriveRng(state.seed, 'pair', state.day, m).next() >= KIN.pairChance) continue;
      const f = free.find((id) => !paired.has(id) && sexOf(state, id) === 'f');
      if (!f) break;
      // The founders pick the family name: a line they come from, else one of their own, else an unused one.
      const line = ancestry(state, m) ?? ancestry(state, f);
      let surname = line?.surname;
      if (!surname) {
        const taken = new Set(Object.keys(k.lineages));
        surname = [familyOf(state, m), familyOf(state, f)].find((n) => n && !taken.has(n)) ?? pick(NAMES.family, taken, deriveRng(state.seed, 'surname', m).int(0, NAMES.family.length));
        k.lineages[surname] = { surname, founders: [m, f], founded: state.day, generation: 1 };
      } else k.lineages[surname]!.generation = Math.max(k.lineages[surname]!.generation, line!.generation + 1);
      k.households.push({ id: `hh${k.next++}`, townId, adults: [m, f], surname, generation: k.lineages[surname]!.generation, formed: state.day, kids: [] });
      paired.add(m); paired.add(f); count++;
    }
  }

  // 2. Births, then growing up.
  for (const h of [...k.households].sort((a, z) => a.id.localeCompare(z.id))) {
    if (h.kids.length >= KIN.maxKids || state.day - h.formed < KIN.settleDays || !h.adults.every((a) => state.people[a])) continue;
    const sec = security(state, h);
    if (sec < KIN.birthSecurity) continue;
    const rng = deriveRng(state.seed, 'birth', state.day, h.id);
    if (rng.next() >= KIN.birthChance) continue;
    const warm = warmth(state, h) >= KIN.warmFlame && sec >= KIN.giftedSecurity;
    const gifted = rng.next() < (warm ? KIN.giftedChanceWarm : KIN.giftedChanceBase);
    const id = `kid${k.next++}`;
    const used = new Set(k.children.filter((c) => c.householdId === h.id).map((c) => c.given));
    k.children.push({
      id, householdId: h.id, townId: h.townId, surname: h.surname, born: state.day, status: 'child', parents: h.adults,
      given: pick(NAMES.given, used, deriveRng(state.seed, 'given', id).int(0, NAMES.given.length)),
      sex: rng.next() < 0.5 ? 'm' : 'f', gift: gifted ? GIFTS[rng.int(0, GIFTS.length)] : undefined,
    });
    h.kids.push(id);
  }
  for (const c of k.children) {
    if (c.status !== 'child' || state.day - c.born < KIN.comeOfAgeDays) continue;
    const parents = c.parents.map((p) => state.people[p]?.flame ?? 0);
    const personId = `born_${c.id}`;
    state.people[personId] = {
      id: personId, name: `${c.given} ${c.surname}`, townId: c.townId, age: 18,
      flame: Math.min(100, parents.reduce((n, f) => n + f, 0) / 2 + (c.gift ? 15 : 0)),
      tags: ['born_here', ...(c.gift ? [`gifted_${c.gift}`] : [])],
    };
    c.status = 'adult';
    c.personId = personId;
  }
}
