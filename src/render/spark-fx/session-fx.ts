/**
 * Session -> spark-fx bridge for the live overworld. A refusal flickers the coal at the
 * person's head (and the refusal line is spoken); burnout snuffs the player's coal before
 * the succession overlay may open (main.ts waits on SUCCESSION_GATE_KEY and SUCCESSION_READY_EVENT).
 */
import type Phaser from 'phaser';
import type { EventBus, PlaySession } from '../../sim';
import { isSuccessionOpen } from '../../sim/succession';
import { FEEL } from '../feel';
import { createBurnoutWatch } from './burnout-watch';
import type { BurnoutPayload, RefusalPayload } from './shared';

/** Game-registry key holding `() => boolean`; the succession overlay waits while it returns false. */
export const SUCCESSION_GATE_KEY = 'successionGate';
/** Emitted on game.events when an open succession offer's gate turns ready (main.ts shows the screen). */
export const SUCCESSION_READY_EVENT = 'hf:succession-ready';

type Pos = { x: number; y: number };
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export type SessionFxOptions = {
  /** World position of a person's head (overworld or interior), if they are on screen. */
  headOf: (personId: string) => Pos | undefined;
  /** World position of the player's coal (chest height). */
  playerPos: () => Pos;
  /** False while the screen is faded (resting); the burnout waits until the player can see it. */
  canPlayBurnout: () => boolean;
  /** Speak a line in the scene's say strip (the refusal line). */
  say?: (line: string) => void;
};

export type SessionFxEntry = { id: 'vfx.refusal' | 'vfx.burnout'; payload: RefusalPayload | BurnoutPayload; at: number };

export type SessionFxHandle = {
  /** QA: recent refusal/burnout fx emitted on the scene bus, oldest first. */
  log: () => SessionFxEntry[];
};

export function attachSessionFx(
  scene: Phaser.Scene,
  session: PlaySession,
  bus: EventBus,
  opts: SessionFxOptions,
): SessionFxHandle {
  const log: SessionFxEntry[] = [];
  const emit = (id: SessionFxEntry['id'], payload: RefusalPayload | BurnoutPayload): void => {
    log.push({ id, payload, at: scene.time.now });
    if (log.length > 20) log.shift();
    bus.emit(id, payload);
  };

  const offJuice = session.onJuice((id, payload) => {
    if (id !== 'refusal.coal_flicker') return;
    const p = (payload ?? {}) as Record<string, unknown>;
    const personId = str(p.personId);
    const head = personId ? opts.headOf(personId) : undefined;
    if (head) emit('vfx.refusal', { x: head.x, y: head.y + 10, kind: str(p.methodId) });
    // The refusal is spoken in the say strip: the surface bubble may be queued behind other lines,
    // and off-screen refusals have no head to carry one.
    const line = str(p.line);
    if (line) opts.say?.(line);
  });

  const watch = createBurnoutWatch(FEEL.burnout.holdMs);
  const gate = (): boolean => watch.ready(isSuccessionOpen(session), scene.time.now);
  let wasReady = false;
  const onUpdate = (): void => {
    const open = isSuccessionOpen(session);
    if (watch.step(open, opts.canPlayBurnout(), scene.time.now)) {
      emit('vfx.burnout', opts.playerPos());
    }
    // Tell the UI once per opening, on the frame the gate turns ready (no polling in main.ts).
    const ready = open && gate();
    if (ready && !wasReady) scene.game.events.emit(SUCCESSION_READY_EVENT);
    wasReady = ready;
  };
  scene.events.on('update', onUpdate);
  scene.registry.set(SUCCESSION_GATE_KEY, gate);

  scene.events.once('shutdown', () => {
    offJuice();
    scene.events.off('update', onUpdate);
    if (scene.registry.get(SUCCESSION_GATE_KEY) === gate) scene.registry.remove(SUCCESSION_GATE_KEY);
  });

  return { log: () => [...log] };
}
