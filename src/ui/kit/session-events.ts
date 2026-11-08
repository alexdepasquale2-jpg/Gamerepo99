/**
 * Session change events for the UI, without polling: wrap the session's mutating calls once and tell
 * every listener after each one returns (act, tick, travel, journey, load, adopt, succession choice).
 * The end screens and the day chip refresh from here.
 */
import type { PlaySession } from '../../sim';

export const SESSION_CHANGE_METHODS = ['start', 'act', 'tick', 'travel', 'journey', 'loadBlob', 'adoptState', 'chooseSuccession'] as const;
export type SessionChange = (typeof SESSION_CHANGE_METHODS)[number];

const LISTENERS = Symbol.for('hf.sessionListeners');
type Watched = PlaySession & { [LISTENERS]?: Set<(m: SessionChange) => void> };

/** Call `fn(method)` after each mutating session call. Returns unwatch. Wraps a session only once. */
export function watchSession(session: PlaySession, fn: (method: SessionChange) => void): () => void {
  const s = session as Watched;
  if (!s[LISTENERS]) {
    const set = new Set<(m: SessionChange) => void>();
    Object.defineProperty(s, LISTENERS, { value: set, enumerable: false });
    const rec = s as unknown as Record<string, unknown>;
    for (const m of SESSION_CHANGE_METHODS) {
      const orig = rec[m];
      if (typeof orig !== 'function') continue;
      rec[m] = (...args: unknown[]) => {
        const out = (orig as (...a: unknown[]) => unknown).apply(s, args);
        for (const l of [...set]) l(m);
        return out;
      };
    }
  }
  s[LISTENERS]!.add(fn);
  return () => void s[LISTENERS]!.delete(fn);
}
