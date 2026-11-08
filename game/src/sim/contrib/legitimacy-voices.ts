/**
 * E3, legitimacy shown through people: townsfolk praise or grumble about the leader by the compact's
 * legitimacy band (doctrine-tick legitimacyOf: firm, kept, habit, doubt, fallen).
 *  - Dawn: a named resident speaks up when the band shifts, or every few days, with the compact's promise.
 *  - Day: now and then, while you deal with someone in town, a bystander mutters or praises (juice bubble).
 *  - Ring: "Ask about <leader>" on any resident of a town with a compact.
 * Also judges each compact's promises every dawn (sim/promise-tally) for the Power board page.
 */
import deedsJson from '../../data/systems/interactions/deeds.json';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { ensureDoctrines, legitimacyOf, type DoctrineState } from '../doctrine-tick';
import { pushJuice } from '../packets';
import { registerActionProvider, registerTargetProvider } from '../play-session/action-providers';
import { ensureLegitimacyVoices, tickPromiseTally } from '../promise-tally';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { carrierIn, isVisitorId } from '../visitors';
import { leaderOf } from './power-page';
import { chip, line, VL } from './visitor-lines';

export type Band = 'firm' | 'kept' | 'habit' | 'doubt' | 'fallen';

/** The band of a compact as townsfolk feel it right now (legitimacyOf, so today's acts show at once). */
export function bandOf(d: DoctrineState): Band {
  if (d.collapsed) return 'fallen';
  const l = Math.min(d.legitimacy, legitimacyOf(d));
  if (l >= 0.75) return 'firm';
  if (l >= 0.5) return 'kept';
  if (l >= 0.3) return 'habit';
  return 'doubt';
}

/** Days between dawn remarks when the mood holds steady. */
const STEADY_EVERY = 5;
/** Chance per deed of a bystander's remark (at most one per town per day). */
const REMARK_CHANCE = 0.3;

type Row = { id: string; name: string; goals?: { promise: string }[] };
const rowOf = (state: SimState, id: string): Row | undefined =>
  ((state.data as { doctrines?: { doctrines?: Row[] } } | undefined)?.doctrines?.doctrines ?? []).find((r) => r.id === id);

/** The compact that holds a town: the live one, else the last to fall there. */
export function compactOf(state: SimState, townId: string | undefined): DoctrineState | undefined {
  if (!townId) return undefined;
  const here = Object.values(ensureDoctrines(state)).filter((d) => d.townId === townId).sort((a, b) => Number(!!a.collapsed) - Number(!!b.collapsed) || a.id.localeCompare(b.id));
  return here[0];
}

function vars(state: SimState, d: DoctrineState, speaker?: string): Record<string, string | undefined> {
  const row = rowOf(state, d.id);
  const lead = leaderOf(state, d);
  const doctrine = row?.name ?? d.id;
  return {
    speaker: speaker ? state.people[speaker]?.name : undefined,
    leader: lead ? (state.people[lead]?.name ?? lead) : `the ${doctrine}`,
    doctrine,
    promise: row?.goals?.[0]?.promise ?? 'better days',
  };
}

// ---------- dawn ----------

export function legitimacyDawnLines(state: SimState): string[] {
  const town = state.player.townId;
  const d = compactOf(state, town);
  if (!town || !d) return [];
  const lv = ensureLegitimacyVoices(state);
  const band = bandOf(d);
  const was = lv.heard[town];
  if (was && was.band === band && state.day - was.day < STEADY_EVERY) return [];
  if (was?.band === 'fallen' && band === 'fallen') return [];
  const lead = leaderOf(state, d);
  const who = carrierIn(state, town, `legit:${band}`, lead ? [lead] : []);
  if (!who) return [];
  lv.heard[town] = { band, day: state.day };
  return [line(VL.legitimacy, `dawn_${band}`, `${state.day}:${town}`, vars(state, d, who))];
}

registerDawnTick('late', 'promise-tally', tickPromiseTally);
registerDawnLines('legitimacy-voices', legitimacyDawnLines);

// ---------- ring: ask about the leader ----------

const firstOf = (state: SimState, id: string | undefined): string | undefined => (id ? state.people[id]?.name?.split(' ')[0] : undefined);

registerTargetProvider({
  id: 'legitimacy-voices',
  kinds: ['person'],
  list(state, target) {
    const p = state.people[target.id];
    if (!p?.townId || isVisitorId(target.id) || p.tags?.includes('child')) return [];
    const d = compactOf(state, p.townId);
    if (!d) return [];
    const lead = d.collapsed ? undefined : leaderOf(state, d);
    if (lead === target.id) return [];
    const name = firstOf(state, lead);
    const label = name ? `Ask what they think of ${name}` : `Ask about the ${rowOf(state, d.id)?.name ?? 'compact'}`;
    return [{ id: `legit_ask@${target.id}`, label, short: chip(name ? `Ask about ${name}` : 'Ask about rule', 'Ask about rule'), family: 'ask' }];
  },
  act(state, actionId, target) {
    if (!actionId.startsWith('legit_ask@')) return false;
    const d = compactOf(state, state.people[target.id]?.townId);
    if (!d) return { ok: true, line: line(VL.legitimacy, 'ask_none', target.id, {}) };
    return { ok: true, line: line(VL.legitimacy, `ask_${bandOf(d)}`, `${state.day}:${target.id}`, vars(state, d)) };
  },
});

// ---------- day: a bystander's remark ----------

const DEEDS = new Set((deedsJson as { deeds: { id: string }[] }).deeds.map((d) => d.id));

/**
 * Watches deeds done to townsfolk (never handles them): now and then someone nearby says what they think
 * of the leader. The line goes out as juice to a carrier the player can see in that town.
 */
registerActionProvider({
  id: 'legitimacy-remarks',
  list: () => [],
  act(state, actionId) {
    const at = actionId.indexOf('@');
    if (at <= 0 || !DEEDS.has(actionId.slice(0, at))) return false;
    const pid = actionId.slice(at + 1);
    const town = state.people[pid]?.townId;
    if (!town || town !== state.player.townId) return false;
    const d = compactOf(state, town);
    if (!d) return false;
    const lv = ensureLegitimacyVoices(state);
    const remarked = (lv.remarked ??= {});
    if (remarked[town] === state.day) return false;
    if (deriveRng(state.seed, 'legit-remark', state.day, actionId, state.bus?.lastIds?.length ?? 0).next() >= REMARK_CHANCE) return false;
    remarked[town] = state.day;
    const band = bandOf(d);
    pushJuice(state, 'happening.start', { townId: town, line: line(VL.legitimacy, `remark_${band}`, `${state.day}:${town}`, vars(state, d)), source: 'legitimacy', band });
    return false;
  },
});
