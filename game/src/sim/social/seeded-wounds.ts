/**
 * B12: every resident carries a wound, so method chemistry ("landed deep / slid off") works on everyone,
 * not only the twelve authored anchors. A generated villager's wound is drawn from their own seeded
 * stream (deriveRng(seed, id, 'wound')), weighted by their voice vector: a cold, weary voice leans to
 * apathy, a warm pious one to grief, a biting one to disillusionment. Derived from the seed, so a fresh
 * boot and a backfilled old save give the same person the same wound. Pure.
 */
import { generatePersonDraft } from '../gen/society/people';
import { deriveRng } from '../rng';
import type { PersonState } from '../types/runtime';

export type VoiceVector = Partial<Record<'warmth' | 'bite' | 'piety' | 'secrecy' | 'weariness', number>>;

/** How strongly each voice leans toward each wound (wounds.json ids). Unknown wound ids get the floor. */
const LEAN: Record<string, (v: Required<VoiceVector>) => number> = {
  apathy: (v) => (1 - v.warmth) * 0.6 + v.weariness * 0.4,
  grief: (v) => v.warmth * 0.5 + v.piety * 0.5,
  fear: (v) => v.secrecy * 0.6 + (1 - v.bite) * 0.4,
  exhaustion: (v) => v.weariness * 0.8 + (1 - v.secrecy) * 0.2,
  disillusionment: (v) => v.bite * 0.6 + (1 - v.piety) * 0.4,
  shame_wound: (v) => v.secrecy * 0.5 + v.piety * 0.3 + (1 - v.warmth) * 0.2,
};
/** Every wound stays possible for every voice. */
const FLOOR = 0.15;

const GEN_ID = /^gen_p_(\d+)_(\d+)$/;

/** A generated villager's worldgen voice vector, rebuilt from their id (gen_p_<seed>_<index>); else undefined. */
export function generatedVector(personId: string): VoiceVector | undefined {
  const m = GEN_ID.exec(personId);
  if (!m) return undefined;
  return generatePersonDraft({ seed: Number(m[1]), index: Number(m[2]) }).vector;
}

/** The wound this person's seed and vector give them. */
export function seededWoundId(seed: number, personId: string, vector: VoiceVector | undefined, woundIds: string[]): string | undefined {
  if (!woundIds.length) return undefined;
  const v: Required<VoiceVector> = { warmth: 0.5, bite: 0.5, piety: 0.5, secrecy: 0.5, weariness: 0.5, ...vector };
  const weights = woundIds.map((id) => FLOOR + Math.max(0, LEAN[id]?.(v) ?? 0));
  let r = deriveRng(seed, personId, 'wound').next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < woundIds.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return woundIds[i];
  }
  return woundIds[woundIds.length - 1];
}

export const woundIdsOf = (data: { wounds?: unknown[] }): string[] =>
  ((data.wounds ?? []) as { id?: unknown }[]).map((w) => w.id).filter((id): id is string => typeof id === 'string');

/**
 * Give a seeded wound to every listed person who has none. `vectorOf` supplies the voice vector
 * (worldgen drafts at boot; rebuilt from the id on load). Returns how many were given one.
 */
export function seedWounds(
  people: Record<string, PersonState>,
  seed: number,
  woundIds: string[],
  vectorOf: (personId: string) => VoiceVector | undefined,
  only?: (personId: string) => boolean,
): number {
  let n = 0;
  for (const p of Object.values(people)) {
    if (p.woundId || (only && !only(p.id))) continue;
    const w = seededWoundId(seed, p.id, vectorOf(p.id), woundIds);
    if (w) {
      p.woundId = w;
      n += 1;
    }
  }
  return n;
}

/** Old saves (before B12): generated villagers without a wound get the one a fresh boot would give them. */
export function backfillSeededWounds(state: { seed: number; people: Record<string, PersonState>; data?: unknown }): number {
  return seedWounds(state.people, state.seed, woundIdsOf((state.data ?? {}) as { wounds?: unknown[] }), generatedVector, (id) => GEN_ID.test(id));
}
