/** Dynamism voice stubs — interpolate / assert. Pure; gen/ never imports this. */

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
 * Stub with fail paths: rejects empty/missing text and obvious scaffold markers.
 * Full coherence lives in Fabric Task D.
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
  return { ok: true };
}

/** Run assertVoice over a list of line-like opts. */
export function runFabricAssertions(opts?: unknown): AssertionResult[] {
  const list = Array.isArray(opts) ? opts : opts == null ? [] : [opts];
  if (list.length === 0) return [{ ok: true }];
  return list.map((item) => assertVoice(item));
}
