/** Play-session act helpers: methodId@personId → interaction bridge + juice events. */

import { installFabricReactionSelector } from '../dyn/line-select';
import type { DataTables } from '../load-data';
import {
  advanceDays,
  advanceToDawn,
  advanceToDusk,
  parseAdvanceAction,
} from '../scenario/scenario-advance';
import type { PlayLastResolve } from './play-session-types';
import { listRoutesFrom, startTravel, type TravelSimState } from '../travel/travel';
import { actDefs } from '../hoard';
import { patronHostMethod } from '../patrons';
import type { SimState } from '../types/runtime';
import { expandMethodAct, type CompatRuntime } from '../interaction';
import { actInteraction } from './play-session-interaction';
import deedsJson from '../../data/systems/interactions/deeds.json';
import { handleProvidedAction, providedActions, targetActions, type ActOutcome } from './action-providers';
import { deedVerbAllowed, noteDeedUsed, planDeed, type DeedRow } from './deed-verbs';
import type { Target } from './targets';
import { FAMILIES, familyOf, type Verb } from './verb-families';

const RING_FAMILY_IDS = new Set(FAMILIES.map((f) => f.id));

export const DEEDS: readonly DeedRow[] = (deedsJson as { deeds: DeedRow[] }).deeds;
const DEED_BY_ID = new Map(DEEDS.map((d) => [d.id, d]));
export const deedLabel = (id: string): string | undefined => DEED_BY_ID.get(id)?.label;
/** The deed row behind a verb id (talk_gentle, favor_do, …): its host method and family. */
export const deedRow = (id: string): DeedRow | undefined => DEED_BY_ID.get(id);

function deedAllowed(state: SimState, d: DeedRow, personId: string, rt?: CompatRuntime): boolean {
  if (d.requiresPendingPromise) {
    const p = rt?.people.get(personId) as { promises?: { status: string }[] } | undefined;
    if (!p?.promises?.some((x) => x.status === 'pending')) return false;
  }
  if (d.requiresOtherPerson) {
    const other = state.flags?.lastTouchedPersonId as string | undefined;
    if (!other || other === personId || !state.people[other]) return false;
  }
  return deedVerbAllowed(state, d, personId, rt);
}

type PlayAction = { id: string; family?: string; label?: string };
type PlayEvent = { type: string; methodId?: string };
type MethodRow = { id: string; family?: string };

export type ActExtras = {
  tickN: number;
  metrics: { firstChoiceAtTick?: number; firstConsequenceAtTick?: number };
  setLastResolve: (r: PlayLastResolve | undefined) => void;
};

export function installPlayReactions(state: SimState): void {
  installFabricReactionSelector(state);
}

/**
 * Every act on offer: per person the legacy method ids (still accepted by act, never shown as chips), the
 * deeds that pass their gates and what providers offer; then advance:* and travel:*. With `personId`, only
 * that one person's acts are built (no world-wide pass) and advance/travel are left out.
 */
export function listMethodActions(state: SimState, rt?: CompatRuntime, personId?: string): PlayAction[] {
  const methods = ((state.data as DataTables | undefined)?.methods ?? []) as MethodRow[];
  const personIds = personId ? (state.people[personId] ? [personId] : []) : Object.keys(state.people);
  const out: PlayAction[] = [];
  for (const pid of personIds) {
    for (const m of methods) {
      out.push({ id: `${m.id}@${pid}`, family: m.family });
    }
    for (const v of personVerbs(state, pid, rt)) {
      // listActions keeps its act categories: a ring family (speak, ask, …) is still a 'deed' here.
      const fam = v.provided?.family;
      out.push(v.provided ? { id: v.id, family: fam && !RING_FAMILY_IDS.has(fam) ? fam : 'deed', label: v.provided.label } : { id: v.id, family: v.savage ? 'savage' : 'deed' });
    }
  }
  if (personId) return out;
  out.push({ id: 'advance:dawn', family: 'rest' });
  out.push({ id: 'advance:day', family: 'rest' });
  const travelState = state as TravelSimState;
  const townId = travelState.player.townId;
  const routes = travelState.routes ?? [];
  if (townId) {
    for (const routeId of listRoutesFrom(routes, townId)) {
      out.push({ id: `travel:${routeId}`, family: 'travel' });
    }
  }
  return out;
}

type PersonVerb = Verb & { provided?: { family?: string; label: string } };

/** One person's ring verbs: deeds that pass their gates, then provider acts. No legacy method chips. */
function personVerbs(state: SimState, personId: string, rt?: CompatRuntime, target?: Target): PersonVerb[] {
  const out: PersonVerb[] = [];
  if (rt) {
    for (const d of DEEDS) {
      if (rt.catalog.has(d.id) && deedAllowed(state, d, personId, rt)) {
        out.push({ id: `${d.id}@${personId}`, label: d.label, short: d.short, family: d.family ?? familyOf({ id: d.id }), savage: !!d.savage });
      }
    }
  }
  // Acts other systems offer for this person (stash, patrons, asking about the past…).
  for (const a of providedActions(state, personId, rt, target)) out.push({ ...a, provided: { family: a.family, label: a.label } });
  return out;
}

/** Ring verbs for one target: a person's deeds and provider acts, or what target providers offer on a thing. */
export function listTargetVerbs(state: SimState, target: Target, rt?: CompatRuntime): Verb[] {
  if (target.kind !== 'person') return targetActions(state, target, rt);
  if (!state.people[target.id]) return [];
  return personVerbs(state, target.id, rt, target).map(({ provided: _p, ...v }) => v);
}

export function parseMethodAction(actionId: string): { methodId: string; personId: string } | null {
  const at = actionId.indexOf('@');
  if (at <= 0 || at === actionId.length - 1) return null;
  return { methodId: actionId.slice(0, at), personId: actionId.slice(at + 1) };
}

function appendJuice(state: SimState, eventLog: PlayEvent[], beforeLen: number, methodId?: string): void {
  const ids = state.bus?.lastIds ?? [];
  for (const type of ids.slice(beforeLen)) {
    eventLog.push(methodId ? { type, methodId } : { type });
  }
}

/**
 * Resolve methodId@personId (via interaction compat) / advance:* / travel:* / approach@personId;
 * append juice to eventLog. Unmapped methods or a missing runtime log a bare 'act' (no legacy spend).
 */
export function actMethod(
  state: SimState,
  actionId: string,
  eventLog: PlayEvent[],
  extras?: ActExtras,
  opts?: { interactionCompat?: CompatRuntime; target?: Target },
): ActOutcome | undefined {
  let outcome: ActOutcome | undefined;
  if (handleProvidedAction(state, actionId, eventLog, opts?.interactionCompat, opts?.target, (o) => (outcome = o))) return outcome;

  if (actionId.startsWith('approach@')) {
    if (extras && extras.metrics.firstChoiceAtTick == null) {
      extras.metrics.firstChoiceAtTick = extras.tickN;
    }
    eventLog.push({ type: 'approach', methodId: actionId.slice('approach@'.length) });
    return;
  }

  if (actionId.startsWith('travel:')) {
    const routeId = actionId.slice('travel:'.length);
    const beforeLen = state.bus?.lastIds?.length ?? 0;
    startTravel(state as TravelSimState, routeId);
    appendJuice(state, eventLog, beforeLen);
    eventLog.push({ type: 'travel', methodId: routeId });
    return;
  }

  const advance = parseAdvanceAction(actionId);
  if (advance) {
    const beforeLen = state.bus?.lastIds?.length ?? 0;
    if (advance === 'dusk') advanceToDusk(state);
    else if (advance === 'dawn') advanceToDawn(state);
    else if (advance === 'day') advanceDays(state, 1);
    else advanceDays(state, advance.ticks);
    appendJuice(state, eventLog, beforeLen);
    eventLog.push({ type: 'advance', methodId: actionId });
    return;
  }

  const parsed = parseMethodAction(actionId);
  if (!parsed) {
    eventLog.push({ type: 'act', methodId: actionId });
    return;
  }
  const compat = opts?.interactionCompat;
  // A catalog interaction id carrying a stashAct is playable directly (hosted by the act's first method).
  const direct = compat?.catalog.get(parsed.methodId);
  const stash = direct?.stashAct ? actDefs(state).find((a) => a.id === direct.stashAct) : undefined;
  const patron = direct?.patronAccept || direct?.patronFulfil ? patronHostMethod(state) : undefined;
  const deed = direct ? DEED_BY_ID.get(parsed.methodId) : undefined;
  if (deed && !deedAllowed(state, deed, parsed.personId, compat)) {
    eventLog.push({ type: 'act', methodId: actionId });
    return;
  }
  if (deed?.requiresOtherPerson && compat) {
    const other = state.flags.lastTouchedPersonId as string;
    (state.kinEdges ??= []).push({ from: parsed.personId, to: other, kind: 'introduced' });
    const op = compat.people.get(other) as { bond?: number } | undefined;
    const intro = (direct as { introduce?: unknown } | undefined)?.introduce as { otherBondDelta?: number } | undefined;
    if (op && typeof op.bond === 'number') op.bond += intro?.otherBondDelta ?? 0;
  }
  if (deed) {
    const plan = planDeed(state, deed, parsed.personId);
    const out = actInteraction(state, compat!, { ...parsed, methodId: deed.hostMethod, interactionId: deed.id, line: plan.line, failLine: plan.failLine }, eventLog, extras);
    if (out === 'resolved') plan.after();
    noteDeedUsed(state, deed, parsed.personId);
    return;
  }
  const interactionId = stash || patron ? parsed.methodId : compat ? expandMethodAct(compat.migration, parsed.methodId) : undefined;
  if (!compat || !interactionId || !compat.people.has(parsed.personId) || !state.people?.[parsed.personId]) {
    eventLog.push({ type: 'act', methodId: actionId });
    return;
  }
  actInteraction(state, compat, { ...parsed, methodId: stash?.methodIds[0] ?? patron ?? parsed.methodId, interactionId }, eventLog, extras);
}
