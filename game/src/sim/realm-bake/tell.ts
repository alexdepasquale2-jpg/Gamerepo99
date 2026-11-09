/**
 * The baked past, told. Each remembered event of a district becomes a history beat its people retell
 * (history-voice: the town it names knows it, and the old know them all), with its own words
 * (data/world/realm-bake.json tell), and the realm map reads the same events as short lines.
 * Which town an event names, whose name it carries and which words are drawn from the event's own seed, so
 * the same world always tells the same tale. Pure. No Phaser/DOM.
 */
import type { HistoryEvent } from '../gen/world-types';
import { prettyTownId, realm } from '../map/districts';
import { namePool } from '../names';
import { BAKE, YEAR_DAWNS, tellRng, type BakeEvent, type BakedDistrict, type RealmBake } from './bake';

export const BAKE_TAG = 'bake';
const GENERATION_YEARS = 25;

const num = (n: number): string => Math.round(n).toLocaleString('en-US');
/** "this past season", "12 years ago", "three generations back", "some 1,400 years ago". */
export function agoText(daysAgo: number): string {
  const years = daysAgo / YEAR_DAWNS;
  if (daysAgo < 7) return 'only days ago';
  if (daysAgo < YEAR_DAWNS) return 'this past year';
  if (years < 2) return 'last year';
  if (years < GENERATION_YEARS) return `${Math.floor(years)} years ago`;
  if (years < GENERATION_YEARS * 2) return 'a generation ago';
  const gens = Math.round(years / GENERATION_YEARS);
  if (gens <= 6) return `${['two', 'three', 'four', 'five', 'six'][gens - 2]} generations back`;
  if (years < 1000) return `some ${num(Math.round(years / 10) * 10)} years ago`;
  return `some ${num(Math.round(years / 100) * 100)} years ago`;
}
/** Whole years in `dawns`. */
export const yearsOf = (dawns: number): number => Math.floor(dawns / YEAR_DAWNS);

export type ToldEvent = { day: number; kind: string; gist: string; line: string; coda: string; townId?: string };

/**
 * One event in words. `townIds` are the district's towns as the live world has them (the home district's
 * are only known there); without them it names the seat the seed gives, or the district itself.
 */
export function tellEvent(bake: RealmBake, d: BakedDistrict, ev: BakeEvent, townIds?: readonly string[]): ToldEvent | null {
  const row = BAKE.tell.kinds[ev.kind];
  if (!row) return null;
  const ref = realm(bake.seed)[d.index]!;
  const towns = townIds?.length ? townIds : ref.towns.map((t) => t.id);
  const townId = towns.length ? towns[Math.floor(ev.town * towns.length) % towns.length] : undefined;
  const rng = tellRng(bake.seed, d.id, ev);
  const pool = namePool(bake.seed, ref.towns[0]?.id);
  const other = ev.other !== undefined ? realm(bake.seed)[ev.other]!.name : 'the next land';
  const slots: Record<string, string> = {
    ago: agoText(-ev.day),
    district: ref.name,
    other,
    town: townId ? prettyTownId(townId) : ref.name,
    name: `${pool.given[rng.int(0, pool.given.length)]} ${pool.family[rng.int(0, pool.family.length)]}`,
    war: BAKE.tell.warNames[rng.int(0, BAKE.tell.warNames.length)]!,
  };
  const fill = (s: string): string => s.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
  const line = fill(row.summaries[rng.int(0, row.summaries.length)]!);
  return {
    day: ev.day, kind: ev.kind, gist: fill(row.gist),
    line: line.charAt(0).toUpperCase() + line.slice(1),
    coda: fill(row.codas[rng.int(0, row.codas.length)] ?? ''),
    ...(townId ? { townId } : {}),
  };
}

/** A district's remembered events in words, oldest first. */
export function districtTale(bake: RealmBake, districtId: string, townIds?: readonly string[]): ToldEvent[] {
  const d = bake.byId[districtId];
  return d ? d.events.map((ev) => tellEvent(bake, d, ev, townIds)).filter((x): x is ToldEvent => !!x) : [];
}

/** The same events as history beats for the live district (ids are stable, so a reload adds none twice). */
export function bakedHistory(bake: RealmBake, districtId: string, townIds: readonly string[]): HistoryEvent[] {
  return districtTale(bake, districtId, townIds).map((t, i) => {
    const years = -t.day / YEAR_DAWNS;
    return {
      id: `bake_${districtId}_${i}_${t.kind}`,
      // Old tales sort before the seed's own beats (the deep past); the last two years sit with the recent ones.
      at: years < 2 ? 1000 - years : -years,
      tags: [BAKE_TAG, `age_${t.kind}`],
      personIds: [],
      summary: t.line,
      gist: t.gist,
      kind: `age_${t.kind}`,
      day: t.day,
      ...(t.townId ? { townId: t.townId } : {}),
    };
  });
}

/** Codas for a baked kind (`age_<kind>`), for history-voice. */
export function bakeCodas(kind: string): string[] {
  return kind.startsWith('age_') ? BAKE.tell.kinds[kind.slice(4)]?.codas.filter((c) => !/\{/.test(c)) ?? [] : [];
}

/** How a district stands after the bake, in a few words (the map's line and the god menu's pill). */
export function standingOf(d: BakedDistrict): string {
  if (d.fallen) return 'fallen to ash';
  if (d.beacon) return 'a beacon';
  if (d.despair >= 0.6) return 'going dark';
  if (d.despair <= 0.25) return 'burning well';
  return 'holding on';
}

/** The realm's age and what it has seen, for the New game screen and the map. */
export function realmSummary(bake: RealmBake): string[] {
  if (!bake.dawns) return ['A young world: no past but the one its people were born with.'];
  const t = bake.totals, years = yearsOf(bake.dawns);
  const out = [
    `${num(bake.dawns)} dawns of history${years >= 1 ? ` (${num(years)} years)` : ''}, lived by all ${bake.districts.length} districts.`,
    `${num(t.wars ?? 0)} wars, ${num(t.pact ?? 0)} pacts sworn, ${num((t.plague ?? 0) + (t.famine ?? 0) + (t.blight ?? 0))} plagues and famines, ${num(t.harvest ?? 0)} golden harvests, ${num(t.rulers ?? 0)} seat-holders.`,
    `${num(t.sparkbearer ?? 0)} spark-carriers walked before you. ${num(t.fallen ?? 0)} districts lie fallen to ash; ${num(t.beacons ?? 0)} burn as beacons.`,
  ];
  if (bake.ages.length > 1) out.push(`Its ages: ${bake.ages.map((a) => a.name).join(', ')}.`);
  return out;
}
