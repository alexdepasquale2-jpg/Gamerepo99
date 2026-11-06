/** Per-person continuous state vector for fabric line blending. Pure sim. */

import type { DataTables } from '../load-data';

export type PersonStateVector = {
  warmth: number;
  bite: number;
  piety: number;
  secrecy: number;
  weariness: number;
  flame01: number;
  trust: number;
  hollowness: number;
  notoriety: number;
  kinStrain: number;
};

export type PersonRow = {
  id: string;
  authored?: boolean;
  anchor?: boolean;
  woundId?: string;
  flameStart?: number;
  tags?: string[];
};

export type WorldVectorCtx = {
  trust?: number;
  notoriety?: number;
  flame01?: number;
  hollowness?: number;
  kinStrain?: number;
  data?: DataTables;
};

const VOICE_KEYS = ['warmth', 'bite', 'piety', 'secrecy', 'weariness'] as const;

/** Soft wound-tag → voice defaults when no voice-anchor row exists. */
const WOUND_TAG_DEFAULTS: Record<string, Partial<Record<(typeof VOICE_KEYS)[number], number>>> = {
  cold: { warmth: 0.25, weariness: 0.45 },
  heavy: { weariness: 0.55, piety: 0.4 },
  sharp: { bite: 0.55, secrecy: 0.4 },
  hollow: { secrecy: 0.5, weariness: 0.5 },
};

const BASE_VOICE = {
  warmth: 0.4,
  bite: 0.4,
  piety: 0.35,
  secrecy: 0.35,
  weariness: 0.4,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function isAuthoredAnchor(person: PersonRow | undefined | null): boolean {
  if (!person) return false;
  return person.authored === true || person.anchor === true;
}

function woundDefaults(person: PersonRow, data?: DataTables): typeof BASE_VOICE {
  const out = { ...BASE_VOICE };
  if (!data || !person.woundId) return out;
  const wounds = data.wounds as Array<{ id: string; tags?: string[] }>;
  const wound = wounds.find((w) => w.id === person.woundId);
  for (const tag of wound?.tags ?? []) {
    const patch = WOUND_TAG_DEFAULTS[tag];
    if (!patch) continue;
    for (const k of VOICE_KEYS) {
      if (typeof patch[k] === 'number') out[k] = patch[k]!;
    }
  }
  return out;
}

function anchorVoice(person: PersonRow, data?: DataTables): typeof BASE_VOICE {
  const fallback = woundDefaults(person, data);
  const anchors = data?.voiceAnchors?.anchors;
  if (!anchors) return fallback;
  const row = anchors.find((a) => a.personId === person.id);
  if (!row?.vector) return fallback;
  const out = { ...fallback };
  for (const k of VOICE_KEYS) {
    const n = row.vector[k];
    if (typeof n === 'number') out[k] = clamp01(n);
  }
  return out;
}

/**
 * Build continuous vector for blend curves.
 * Voice dims from voice-anchors (else wound-tag defaults); drives from worldCtx / flameStart.
 */
export function buildStateVector(person: PersonRow, worldCtx: WorldVectorCtx = {}): PersonStateVector {
  const voice = anchorVoice(person, worldCtx.data);
  const flame01 =
    worldCtx.flame01 !== undefined
      ? worldCtx.flame01
      : typeof person.flameStart === 'number'
        ? person.flameStart / 100
        : 0.2;
  return {
    warmth: clamp01(voice.warmth),
    bite: clamp01(voice.bite),
    piety: clamp01(voice.piety),
    secrecy: clamp01(voice.secrecy),
    weariness: clamp01(voice.weariness),
    flame01: clamp01(flame01),
    trust: clamp01(worldCtx.trust ?? 0.5),
    hollowness: clamp01(worldCtx.hollowness ?? 0),
    notoriety: clamp01(worldCtx.notoriety ?? 0),
    kinStrain: clamp01(worldCtx.kinStrain ?? 0),
  };
}
