/** Event-to-presentation adapter: juice id -> reaction line / tell / tint / cue key. Pure; no Phaser/DOM, no sim writes. */

import fallbackJson from '../../data/dialogue/surface-fallbacks.json';

export type Tell = 'ember' | 'glance' | 'none';
export type Presentation = {
  kind: 'line' | 'tint';
  personId?: string;
  townId?: string;
  line?: string;
  tell: Tell;
  /** Stable key Task C maps to a sound; unused here. */
  cue: string;
};

export type PresentCtx = {
  /** Someone in (or near) the town to carry a town-level line. */
  nearbyPersonId?: (townId?: string) => string | undefined;
};

const FALLBACK = (fallbackJson as { lines: Record<string, string[]> }).lines;

function pickFallback(key: string, seed: string): string {
  const arr = FALLBACK[key] ?? [];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr.length ? arr[h % arr.length]! : '';
}

type P = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

type Entry = (p: P, ctx: PresentCtx) => Presentation | null;

const own =
  (cue: string, fb: string, tell: Tell, who: (p: P) => string | undefined, text?: (p: P) => string | undefined): Entry =>
  (p) => {
    const personId = who(p);
    return personId ? { kind: 'line', personId, tell, cue, line: text?.(p) ?? pickFallback(fb, personId) } : null;
  };

const nearby =
  (cue: string, fb: string, tell: Tell): Entry =>
  (p, ctx) => {
    const townId = str(p.townId);
    const personId = str(p.personId) ?? ctx.nearbyPersonId?.(townId);
    return personId ? { kind: 'line', personId, townId, tell, cue, line: pickFallback(fb, personId + fb) } : null;
  };

const tint: Entry = (p) => ({ kind: 'tint', personId: str(p.personId), tell: 'none', cue: 'reignite' });

/** Every juice id that surfaces. */
export const SURFACED: Record<string, Entry> = {
  'person.reaction': own('reaction', 'unspoken', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'refusal.coal_flicker': own('refusal', 'unspoken', 'none', (p) => str(p.personId), (p) => str(p.line)),
  'letter.deliver': own('letter', 'letter', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'rumor.spread': own('rumor', 'rumor', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'doctrine.voice': nearby('doctrine', 'doctrine_voice', 'none'),
  'doctrine.exposed': nearby('doctrine', 'doctrine_exposed', 'none'),
  'doctrine.suppressed': nearby('doctrine', 'doctrine_suppressed', 'none'),
  'doctrine.swap': nearby('doctrine', 'doctrine_swap', 'none'),
  'doctrine.collapse': nearby('doctrine', 'doctrine_collapse', 'none'),
  'notoriety.rise': nearby('notoriety', 'notoriety_rise', 'glance'),
  'notoriety.attractor': nearby('notoriety', 'notoriety_attractor', 'glance'),
  'stash.theft': nearby('notoriety', 'stash_theft', 'glance'),
  'person.reignite': tint,
  'site.kindle': tint,
};

/** Deliberately not surfaced here (sound/VFX in Task C, or world-level LOD). Economy LOD ids stay silent pending sign-off. */
export const SILENT: readonly string[] = [
  'packet.emit', 'packet.deliver', 'mark.applied', 'status.gain', 'status.lose', 'spark.spend',
  'route.break', 'route.travel_step', 'encounter.spawn', 'stock.deliver', 'stock.starve',
  'stash.guard_left', 'patron.deal', 'patron.fulfilled', 'patron.broken', 'patron.betrayed',
  'succession.carried', 'succession.rested', 'legend.heard', 'legend.act', 'grave.found',
];

export function presentJuice(id: string, payload: unknown, ctx: PresentCtx = {}): Presentation | null {
  const fn = SURFACED[id];
  return fn ? fn((payload ?? {}) as P, ctx) : null;
}

export type Bubble = { personId: string; line: string; tell: Tell; ttlMs: number };

/** Max one bubble per person; later lines queue behind it. */
export function createBubbleQueue(durationMs = 2600) {
  const active = new Map<string, Bubble>();
  const waiting = new Map<string, Bubble[]>();
  return {
    push(p: Presentation): void {
      if (p.kind !== 'line' || !p.personId || !p.line) return;
      const b: Bubble = { personId: p.personId, line: p.line, tell: p.tell, ttlMs: durationMs };
      if (!active.has(b.personId)) active.set(b.personId, b);
      else waiting.set(b.personId, [...(waiting.get(b.personId) ?? []), b]);
    },
    tick(dtMs: number): void {
      for (const [id, b] of [...active]) {
        b.ttlMs -= dtMs;
        if (b.ttlMs > 0) continue;
        active.delete(id);
        const next = waiting.get(id)?.shift();
        if (next) active.set(id, next);
      }
    },
    active: (): Bubble[] => [...active.values()],
  };
}
