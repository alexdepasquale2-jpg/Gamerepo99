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

/** Stub: return a deterministic fallback line. */
export function interpolateLine(opts: unknown): FabricLine {
  const o = (opts ?? {}) as { id?: string; text?: string; seed?: number };
  return {
    id: o.id ?? `stub-line-${o.seed ?? 0}`,
    text: o.text ?? 'stub interpolated line',
    source: 'fallback',
  };
}

/** Stub: always ok. */
export function assertVoice(_opts?: unknown): AssertionResult {
  return { ok: true };
}

/** Stub: one ok assertion. */
export function runFabricAssertions(_opts?: unknown): AssertionResult[] {
  return [{ ok: true }];
}
