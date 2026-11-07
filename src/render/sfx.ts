/** Procedural WebAudio cues (no assets). Presentation-only; muted state persists in localStorage. */
export type Cue = 'reignite' | 'letter' | 'dawn' | 'despair';

const KEY = 'hf.sfx.muted';
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export const sfxMuted = (): boolean => muted;
export function toggleSfxMute(): boolean {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

/** [freq Hz, start s, dur s, type, gain] */
const CUES: Record<Cue, [number, number, number, OscillatorType, number][]> = {
  reignite: [[262, 0, 0.5, 'triangle', 0.18], [392, 0.1, 0.5, 'triangle', 0.16], [523, 0.2, 0.8, 'sine', 0.18]],
  letter: [[880, 0, 0.12, 'sine', 0.12], [1175, 0.1, 0.25, 'sine', 0.1]],
  dawn: [[330, 0, 0.9, 'sine', 0.12], [440, 0.25, 0.9, 'sine', 0.12], [660, 0.5, 1.2, 'sine', 0.1]],
  despair: [[196, 0, 0.7, 'sawtooth', 0.07], [147, 0.3, 1.1, 'sawtooth', 0.07]],
};

export function playSfx(cue: Cue): void {
  if (muted || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [f, at, dur, type, g] of CUES[cue]) {
      const o = ctx.createOscillator(), gain = ctx.createGain();
      o.type = type; o.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(g, t0 + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(gain).connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    }
  } catch { /* audio unavailable */ }
}
