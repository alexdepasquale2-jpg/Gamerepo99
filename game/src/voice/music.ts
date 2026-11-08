/**
 * Procedural music moods on the shared AudioContext: a slow pad under sparse plucked notes, one scale and
 * tempo per mood. Moods change on the next beat; pads overlap, so a change is a soft crossfade.
 * Starts only after the first input (audio.ts unlock) and goes through the shared mute.
 */
import { audio, isMuted, onUnlock } from './audio';

export type Mood = 'day' | 'dusk' | 'night' | 'despair' | 'reignite';

type MoodDef = {
  root: number;
  scale: number[];
  bpm: number;
  /** Chance of a plucked note on each beat. */
  density: number;
  pad: OscillatorType;
  padGain: number;
  pluckGain: number;
  /** Low-pass cutoff for the whole bed (darker moods sit lower). */
  cutoff: number;
};

const MOODS: Record<Mood, MoodDef> = {
  day: { root: 220, scale: [0, 2, 4, 7, 9], bpm: 70, density: 0.45, pad: 'triangle', padGain: 0.05, pluckGain: 0.06, cutoff: 2400 },
  dusk: { root: 196, scale: [0, 2, 3, 7, 10], bpm: 58, density: 0.32, pad: 'triangle', padGain: 0.05, pluckGain: 0.05, cutoff: 1700 },
  night: { root: 165, scale: [0, 3, 5, 7, 10], bpm: 46, density: 0.2, pad: 'sine', padGain: 0.06, pluckGain: 0.04, cutoff: 1100 },
  despair: { root: 147, scale: [0, 1, 3, 7, 8], bpm: 38, density: 0.12, pad: 'sawtooth', padGain: 0.022, pluckGain: 0.035, cutoff: 700 },
  reignite: { root: 262, scale: [0, 4, 7, 11, 14], bpm: 84, density: 0.7, pad: 'triangle', padGain: 0.05, pluckGain: 0.07, cutoff: 3200 },
};

const LOOKAHEAD_S = 0.6;
const BAR = 4;
const MASTER = 0.55;

const hz = (root: number, semis: number): number => root * Math.pow(2, semis / 12);

export type Music = { set(m: Mood): void; current(): Mood; stop(): void };

export function createMusic(initial: Mood = 'day'): Music {
  let mood: Mood = initial;
  let bus: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextBeat = 0;
  let beat = 0;
  let stopped = false;

  const ensureBus = (): { ac: AudioContext; bus: GainNode; filter: BiquadFilterNode } | null => {
    const a = audio();
    if (!a) return null;
    if (!bus || !filter) {
      filter = a.ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = MOODS[mood].cutoff;
      bus = a.ac.createGain();
      bus.gain.value = 0;
      bus.gain.setTargetAtTime(MASTER, a.ac.currentTime, 1.5);
      filter.connect(bus).connect(a.out);
    }
    return { ac: a.ac, bus, filter };
  };

  const voice = (ac: AudioContext, dest: AudioNode, f: number, type: OscillatorType, at: number, attack: number, hold: number, release: number, g: number): void => {
    const o = ac.createOscillator();
    const v = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(g, at + attack);
    v.gain.setValueAtTime(g, at + attack + hold);
    v.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    o.connect(v).connect(dest);
    o.start(at);
    o.stop(at + attack + hold + release + 0.05);
  };

  const scheduleBeat = (ac: AudioContext, dest: AudioNode, at: number): void => {
    const m = MOODS[mood];
    const spb = 60 / m.bpm;
    // Every two bars: a pad chord (root, fifth, one colour note), long enough to overlap the next.
    if (beat % (BAR * 2) === 0) {
      const colour = m.scale[1 + Math.floor(Math.random() * (m.scale.length - 1))] ?? 7;
      const len = spb * BAR * 2;
      for (const s of [0, 7, colour + 12]) voice(ac, dest, hz(m.root / 2, s), m.pad, at, len * 0.35, len * 0.4, len * 0.6, m.padGain / 3);
    }
    // Sparse plucks over it; the downbeat is a little likelier.
    const p = beat % BAR === 0 ? m.density * 1.3 : m.density;
    if (Math.random() < p) {
      const deg = m.scale[Math.floor(Math.random() * m.scale.length)] ?? 0;
      const oct = Math.random() < 0.3 ? 12 : 0;
      voice(ac, dest, hz(m.root, deg + oct), 'triangle', at, 0.01, 0.04, spb * 1.6, m.pluckGain);
    }
    beat++;
  };

  const pump = (): void => {
    if (stopped || isMuted()) return;
    const b = ensureBus();
    if (!b) return;
    const { ac } = b;
    if (nextBeat < ac.currentTime - 0.2) nextBeat = ac.currentTime + 0.05; // tab was asleep: don't burst
    while (nextBeat < ac.currentTime + LOOKAHEAD_S) {
      scheduleBeat(ac, b.filter, nextBeat);
      nextBeat += 60 / MOODS[mood].bpm;
    }
  };

  const offUnlock = onUnlock(() => {
    if (stopped || timer) return;
    timer = setInterval(pump, 200);
    pump();
  });

  return {
    set(m) {
      if (m === mood) return;
      mood = m;
      const a = audio();
      if (a && filter) filter.frequency.setTargetAtTime(MOODS[m].cutoff, a.ac.currentTime, 1.2);
    },
    current: () => mood,
    stop() {
      stopped = true;
      offUnlock();
      if (timer) clearInterval(timer);
      timer = null;
      const a = audio();
      if (a && bus) {
        const g = bus;
        g.gain.setTargetAtTime(0, a.ac.currentTime, 0.3);
        setTimeout(() => g.disconnect(), 1500);
      }
      bus = null;
      filter = null;
    },
  };
}
