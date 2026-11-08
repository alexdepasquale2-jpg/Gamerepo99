/** Dynamism voice stubs — interpolate / assert. Pure; gen/ never imports this. */

import {
  assertLineCandidate,
  type LineFragment,
  type LinePerson,
  type VoiceConstraintsInput,
} from './coherence';

export type FabricLine = {
  id: string;
  text: string;
  source?: 'fixed' | 'blend' | 'fallback';
};

export type AssertionResult = {
  ok: boolean;
  violationId?: string;
  message?: string;
};

export type AssertVoiceOpts = {
  id?: string;
  text?: string;
  seed?: number;
  /** Scaffold marker — real dyn must not ship these. */
  source?: 'fixed' | 'blend' | 'fallback';
  /** When set with fragment + constraints, runs assertLineCandidate. */
  person?: LinePerson;
  fragment?: LineFragment;
  tags?: string[];
  constraints?: VoiceConstraintsInput;
};

/** Stub: return a deterministic fallback line. */
export function interpolateLine(opts: unknown): FabricLine {
  const o = (opts ?? {}) as AssertVoiceOpts;
  return {
    id: o.id ?? `stub-line-${o.seed ?? 0}`,
    text: o.text ?? 'stub interpolated line',
    source: 'fallback',
  };
}

/**
 * Reject empty/scaffold text. When person + fragment/tags + constraints are
 * provided, also run assertLineCandidate (Probe can call assertLineCandidate
 * directly for richer results).
 */
export function assertVoice(opts?: unknown): AssertionResult {
  const o = (opts ?? {}) as AssertVoiceOpts;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text) {
    return { ok: false, violationId: 'empty_line', message: 'line text required' };
  }
  if (text.startsWith('stub-voice-') || text === 'stub interpolated line') {
    return {
      ok: false,
      violationId: 'scaffold_line',
      message: 'scaffold voice text not allowed for ship',
    };
  }

  const fragment: LineFragment | undefined =
    o.fragment ?? (o.tags ? { tags: o.tags, text: o.text, id: o.id } : undefined);
  if (o.person && fragment && o.constraints) {
    if (!assertLineCandidate(o.person, fragment, o.constraints)) {
      return {
        ok: false,
        violationId: 'line_coherence',
        message: 'fragment contradicts person memory or voice constraints',
      };
    }
  }

  return { ok: true };
}

/** Run assertVoice over a list of line-like opts. */
export function runFabricAssertions(opts?: unknown): AssertionResult[] {
  const list = Array.isArray(opts) ? opts : opts == null ? [] : [opts];
  if (list.length === 0) return [{ ok: true }];
  return list.map((item) => assertVoice(item));
}
