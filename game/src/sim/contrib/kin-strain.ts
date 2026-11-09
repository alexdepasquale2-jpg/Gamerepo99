/**
 * The Drift at dawn: one line a morning about a family the gap has pulled apart, told through the
 * person who feels it ("Ruth's brother went to the city; she hasn't had a letter since spring").
 * Rotates through this town's strained ties first (then the wider world's) so it does not repeat
 * until every tie has been told. Reads only; never changes the world.
 */
import { registerDawnLines } from '../dawn-lines';
import { deriveRng } from '../rng';
import { kinStrainMap, STRAINED, strainedTiesOf, townDisplayName, townGap01, townKind } from '../social/kin-strain';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

type Told = { a: string; b: string; kind: string };

const first = (name: string): string => firstNameOf(name) ?? name;

function placeOf(townId: string | undefined): string {
  const name = townDisplayName(townId) ?? 'away';
  const kind = townKind(townId);
  if (/^the /i.test(name)) return name;
  return kind === 'city' ? `the city at ${name}` : kind === 'village' ? `the village at ${name}` : name;
}

/** Templates by tie: close kin (split by which side of the gap A lives on), friends, letter-friends. */
const FROM_VILLAGE_KIN = [
  (a: string, b: string, at: string) => `${a} says ${b} went off to ${at} years back. No letter since spring.`,
  (a: string, b: string, at: string) => `${a} set a place for ${b} at the harvest supper. A note came from ${at}: they don't keep that day there any more.`,
  (a: string, b: string, at: string) => `${a} visited ${b} in ${at} once. "One table, and nothing to say across it. Like strangers wearing faces we knew."`,
];
const FROM_CITY_KIN = [
  (a: string, b: string, at: string) => `${a} sends coin home to ${b} in ${at}. The letters back are about weather and nothing else.`,
  (a: string, b: string, at: string) => `${a} can't picture ${b}'s days in ${at} any more. "Mud and bells, I suppose. I used to know."`,
  (a: string, b: string, at: string) => `${b} wrote from ${at} asking what ${first(a)} even does all day. ${a} didn't know how to answer.`,
];
const FRIEND_TIE = [
  (a: string, b: string, at: string) => `${a} and ${b} grew up side by side. Now ${b} is in ${at}, and ${first(a)} says they speak two tongues that share the same words.`,
  (a: string, b: string, at: string) => `${b} came back from ${at} for a wedding. ${a} says ${b} laughed at all the wrong moments, and didn't know the old songs.`,
];
const LETTER_TIE = [
  (a: string, b: string, at: string) => `${a} used to write to ${b} in ${at} every season. The letters have thinned to a line or two.`,
  (a: string, b: string, at: string) => `${a} still writes to ${b} in ${at}. Lately the answers read like news from a country ${first(a)} has never seen.`,
];

/** Every strained tie worth telling, one per pair (told from the more strained side), in a seeded order. */
function tieList(state: SimState, townId: string | undefined): Told[] {
  const strain = kinStrainMap(state);
  const out: Told[] = [];
  const seen = new Set<string>();
  for (const [a, s] of Object.entries(strain)) {
    if (s < STRAINED) continue;
    for (const t of strainedTiesOf(state, a)) {
      const pair = a < t.otherId ? `${a}|${t.otherId}` : `${t.otherId}|${a}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const other = strain[t.otherId] ?? 0;
      // Prefer the teller who lives in this town, else the more strained one.
      const aHere = state.people[a]?.townId === townId;
      const bHere = state.people[t.otherId]?.townId === townId;
      const tellA = aHere !== bHere ? aHere : s >= other;
      const told = tellA ? { a, b: t.otherId, kind: t.kind } : { a: t.otherId, b: a, kind: t.kind };
      // Only people the player could know by name carry a story.
      if (state.people[told.a]?.name && state.people[told.b]?.name) out.push(told);
    }
  }
  const keyed = out.map((x) => ({ x, k: deriveRng(state.seed, 'kin-drift', x.a, x.b).next() }));
  return keyed.sort((p, q) => p.k - q.k || p.x.a.localeCompare(q.x.a) || p.x.b.localeCompare(q.x.b)).map((p) => p.x);
}

/** Today's drift line (at most one), or [] when no family here or anywhere is split by the gap. */
export function kinDriftDawnLines(state: SimState): string[] {
  const townId = state.player.townId;
  const all = tieList(state, townId);
  const local = all.filter((t) => state.people[t.a]?.townId === townId || state.people[t.b]?.townId === townId);
  const list = local.length ? local : all;
  if (!list.length) return [];
  const day = Math.abs(state.day);
  const pick = list[day % list.length]!;
  const pa = state.people[pick.a]!;
  const pb = state.people[pick.b]!;
  const ga = townGap01(pa.townId) ?? 0;
  const gb = townGap01(pb.townId) ?? 0;
  const bank =
    pick.kind === 'kin' ? (ga <= gb ? FROM_VILLAGE_KIN : FROM_CITY_KIN) : pick.kind === 'friend' ? FRIEND_TIE : LETTER_TIE;
  // Each time the rotation comes back round, a tie is told in its next wording.
  const lap = Math.floor(day / list.length);
  const tmpl = bank[(deriveRng(state.seed, 'kin-drift-line', pick.a, pick.b).int(0, bank.length) + lap) % bank.length]!;
  return [tmpl(pa.name!, first(pb.name!), placeOf(pb.townId))];
}

registerDawnLines('kin-drift', kinDriftDawnLines);
