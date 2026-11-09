/**
 * The past, spoken: the world's generated history (world.history, carried onto SimState.history) as
 * people retell it. Who knows a beat: anyone named in it, anyone from the town it is tied to, and the
 * old (they know them all); children only what they were part of. Each person tells a beat once
 * (SimState.historyTold). Lines are assembled from baked fragments (data/dialogue/history-voice.json)
 * and the beat tables, never generated at runtime. Pure: no Phaser/DOM.
 */
import { trackedTable } from './data-use-people';
import voiceJson from '../data/dialogue/history-voice.json';
import { loadHistoryTables, type HistoryBeat } from './gen/load/load-history';
import type { HistoryEvent } from './gen/world-types';
import { chronicleCodas } from './chronicle';
import { bakeCodas } from './realm-bake/tell';
import { deriveRng, type Rng } from './rng';
import type { PersonState, SimState } from './types/runtime';

export type Era = 'deep' | 'middle' | 'recent';
export type Knowing = 'named' | 'town' | 'elder';

export type HistoryVoice = {
  elderAge: number;
  oldAge: number;
  childAge: number;
  askLabel: string;
  askTrustDelta: number;
  dawnChance: number;
  openers: { witness: Record<Era, string[]>; hearsay: Record<Era, string[]> };
  /** fallback: words for a beat of a kind with no codas of its own (every authored kind has some today). */
  codas: { otherWitness: string[]; kind: Record<string, string[]>; fallback?: string[] };
  dawn: string[];
  gists: Record<string, string>;
  /** A gist for a beat of this kind with no gist of its own (every authored beat has one today). */
  kindGists?: Record<string, string>;
};

// By-key reads of the gist / opener / coda groups count as use (sim/data-use-people).
export const VOICE = trackedTable('dialogue/history-voice', voiceJson as unknown as HistoryVoice, ['openers', 'codas', 'gists', 'kindGists']);

let beats: Map<string, HistoryBeat> | null = null;
/** Authored beat row (kind, summary, townId) behind a generated history event. */
export function beatRow(id: string): HistoryBeat | undefined {
  beats ??= new Map(loadHistoryTables().historyBeats.map((b) => [b.id, b]));
  return beats.get(id);
}

/** What play carries from a generated world: its history beats, as plain data. */
export function carryHistory(history: readonly HistoryEvent[] | undefined): HistoryEvent[] {
  return (history ?? []).map((h) => ({
    id: h.id,
    ...(h.at !== undefined ? { at: h.at } : {}),
    ...(h.tags ? { tags: [...h.tags] } : {}),
    ...(h.personIds ? { personIds: [...h.personIds] } : {}),
  }));
}

const pick = <T>(rng: Rng, arr: readonly T[]): T | undefined => (arr.length ? arr[rng.int(0, arr.length)] : undefined);

/** Oldest third of the beats is deep past, newest third recent. */
export function eraOf(beat: HistoryEvent, history: readonly HistoryEvent[]): Era {
  // What happened in play is never the deep past: the newer half of the chronicle is recent, the rest middle.
  if (beat.tags?.includes('chronicle')) {
    const lived = history.filter((h) => h.tags?.includes('chronicle')).sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
    const i = lived.findIndex((h) => h.id === beat.id);
    return lived.length <= 1 || i >= lived.length / 2 ? 'recent' : 'middle';
  }
  const order = history.filter((h) => !h.tags?.includes('chronicle')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.id.localeCompare(b.id));
  const i = order.findIndex((h) => h.id === beat.id);
  if (order.length <= 1 || i < 0) return 'middle';
  const f = i / (order.length - 1);
  return f < 1 / 3 ? 'deep' : f > 2 / 3 ? 'recent' : 'middle';
}

export function beatKind(beat: HistoryEvent): string | undefined {
  return beat.kind ?? beatRow(beat.id)?.kind ?? beat.tags?.find((t) => !t.includes(':'));
}

/** The words and town of a beat: a chronicle entry's own, else the authored row's. */
export function beatInfo(beat: HistoryEvent): { summary?: string; townId?: string | null } {
  if (beat.summary) return { summary: beat.summary, townId: beat.townId ?? null };
  const row = beatRow(beat.id);
  return { summary: row?.summary, townId: row?.townId };
}

/** How this person knows the beat, or null when it is not theirs to tell. */
export function knowing(person: PersonState, beat: HistoryEvent, voice: HistoryVoice = VOICE): Knowing | null {
  const row = beatInfo(beat);
  if (!row.summary) return null; // nothing to retell
  const named = !!beat.personIds?.includes(person.id);
  if (!named && person.age !== undefined && person.age < voice.childAge) return null;
  if (row.townId && person.townId === row.townId) return 'town';
  if (named) return 'named';
  if (person.age !== undefined && person.age >= voice.elderAge) return 'elder';
  return null;
}

/** True when this person still has a beat to tell (cheap check for the ring). */
export function hasUntoldBeat(state: SimState, personId: string, voice: HistoryVoice = VOICE): boolean {
  const person = state.people[personId];
  if (!person) return false;
  const told = state.historyTold?.[personId];
  return (state.history ?? []).some((b) => !told?.includes(b.id) && knowing(person, b, voice) !== null);
}

/**
 * Beats this person can still tell, best first: their own town's story, then what they were part of,
 * then what the old simply know. Within a rank each person has their own (seeded) favourite order, so
 * a town does not all lead with the same tale.
 */
export function untoldBeats(state: SimState, personId: string, voice: HistoryVoice = VOICE): HistoryEvent[] {
  const person = state.people[personId];
  if (!person) return [];
  const told = new Set(state.historyTold?.[personId] ?? []);
  const rank: Record<Knowing, number> = { town: 0, named: 1, elder: 2 };
  const taste = (id: string): number => deriveRng(state.seed, 'history-taste', personId, id).next();
  return (state.history ?? [])
    .map((b) => ({ b, k: told.has(b.id) ? null : knowing(person, b, voice), t: taste(b.id) }))
    .filter((x): x is { b: HistoryEvent; k: Knowing; t: number } => x.k !== null)
    .sort((x, y) => rank[x.k] - rank[y.k] || x.t - y.t || x.b.id.localeCompare(y.b.id))
    .map((x) => x.b);
}

/** "Harold" from "Harold Finch"; "Old Tom" from "Old Tom Briggs"; "Old Harold" when old enough. */
export function shortName(p: PersonState, opts: { old?: boolean } = {}, voice: HistoryVoice = VOICE): string {
  const raw = (p.name ?? p.id.replace(/_/g, ' ')).trim();
  const full = raw.charAt(0).toUpperCase() + raw.slice(1);
  const parts = full.split(/\s+/);
  if (parts[0] === 'Old') return parts.slice(0, 2).join(' ');
  const first = parts[0] ?? full;
  return opts.old && p.age !== undefined && p.age >= voice.oldAge ? `Old ${first}` : first;
}

export type RetellInput = {
  seed: number;
  teller: PersonState;
  beat: HistoryEvent;
  history: readonly HistoryEvent[];
  people: Record<string, PersonState>;
  voice?: HistoryVoice;
};

/** One beat in one person's voice: opener + the beat's summary + a coda. Deterministic per seed/teller/beat. */
export function buildRetelling(inp: RetellInput): string {
  const voice = inp.voice ?? VOICE;
  const { teller, beat } = inp;
  const rng = deriveRng(inp.seed, 'history-voice', teller.id, beat.id);
  const era = eraOf(beat, inp.history);
  // Generated beats name many people; being named lets you speak as a witness, but not always.
  const how = beat.personIds?.includes(teller.id) && rng.next() < 0.5 ? 'witness' : 'hearsay';
  const opener = pick(rng, voice.openers[how][era]) ?? '';
  const summary = beatInfo(beat).summary ?? '';
  // Someone else it names, from the teller's own town when there is one.
  const named = (beat.personIds ?? []).filter((id) => id !== teller.id && inp.people[id]?.name);
  const neighbours = named.filter((id) => inp.people[id]!.townId === teller.townId);
  const other = pick(rng, neighbours.length ? neighbours : named);
  const kind = beatKind(beat);
  let coda: string | undefined;
  // Nobody living saw the deep past, so only nearer beats point you to another witness.
  if (other && era !== 'deep' && rng.next() < 0.5) {
    coda = pick(rng, voice.codas.otherWitness)?.replace('{name}', shortName(inp.people[other]!));
  } else {
    const own = kind ? voice.codas.kind[kind] ?? (chronicleCodas(kind).length ? chronicleCodas(kind) : bakeCodas(kind)) : undefined;
    coda = pick(rng, own?.length ? own : voice.codas.fallback ?? []);
  }
  return [opener, summary, coda].filter((s) => !!s).join(' ');
}

/** Short noun phrase for a beat ("the week the mill burned"). */
export function gistOf(beat: HistoryEvent, voice: HistoryVoice = VOICE): string {
  const kind = beatKind(beat);
  return beat.gist ?? voice.gists[beat.id] ?? (kind ? voice.kindGists?.[kind] : undefined) ?? 'the old days';
}

/** The person tells their next untold beat; it is marked told. Null when they have nothing left to tell. */
export function tellNextBeat(state: SimState, personId: string, voice: HistoryVoice = VOICE): { beatId: string; line: string } | null {
  const teller = state.people[personId];
  const beat = untoldBeats(state, personId, voice)[0];
  if (!teller || !beat) return null;
  const line = buildRetelling({ seed: state.seed, teller, beat, history: state.history ?? [], people: state.people, voice });
  const told = (state.historyTold ??= {});
  (told[personId] ??= []).push(beat.id);
  return { beatId: beat.id, line };
}

/** Now and then at dawn, someone in your town was heard telling one of the old stories. */
export function dawnHistoryLine(state: SimState, voice: HistoryVoice = VOICE): string | null {
  const history = state.history ?? [];
  if (!history.length || !voice.dawn.length) return null;
  const rng = deriveRng(state.seed, 'history-dawn', state.day);
  if (rng.next() >= voice.dawnChance) return null;
  const beat = history[rng.int(0, history.length)]!;
  const town = state.player?.townId;
  const knowers = Object.values(state.people)
    .filter((p) => (p.age === undefined || p.age >= voice.childAge) && knowing(p, beat, voice) !== null)
    .sort((a, b) => Number(b.townId === town) - Number(a.townId === town) || (b.age ?? 0) - (a.age ?? 0) || a.id.localeCompare(b.id));
  const local = knowers.filter((p) => p.townId === town);
  const pool = (local.length ? local : knowers).slice(0, 3);
  const teller = pick(rng, pool);
  if (!teller) return null;
  const tpl = pick(rng, voice.dawn)!;
  const name = shortName(teller, { old: true }, voice);
  const line = tpl.replace('{teller}', name).replace('{gist}', gistOf(beat, voice));
  return line.charAt(0).toUpperCase() + line.slice(1);
}
