/**
 * Leaders' letters between neighbouring districts. The pair's courier record (civic/district-relations)
 * is the truth: it decides the day a letter lands and what it does to trust and feud, for every pair in
 * the realm. This module gives the letters a body and puts a copy where people can read it:
 *   - a letter for the district you stand in rides the live mail (LettersState.flight) to its leader, so
 *     it lands as any letter does; leave before it lands and realm-away parks it in that district's inbox;
 *   - a letter your leader sends to a district whose leader you have met waits in that district's realm
 *     inbox (realm-away delivers it the day you arrive). Only the newest per sender is kept there, so a
 *     long stay at home does not pile up a sack of stale letters.
 * Leaders' riders change horses at every trunk post, so these never thin on the road (roadDays 1).
 * Pure + deterministic.
 */
import { trackedTable } from '../data-use-people';
import lettersJson from '../../data/dialogue/district-letters.json';
import { ensureLetters, type Flight } from '../letters-scale';
import { inboxOf } from '../realm';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import {
  DPOL, districtName, ensurePolity, leaderOfDistrict, liveId, news, otherOf, seatOf,
  type Courier, type DistrictRelation, type LetterKind, type PolityHooks,
} from './district-relations';

type Lines = string[];
export const DL = trackedTable('dialogue/district-letters', lettersJson as unknown as {
  letters: Record<LetterKind, { title: string; body: Lines }>;
  gist: Record<LetterKind, Lines>;
  dawn: Record<string, Lines>;
  held: Record<string, Lines>;
  fallen: Record<string, Lines>;
  broker: Record<string, Lines>;
  relation: Record<string, string>;
}, ['letters', 'gist', 'dawn', 'held', 'fallen', 'broker', 'relation']);

export const fillIn = (s: string, v: Record<string, string | number | undefined>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] !== undefined ? String(v[k]) : m));
/** One line of a group, picked by the seed and a key (no Math.random). */
export function pickFrom(state: SimState, xs: Lines | undefined, ...key: (string | number)[]): string {
  if (!xs?.length) return '';
  return xs[deriveRng(state.seed, 'district-line', ...key).int(0, xs.length)]!;
}

export const LEADER_TEMPLATE = 'leader_letter';
const synthetic = (id: string): string => `leader_${id}`;

function letterText(state: SimState, r: DistrictRelation, c: Courier): { title: string; body: string } {
  const to = otherOf(r, c.from);
  const v = { fromLeader: leaderOfDistrict(state, c.from).name, toLeader: leaderOfDistrict(state, to).name, fromDistrict: districtName(state, c.from), toDistrict: districtName(state, to) };
  const t = DL.letters[c.kind];
  return { title: fillIn(t.title, v), body: fillIn(pickFrom(state, t.body, 'body', r.a, r.b, c.sent), v) };
}

function flightOf(state: SimState, r: DistrictRelation, c: Courier, toPersonId: string): Flight {
  const to = otherOf(r, c.from);
  return {
    id: `dl_${r.a}_${r.b}_${c.sent}`, kind: 'letter', templateId: LEADER_TEMPLATE, packetType: LEADER_TEMPLATE,
    fromPersonId: leaderOfDistrict(state, c.from).personId ?? synthetic(c.from), toPersonId,
    // A non-generated id reads as the home district (realm districtOfTownRef), which is right for home's seat.
    fromTownId: seatOf(state, c.from) ?? 'home', toTownId: seatOf(state, to) ?? 'home',
    days: Math.max(1, c.due - c.sent), roadDays: 1,
    ...letterText(state, r, c),
  };
}

/** A letter sets out: a readable copy goes to the live district's leader, or waits in a known leader's inbox. */
function onLetter(state: SimState, r: DistrictRelation, c: Courier): void {
  const live = liveId(state), to = otherOf(r, c.from);
  if (to === live) {
    const lead = ensurePolity(state).leaders[live]?.personId;
    if (lead && state.people[lead]) ensureLetters(state).flight.push(flightOf(state, r, c, lead));
    return;
  }
  const known = ensurePolity(state).leaders[to]?.personId;
  if (c.from !== live || !known) return;
  const box = inboxOf(state, to);
  const f = flightOf(state, r, c, known);
  // Keep only the newest few from this sender: older ones are superseded by what the leader wrote since.
  const mine = box.filter((it) => it.t === 'letter' && it.flight.templateId === LEADER_TEMPLATE && it.flight.fromPersonId === f.fromPersonId);
  const drop = new Set(mine.slice(0, Math.max(0, mine.length + 1 - DPOL.inboxKeepPerSender)));
  const kept = box.filter((it) => !drop.has(it));
  box.length = 0;
  box.push(...kept, { t: 'letter', due: c.due, flight: f });
}

/** A letter lands at the live seat: the leader reads it out (a dawn line through them). */
function onLanded(state: SimState, r: DistrictRelation, c: Courier, to: string): void {
  if (to !== liveId(state)) return;
  news(state, 'letter_in', { leader: leaderOfDistrict(state, to).name, other: districtName(state, c.from), otherLeader: leaderOfDistrict(state, c.from).name, gist: pickFrom(state, DL.gist[c.kind], 'gist', r.a, r.b, c.sent) });
}

export const LETTER_HOOKS: PolityHooks = { onLetter, onLanded };
