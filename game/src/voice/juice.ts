/**
 * The juice stream, presented through people and the world. Every surfaced id (reaction-lines.ts) becomes
 * a line over someone's head; VFX ids play at the person or the player. Lines from one act arrive in one
 * burst and are re-ordered so the person answers first, then the wound chemistry, then the mark.
 * While the player sleeps, lines wait for the morning (Blessings and Burdens are spoken at dawn).
 */
import type { GameContext, Pt } from '../app/contracts';
import type { Cue } from './audio';
import type { Fx } from './fx';
import type { People } from './people';
import { presentJuice, SURFACED, woundChemistry, type Presentation } from './reaction-lines';
import type { Tone } from './bubbles';

export type Beat = { personId: string; line: string; tone?: Tone; ember?: boolean; townId?: string };
export type JuiceDeps = {
  ctx: GameContext;
  people: People;
  fx: Fx;
  speak(b: Beat): Promise<void>;
  cue(c: Cue): void;
  /** A short mood swing (reignite, despair) on top of the clock's mood. */
  swing(m: 'reignite' | 'despair'): void;
  resting(): boolean;
  /** Hold a line for the dawn (asleep). */
  hold(b: Beat): void;
  /** Play the burnout as soon as the player can see it. */
  burnout(): void;
};

/** Lower speaks first within one burst. */
const ORDER: Record<string, number> = {
  'refusal.coal_flicker': 0,
  'person.reaction': 1,
  'moment.beat': 1,
  'person.wound': 2,
  'mark.applied': 3,
};
const HARD = new Set(['refusal.coal_flicker', 'patron.broken', 'patron.betrayed', 'stash.theft', 'stash.decay', 'route.break', 'doctrine.collapse', 'status.lose', 'notoriety.fall']);
const LETTER = new Set(['letter.deliver', 'letter.reply', 'packet.deliver', 'rumor.spread']);

type Rec = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function toneOf(id: string, payload: Rec, p: Presentation): Tone | undefined {
  if (HARD.has(id)) return 'hard';
  if (id === 'person.wound') return woundChemistry(payload.woundMul) === 'slid' ? 'hard' : 'warm';
  return p.tell === 'ember' ? 'warm' : undefined;
}

export type JuiceHandle = {
  /** Feed an id as if the sim emitted it (QA). */
  feed(id: string, payload: unknown): void;
  /** Ids seen and how each was presented (QA, last 40). */
  log(): { id: string; how: string }[];
  off(): void;
};

export function attachJuice(d: JuiceDeps): JuiceHandle {
  const { ctx, people, fx } = d;
  let batch: { id: string; p: Presentation; payload: Rec; n: number }[] = [];
  let seq = 0;
  let flushing = false;
  const log: { id: string; how: string }[] = [];
  const note = (id: string, how: string): void => {
    log.push({ id, how });
    if (log.length > 40) log.shift();
  };

  const chest = (personId: string | undefined): Pt | undefined => {
    const h = personId ? ctx.actors.headOf(personId) : undefined;
    return h ? { x: h.x, y: h.y + 10 } : undefined;
  };
  const playerChest = (): Pt => {
    const h = ctx.actors.headOf('player');
    if (h) return { x: h.x, y: h.y + 10 };
    const p = ctx.actors.player.pos();
    return { x: p.x, y: p.y - 14 };
  };

  const flush = (): void => {
    flushing = false;
    const now = batch.sort((a, b) => (ORDER[a.id] ?? 5) - (ORDER[b.id] ?? 5) || a.n - b.n);
    batch = [];
    for (const { id, p, payload } of now) {
      const beat: Beat = { personId: p.personId!, line: p.line!, tone: toneOf(id, payload, p), ember: p.tell === 'ember', townId: p.townId };
      if (d.resting()) {
        d.hold(beat);
        note(id, `held for dawn: ${beat.personId}`);
      } else {
        void d.speak(beat);
        note(id, `line: ${beat.personId}`);
      }
      if (LETTER.has(id)) d.cue('letter');
    }
  };

  /** World effects for ids that have them (a line may come too). */
  const effects = (id: string, payload: Rec): boolean => {
    switch (id) {
      case 'person.reignite':
      case 'site.kindle': {
        if (d.resting()) return true;
        const at = chest(str(payload.personId));
        if (at) fx.reignite(at);
        d.cue('reignite');
        d.swing('reignite');
        note(id, at ? 'reignite burst' : 'reignite (no head)');
        return true;
      }
      case 'refusal.coal_flicker': {
        const at = chest(str(payload.personId));
        if (at && !d.resting()) fx.refusal(at);
        d.cue('refuse');
        return false; // the refusal line is spoken too
      }
      case 'spark.spend':
        if (!d.resting()) fx.spend(playerChest());
        note(id, 'spend pulse');
        return true;
      case 'succession.open':
        d.burnout();
        d.cue('despair');
        d.swing('despair');
        note(id, 'burnout');
        return true;
      default:
        return false;
    }
  };

  const handle = (id: string, raw: unknown): void => {
    const payload = (raw ?? {}) as Rec;
    let done = false;
    try { done = effects(id, payload); } catch (err) { console.error('voice fx failed', id, err); }
    if (done) return;
    let p: Presentation | null = null;
    try { p = presentJuice(id, payload, { nearbyPersonId: (townId, excludeId) => people.carrier(townId, excludeId) }); } catch (err) { console.error('voice juice failed', id, err); }
    if (!p?.personId || !p.line) {
      if (SURFACED[id]) note(id, 'no carrier in sight');
      return;
    }
    batch.push({ id, p, payload, n: seq++ });
    if (!flushing) {
      flushing = true;
      queueMicrotask(flush);
    }
  };

  const off = ctx.session.onJuice(handle);
  return { feed: handle, log: () => [...log], off };
}
