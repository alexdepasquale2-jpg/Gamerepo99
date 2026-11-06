/** Play-session act helpers: methodId@personId → commitMethod + juice events. */

import { installFabricReactionSelector } from './dyn/line-select';
import type { DataTables } from './load-data';
import { commitMethod } from './methods';
import type { SimState } from './types/runtime';

type PlayAction = { id: string; family?: string };
type PlayEvent = { type: string; methodId?: string };
type MethodRow = { id: string; family?: string };

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
  return out;
}

export function parseMethodAction(actionId: string): { methodId: string; personId: string } | null {
  const at = actionId.indexOf('@');
  if (at <= 0 || at === actionId.length - 1) return null;
  return { methodId: actionId.slice(0, at), personId: actionId.slice(at + 1) };
}

/** Commit methodId@personId; append juice ids (spark.spend, …) to eventLog. */
export function actMethod(state: SimState, actionId: string, eventLog: PlayEvent[]): void {
  const parsed = parseMethodAction(actionId);
  if (!parsed) {
    eventLog.push({ type: 'act', methodId: actionId });
    return;
  }
  const beforeLen = state.bus?.lastIds?.length ?? 0;
  try {
    commitMethod(state, parsed.personId, parsed.methodId);
    const ids = state.bus?.lastIds ?? [];
    for (const type of ids.slice(beforeLen)) {
      eventLog.push({ type, methodId: parsed.methodId });
    }
    if (ids.length === beforeLen) {
      eventLog.push({ type: 'method', methodId: parsed.methodId });
    }
  } catch {
    eventLog.push({ type: 'act', methodId: actionId });
  }
}
