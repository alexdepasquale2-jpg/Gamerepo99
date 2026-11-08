/**
 * Procedural WebAudio (no assets), repurposed from the old src/render/sfx.ts. One AudioContext for cues and
 * music, created only after the player's first input; one mute flag persisted under `hf.sfx.muted`.
 */

export type Cue = 'reignite' | 'letter' | 'dawn' | 'despair' | 'act' | 'refuse' | 'pickup' | 'open' | 'close';

const KEY = 'hf.sfx.muted';
let ac: AudioContext | null = null;
let out: GainNode | null = null;
let unlocked = false;
let muted = ((): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const muteSubs = new Set<(m: boolean) => void>();
const unlockSubs = new Set<() => void>();

export const isMuted = (): boolean => muted;
export const isUnlocked = (): boolean => unlocked;

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
  if (out && ac) out.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.05);
  for (const fn of muteSubs) fn(muted);
}
export const toggleMuted = (): boolean => (setMuted(!muted), muted);
export function onMute(fn: (m: boolean) => void): () => void {
  muteSubs.add(fn);
  return () => void muteSubs.delete(fn);
}
export function onUnlock(fn: () => void): () => void {
  if (unlocked) fn();
  unlockSubs.add(fn);
  return () => void unlockSubs.delete(fn);
}

/** The shared context and master out, or null before the first input / without WebAudio. */
export function audio(): { ac: AudioContext; out: GainNode } | null {
  if (!unlocked || typeof AudioContext === 'undefined') return null;
  try {
    if (!ac) {
      ac = new AudioContext();
      out = ac.createGain();
      out.gain.value = muted ? 0 : 1;
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') void ac.resume();
    return { ac, out: out! };
  } catch {
    return null;
  }
}

/** Arm the first-input unlock (pointer, key or touch). Safe to call more than once. */
export function armUnlock(): () => void {
  if (unlocked) return () => {};
  const go = (): void => {
    if (unlocked) return;
    unlocked = true;
    off();
    audio();
    for (const fn of [...unlockSubs]) fn();
  };
  const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
  for (const e of evs) window.addEventListener(e, go, { capture: true, passive: true });
  const off = (): void => { for (const e of evs) window.removeEventListener(e, go, { capture: true }); };
  return off;
}

/** [freq Hz, start s, dur s, type, gain] */
type Note = [number, number, number, OscillatorType, number];
const CUES: Record<Cue, Note[]> = {
  reignite: [[262, 0, 0.5, 'triangle', 0.18], [392, 0.1, 0.5, 'triangle', 0.16], [523, 0.2, 0.8, 'sine', 0.18], [784, 0.34, 0.9, 'sine', 0.08]],
  letter: [[880, 0, 0.12, 'sine', 0.12], [1175, 0.1, 0.25, 'sine', 0.1]],
  dawn: [[330, 0, 0.9, 'sine', 0.12], [440, 0.25, 0.9, 'sine', 0.12], [660, 0.5, 1.2, 'sine', 0.1]],
  despair: [[196, 0, 0.7, 'sawtooth', 0.07], [147, 0.3, 1.1, 'sawtooth', 0.07]],
  act: [[523, 0, 0.09, 'triangle', 0.08], [659, 0.05, 0.14, 'triangle', 0.06]],
  refuse: [[220, 0, 0.16, 'square', 0.05], [175, 0.09, 0.26, 'square', 0.045]],
  pickup: [[740, 0, 0.07, 'triangle', 0.08], [988, 0.05, 0.12, 'triangle', 0.07]],
  open: [[392, 0, 0.08, 'sine', 0.07], [523, 0.04, 0.12, 'sine', 0.06]],
  close: [[523, 0, 0.08, 'sine', 0.06], [392, 0.04, 0.12, 'sine', 0.05]],
};

/** Cues that may not stack: a second one within this window is skipped. */
const MIN_GAP_S = 0.06;
const lastAt = new Map<Cue, number>();

export function playCue(cue: Cue): void {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const { ac: c, out: o } = a;
  const t0 = c.currentTime;
  if (t0 - (lastAt.get(cue) ?? -1) < MIN_GAP_S) return;
  lastAt.set(cue, t0);
  try {
    for (const [f, at, dur, type, g] of CUES[cue]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(g, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(o);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    }
  } catch { /* audio unavailable */ }
}
