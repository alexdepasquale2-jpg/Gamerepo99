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
  /** Someone in (or near) the town to carry a town-level line; `excludeId` asks for someone else if possible. */
  nearbyPersonId?: (townId?: string, excludeId?: string) => string | undefined;
};

type FallbackFile = {
  lines: Record<string, string[]>;
  woundChemistry: { deepAtLeast: number; slidAtMost: number };
  notorietyLevels: { id: string; min: number }[];
};
const FILE = fallbackJson as FallbackFile;
const FALLBACK = FILE.lines;

function pickFallback(key: string, seed: string): string {
  const arr = FALLBACK[key] ?? [];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr.length ? arr[h % arr.length]! : '';
}

/** `base.specific` when authored, else `base`. */
const keyed = (base: string, specific: string | undefined): string =>
  specific && FALLBACK[`${base}.${specific}`]?.length ? `${base}.${specific}` : base;

/** Wound x method chemistry bucket: 'deep' / 'slid' when clearly off 1, else null (no line). */
export function woundChemistry(mul: unknown): 'deep' | 'slid' | null {
  if (typeof mul !== 'number' || !Number.isFinite(mul)) return null;
  if (mul >= FILE.woundChemistry.deepAtLeast) return 'deep';
  if (mul <= FILE.woundChemistry.slidAtMost) return 'slid';
  return null;
}

/** Highest authored notoriety level whose min the value reaches (levels in surface-fallbacks.json). */
export function notorietyLevel(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  let at: string | null = null;
  for (const l of FILE.notorietyLevels) if (n >= l.min) at = l.id;
  return at;
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

/** A town-level line carried by someone in the crowd, not the person the act was about. */
const crowd =
  (cue: string, key: (p: P) => string | null, tell: Tell): Entry =>
  (p, ctx) => {
    const k = key(p);
    if (!k) return null;
    const townId = str(p.townId);
    const personId = ctx.nearbyPersonId?.(townId, str(p.personId)) ?? str(p.personId);
    const line = personId ? pickFallback(k, personId + k) : '';
    return personId && line ? { kind: 'line', personId, townId, tell, cue, line } : null;
  };

/** The person's own line, from a fallback key chosen off the payload (null key = say nothing). */
const ownKeyed =
  (cue: string, key: (p: P) => string | null, tell: Tell): Entry =>
  (p) => {
    const personId = str(p.personId);
    const k = key(p);
    const line = personId && k ? pickFallback(k, personId + k + (str(p.interactionId) ?? '')) : '';
    return personId && line ? { kind: 'line', personId, tell, cue, line } : null;
  };

/** A road encounter is told back to you by someone at the far end (quiet stretches stay quiet). */
const road: Entry = (p, ctx) => {
  if (p.quiet === true) return null;
  const townId = str(p.townId);
  const personId = str(p.personId) ?? ctx.nearbyPersonId?.(townId);
  return personId ? { kind: 'line', personId, townId, tell: 'glance', cue: 'road', line: str(p.line) ?? pickFallback('road_encounter', personId + str(p.encounterId)) } : null;
};

const tint: Entry = (p) => ({ kind: 'tint', personId: str(p.personId), tell: 'none', cue: 'reignite' });

/** A townsperson in `townKey`'s town says the line (payload text first, else a fallback). */
const inTown =
  (cue: string, fb: string, tell: Tell, townKey: string, text?: (p: P) => string | undefined): Entry =>
  (p, ctx) => {
    const townId = str(p[townKey]);
    const personId = ctx.nearbyPersonId?.(townId);
    return personId ? { kind: 'line', personId, townId, tell, cue, line: text?.(p) ?? pickFallback(fb, personId + fb) } : null;
  };

/** Every juice id that surfaces. */
export const SURFACED: Record<string, Entry> = {
  'person.reaction': own('reaction', 'unspoken', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'refusal.coal_flicker': own('refusal', 'unspoken', 'none', (p) => str(p.personId), (p) => str(p.line)),
  // An authored moment landing (sim/scenario/moments-live): its line, from the person it happened to.
  'moment.beat': own('moment', 'unspoken', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'letter.deliver': own('letter', 'letter', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'rumor.spread': own('rumor', 'rumor', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'history.told': own('history', 'unspoken', 'none', (p) => str(p.personId), (p) => str(p.line)),
  'doctrine.voice': nearby('doctrine', 'doctrine_voice', 'none'),
  'doctrine.exposed': nearby('doctrine', 'doctrine_exposed', 'none'),
  'doctrine.suppressed': nearby('doctrine', 'doctrine_suppressed', 'none'),
  'doctrine.swap': nearby('doctrine', 'doctrine_swap', 'none'),
  'doctrine.collapse': nearby('doctrine', 'doctrine_collapse', 'none'),
  // Inner state, through the person: wound x method chemistry, the mark an act left, what the crowd now grants you.
  'person.wound': ownKeyed('wound', (p) => {
    const b = woundChemistry(p.woundMul);
    return b ? keyed(`wound_${b}`, str(p.woundId)) : null;
  }, 'none'),
  'mark.applied': ownKeyed('mark', (p) => (str(p.markId) ? keyed('mark', str(p.markId)) : null), 'glance'),
  'status.gain': crowd('status', (p) => keyed('status_gain', str(p.traitId)), 'glance'),
  'notoriety.rise': crowd('notoriety', (p) => keyed('notoriety_rise', notorietyLevel(p.notoriety) ?? undefined), 'glance'),
  'notoriety.fall': crowd('notoriety', () => 'notoriety_fall', 'glance'),
  'notoriety.attractor': nearby('notoriety', 'notoriety_attractor', 'glance'),
  'stash.theft': nearby('notoriety', 'stash_theft', 'glance'),
  'kin.birth': own('kin', 'kin_birth', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'kin.grown': own('kin', 'kin_grown', 'glance', (p) => str(p.personId), (p) => str(p.line)),
  'encounter.spawn': road,
  'person.reignite': tint,
  'site.kindle': tint,
  // Unsilenced: the world's quieter news, always through someone nearby.
  'packet.deliver': inTown('rumor', 'packet_deliver', 'none', 'toTownId'),
  'status.lose': nearby('notoriety', 'status_lose', 'glance'),
  'route.break': nearby('notoriety', 'route_break', 'none'),
  'stock.deliver': inTown('letter', 'stock_deliver', 'none', 'townId'),
  'caravan.arrive': inTown('letter', 'caravan_arrive', 'none', 'townId'),
  'caravan.trade': inTown('letter', 'caravan_trade', 'none', 'townId'),
  'caravan.depart': inTown('letter', 'caravan_depart', 'none', 'townId'),
  'letter.reply': inTown('letter', 'letter_reply', 'none', 'toTownId'),
  'succession.carried': own('reignite', 'succession_carried', 'ember', (p) => str(p.heirPersonId)),
  'succession.rested': nearby('reaction', 'succession_rested', 'none'),
  'legend.heard': own('rumor', 'legend_heard', 'none', (p) => str(p.personId), (p) => (Array.isArray(p.lines) ? str(p.lines[0]) : undefined)),
  'legend.act': own('reaction', 'legend_act', 'none', (p) => str(p.personId)),
  'grave.found': inTown('reaction', 'grave_found', 'none', 'townId', (p) => str(p.line)),
};

/** Deliberately not surfaced here (sound/VFX in Task C, or world-level LOD). Economy LOD ids stay silent pending sign-off. */
export const SILENT: readonly string[] = [
  // Sender-side or VFX-only: the delivery/arrival side surfaces instead.
  'packet.emit', 'spark.spend', 'route.travel_step', 'stock.starve',
  'stash.guard_left', 'patron.deal', 'patron.fulfilled', 'patron.broken', 'patron.betrayed',
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
