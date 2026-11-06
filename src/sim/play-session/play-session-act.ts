/** Play-session act helpers: methodId@personId → commitMethod + juice events. */

import { installFabricReactionSelector } from '../dyn/line-select';
import type { DataTables } from '../load-data';
import { commitMethod } from '../methods';
import {
  advanceDays,
  advanceToDawn,
  advanceToDusk,
  parseAdvanceAction,
} from '../scenario/scenario-advance';
import type { PlayLastResolve } from './play-session-types';
import { listRoutesFrom, startTravel, type TravelSimState } from '../travel/travel';
import type { SimState } from '../types/runtime';

type PlayAction = { id: string; family?: string };
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

export function listMethodActions(state: SimState): PlayAction[] {
  const methods = ((state.data as DataTables | undefined)?.methods ?? []) as MethodRow[];
  const personIds = Object.keys(state.people);
  const out: PlayAction[] = [];
  for (const personId of personIds) {
    for (const m of methods) {
      out.push({ id: `${m.id}@${personId}`, family: m.family });
    }
  }
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

/** Commit methodId@personId / advance:* / travel:* / approach@personId; append juice to eventLog. */
export function actMethod(
  state: SimState,
  actionId: string,
  eventLog: PlayEvent[],
  extras?: ActExtras,
): void {
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
  const beforeLen = state.bus?.lastIds?.length ?? 0;
  const sparkBefore = state.player.spark;
  try {
    const result = commitMethod(state, parsed.personId, parsed.methodId);
    appendJuice(state, eventLog, beforeLen, parsed.methodId);
    if ((state.bus?.lastIds?.length ?? 0) === beforeLen) {
      eventLog.push({ type: 'method', methodId: parsed.methodId });
    }
    if (result.kind === 'resolved') {
      const method = ((state.data as DataTables | undefined)?.methods ?? []) as MethodRow[];
      const row = method.find((m) => m.id === parsed.methodId);
      if (row?.family === 'kind') state.flags.kindSuccessToday = true;
      extras?.setLastResolve({
        kind: 'resolved',
        flameDelta: result.flameDelta,
        sparkCost: sparkBefore - state.player.spark,
        marks: result.marks,
        personId: parsed.personId,
        methodId: parsed.methodId,
      });
    } else {
      extras?.setLastResolve({
        kind: 'refused',
        flameDelta: 0,
        sparkCost: sparkBefore - state.player.spark,
        personId: parsed.personId,
        methodId: parsed.methodId,
      });
    }
    if (extras && extras.metrics.firstConsequenceAtTick == null) {
      extras.metrics.firstConsequenceAtTick = extras.tickN;
    }
  } catch {
    eventLog.push({ type: 'act', methodId: actionId });
  }
}
