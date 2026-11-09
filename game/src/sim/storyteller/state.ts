/**
 * The storyteller's saved state (SimState.storyteller, created lazily: a save from before it simply has
 * none and gets the first teller). Kept apart from the director so light readers (hero/spawns asks where
 * packs are gathering) do not pull the whole thing in. Pure.
 */
import type { SimState } from '../types/runtime';
import { DEFAULT_TELLER, STORY, tellerById, type Family } from './data';

/** An incident still in force in a town. */
export type ActiveIncident = {
  id: string; townId: string; start: number;
  /** The dawn it is decided (or simply lapses). */
  ends: number;
  /** Packs of `family` gathered near the town: rout `need` of them. */
  family?: Family; need?: number; routed?: number;
  /** What was taken from the town's stock (given back if it ends well). */
  taken?: Record<string, number>;
  intensity: number;
  arc?: string;
};
export type StoryArc = { id: string; step: number; due: number; townId: string; outcome?: 'won' | 'lost' };
export type StoryNews = { day: number; line: string; townId: string };
export type StoryLog = { day: number; id: string; townId: string; kind: string; outcome?: 'won' | 'lost' };
export type StoryState = {
  teller: string;
  phase: string; phaseEnds: number; cycle: number;
  /** 0..100: how hard the tale has pressed lately. */
  tension: number;
  /** What the teller can spend on trouble. */
  points: number;
  /** Day each incident / arc (`arc:<id>`) / happening last began. */
  last: Record<string, number>;
  /** Ids lately told, newest last. */
  recent: string[];
  active: ActiveIncident[];
  arc?: StoryArc;
  lastFire?: number;
  log: StoryLog[];
  news: StoryNews[];
};

type WithStory = SimState & { storyteller?: StoryState };
export const storyIfAny = (state: SimState | undefined): StoryState | undefined => (state as WithStory | undefined)?.storyteller;

function fresh(state: SimState, tellerId: string): StoryState {
  const t = tellerById(tellerId), phase = Object.keys(t.phases)[0]!;
  return { teller: t.id, phase, phaseEnds: state.day + t.phases[phase]!.days[0], cycle: 0, tension: 0, points: STORY.tuning.pointsStart, last: {}, recent: [], active: [], log: [], news: [] };
}
export function storyOf(state: SimState): StoryState {
  return ((state as WithStory).storyteller ??= fresh(state, DEFAULT_TELLER));
}
/** Pick who tells this game's tale (New game; the god menu). Keeps what is already afoot. */
export function chooseStoryteller(state: SimState, id?: string): StoryState {
  const t = tellerById(id), cur = storyIfAny(state);
  if (!cur) return ((state as WithStory).storyteller = fresh(state, t.id));
  if (cur.teller !== t.id) {
    cur.teller = t.id;
    cur.phase = Object.keys(t.phases)[0]!;
    cur.phaseEnds = state.day + t.phases[cur.phase]!.days[0];
  }
  return cur;
}

/** The incident whose packs are gathering near a town, if any. */
export function pressureAt(state: SimState, townId: string | undefined): ActiveIncident | undefined {
  if (!townId) return undefined;
  return storyIfAny(state)?.active.find((a) => a.townId === townId && !!a.family && (a.routed ?? 0) < (a.need ?? 0));
}
