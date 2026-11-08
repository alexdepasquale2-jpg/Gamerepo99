/**
 * C8 + D7: a real voice for people without their own fragments (the generated villagers), and
 * city / town / village speech for everyone.
 *
 * Voice: each person keeps one generic voice across methods (fragments tagged `generic:<voice>`): a
 * grieving wound speaks as the widow, else the job picks it (data/dialogue/generic-voices.json), else
 * the seeded voice hash. A line is composed from slots: an optional opener piece for the place they
 * live (`generic_piece`, `slot:opener`, `place:<kind>`) and a body (their voice's alone/middle lines
 * for the method, or a place line anyone there might say). Their worldgen vector leans the body toward
 * matching `tone:` tags; drives gate axis lines (`requiresAny`: spark:low, trust:high, kin:strain).
 *
 * Place: the settlement kind of the person's town (city | town | village). Lines tagged for another
 * place are dropped for generated voices and nearly silenced for authored ones (placeBias). Pure.
 */
import voicesJson from '../../data/dialogue/generic-voices.json';
import { jobOf } from '../goods/jobs';
import type { SettlementKind } from '../map/world-layout';
import type { ReactionLineResult, ReactionPickCtx } from '../method-reactions';
import { createRng } from '../rng';
import { townKind } from '../social/kin-strain';
import { generatedVector, type VoiceVector } from '../social/seeded-wounds';
import { scoreFragment, violatesConstraints, type Constraint, type Frag } from './line-score';

type VoicesFile = {
  byWound: Record<string, string>;
  byJob: Record<string, string>;
  openerChance: number;
  placeMatchBonus: number;
  placeMismatchMul: number;
  toneBias: number;
  sparkLowBelow: number;
  strainBonus: number;
  trustHighAbove: number;
};
const CFG = voicesJson as VoicesFile;

const TONE_DIM: Record<string, keyof VoiceVector> = {
  'tone:warm': 'warmth',
  'tone:bite': 'bite',
  'tone:pious': 'piety',
  'tone:guarded': 'secrecy',
  'tone:weary': 'weariness',
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const tagsOf = (f: Frag): string[] => f.tags ?? [];
const voiceTagOf = (f: Frag): string | undefined => tagsOf(f).find((t) => t.startsWith('generic:'))?.slice('generic:'.length);
const isKinStrainFrag = (f: Frag): boolean => tagsOf(f).includes('axis:kin_strain');
/** A whole line that can carry an opener: the old alone lines, and the newer middle-slot voice lines. */
const isBody = (f: Frag): boolean => {
  const tags = tagsOf(f);
  if (tags.includes('generic_piece')) return false;
  if (f.slot === 'alone' || tags.includes('slot:alone')) return true;
  return (f.slot === 'middle' || tags.includes('slot:middle')) && tags.includes('generic_voice');
};

/** The settlement kind of where this person lives (city | town | village), if known. */
export function placeOf(state: ReactionPickCtx['state'], personId: string): SettlementKind | undefined {
  return townKind(state.people[personId]?.townId);
}

export const placeTagOf = (f: Frag): string | undefined =>
  tagsOf(f).find((t) => t.startsWith('place:'))?.slice('place:'.length);

/** D7 bias on a score: a line for this place is lifted, one for another place nearly silenced, untagged untouched. */
export function placeBias(f: Frag, place: string | undefined, score: number): number {
  const p = placeTagOf(f);
  if (!p) return score;
  if (p === place) return score + CFG.placeMatchBonus;
  return Math.max(0.01, score * CFG.placeMismatchMul);
}

/** This person's generic voice among those present. Stable across methods. */
export function genericVoiceOf(ctx: ReactionPickCtx, voices: string[]): string {
  const person = ctx.state.people[ctx.personId];
  const byWound = person?.woundId ? CFG.byWound[person.woundId] : undefined;
  if (byWound && voices.includes(byWound)) return byWound;
  const byJob = CFG.byJob[jobOf(ctx.state, ctx.personId).id];
  if (byJob && voices.includes(byJob)) return byJob;
  return voices[hashStr(`${ctx.seed}:${ctx.personId}:voice`) % voices.length]!;
}

function toneBonus(f: Frag, vec: VoiceVector | undefined): number {
  if (!vec) return 0;
  let out = 0;
  for (const t of tagsOf(f)) {
    const dim = TONE_DIM[t];
    if (dim) out += (vec[dim] ?? 0) * CFG.toneBias;
  }
  return out;
}

function pick<T>(items: T[], scores: number[], r01: number): T {
  let r = r01 * scores.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= scores[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export type GenericVoiceArgs = { memory: Set<string>; strained: boolean; constraints: Constraint[] };

/** A composed line in this person's generic voice for the method, or null when no voice covers it. */
export function genericVoiceLine(ctx: ReactionPickCtx, a: GenericVoiceArgs): ReactionLineResult | null {
  const frags = (ctx.state.data.lineFragments?.fragments ?? []) as Frag[];
  const methodTag = `method:${ctx.methodId}`;
  const voiced = frags.filter((f) => !!f.text && !!voiceTagOf(f) && tagsOf(f).includes(methodTag) && isBody(f));
  const voices = [...new Set(voiced.map((f) => voiceTagOf(f)!))].filter((v) => v !== 'any').sort();
  if (!voices.length) return null;
  const voice = genericVoiceOf(ctx, voices);
  const place = placeOf(ctx.state, ctx.personId);

  const person = ctx.state.people[ctx.personId];
  const flagTrust = (ctx.state.flags as { trust?: number }).trust;
  const trust = typeof person?.trust === 'number' ? person.trust : typeof flagTrust === 'number' ? flagTrust : 0.5;
  const flame01 = typeof person?.flame === 'number' ? person.flame / 100 : 0.2;
  const hollowness = Math.min(1, (person?.marks?.find((m) => m.markId === 'hollowness')?.stacks ?? 0) / 3);
  const drives = new Set<string>();
  if (flame01 < CFG.sparkLowBelow) drives.add('spark:low');
  if (trust > CFG.trustHighAbove) drives.add('trust:high');
  if (a.strained) drives.add('kin:strain');

  const allowed = voiced.filter((f) => {
    const v = voiceTagOf(f);
    if (v !== voice && v !== 'any') return false;
    if (isKinStrainFrag(f) && !a.strained) return false;
    const req = (f as Frag & { requiresAny?: string[] }).requiresAny;
    if (req?.length && !req.some((t) => drives.has(t))) return false;
    const fp = placeTagOf(f);
    if (fp && fp !== place) return false;
    return !violatesConstraints(f, a.memory, a.constraints);
  });
  // A voice's own written kin-strain line replaces the old suffixed one ("... Family makes it heavier.").
  const ownStrain = allowed.some((f) => isKinStrainFrag(f) && tagsOf(f).includes('generic_voice'));
  const pool = allowed.filter((f) => !(ownStrain && isKinStrainFrag(f) && !tagsOf(f).includes('generic_voice')));
  if (!pool.length) return null;

  const vec = generatedVector(ctx.personId);
  const scores = pool.map((f) => {
    let s = scoreFragment(f, {}, a.memory, { trust, flame01, hollowness }) + toneBonus(f, vec);
    // Family split by the drift is often on a strained mind, not every time.
    if (isKinStrainFrag(f)) s += CFG.strainBonus;
    return placeBias(f, place, s);
  });
  // Varies day to day and as their flame moves; stable for the same moment.
  const rng = createRng((ctx.seed ^ hashStr(`${ctx.personId}:${ctx.methodId}:${ctx.state.day}:${person?.flame ?? 0}:generic`)) >>> 0);
  const body = pick(pool, scores, rng.next());

  if (place && !placeTagOf(body) && !body.text.includes('—') && rng.next() < CFG.openerChance) {
    const openers = frags.filter((f) => !!f.text && tagsOf(f).includes('generic_piece') && f.slot === 'opener' && placeTagOf(f) === place);
    if (openers.length) {
      const o = openers[rng.int(0, openers.length)]!;
      // "Look," runs on into the line ("Look, don't rock the boat"); "I" stays upper case.
      const rest = o.text.endsWith(',') && !/^I\b/.test(body.text) ? body.text[0]!.toLowerCase() + body.text.slice(1) : body.text;
      return { lineId: `${o.id}+${body.id}`, text: `${o.text} ${rest}`, source: 'blend' };
    }
  }
  return { lineId: body.id, text: body.text, source: 'blend' };
}
