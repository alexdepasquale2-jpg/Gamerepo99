/**
 * Action providers: the verbs a thing offers in its ring. A system registers a provider in its own module
 * (imported from ../contrib) instead of editing listMethodActions.
 *
 * Person providers (no `kinds`) keep the original shape: list(state, personId, rt) → `<act>@<personId>` ids,
 * and an optional act(state, actionId, eventLog, rt). Acts whose id is a catalog interaction (stash, patron, …)
 * need no handler; the generic dispatcher already resolves them.
 *
 * Target providers declare `kinds` (node, facility, board, wagon, signpost, door, hearth, chest, ground-item,
 * plot, tile, fauna) and get the target itself: list(state, target, ctx) → `<verb>@<kind>:<id>` ids, and
 * act(state, actionId, target, ctx) → an outcome (or false when the id is not theirs). Pure: no Phaser/DOM.
 */
import type { CompatRuntime } from '../interaction';
import type { SimState } from '../types/runtime';
import { parseTargetAction, type Target, type TargetKind } from './targets';

export type ProvidedAction = {
  id: string;
  /** Full label (shown as the chip's tip; the chip itself shows `short` when the label is long). */
  label: string;
  /** Verb family id (deeds.json families: speak, help, give, promise, ask, deal). */
  family?: string;
  /** Chip text, at most ~16 characters. */
  short?: string;
  /** Drawn in the savage colour. */
  savage?: boolean;
};
export type ProviderEvent = { type: string; methodId?: string };

/** What a target act did: a line to say, and whether it happened (false = refused, nothing changed). */
export type ActOutcome = { ok: boolean; line?: string; hours?: number };
export type TargetActCtx = { eventLog: ProviderEvent[]; rt?: CompatRuntime };

export type PersonActionProvider = {
  /** Stable id; registering the same id again replaces the earlier provider. */
  id: string;
  kinds?: undefined;
  /** Acts on offer for this person right now (ids look like `<act>@<personId>`). */
  list: (state: SimState, personId: string, rt?: CompatRuntime) => ProvidedAction[];
  /** Handle one of this provider's own ids. Return true when handled. */
  act?: (state: SimState, actionId: string, eventLog: ProviderEvent[], rt?: CompatRuntime) => boolean;
};

export type TargetActionProvider = {
  id: string;
  /** The kinds of thing this provider offers verbs on. */
  kinds: readonly TargetKind[];
  list: (state: SimState, target: Target, rt?: CompatRuntime) => ProvidedAction[];
  /** Handle one of this provider's ids on that target; false when the id is not theirs. */
  act?: (state: SimState, actionId: string, target: Target, ctx: TargetActCtx) => ActOutcome | false;
};

export type ActionProvider = PersonActionProvider | TargetActionProvider;

const providers = new Map<string, ActionProvider>();
const isTarget = (p: ActionProvider): p is TargetActionProvider => Array.isArray(p.kinds);

export function registerActionProvider(p: ActionProvider): void {
  providers.set(p.id, p);
}

/** Register verbs on things (same registry as person providers; a separate name keeps the types inferred). */
export function registerTargetProvider(p: TargetActionProvider): void {
  providers.set(p.id, p);
}

/** Person acts from every person provider (target providers that list 'person' are included too). */
export function providedActions(state: SimState, personId: string, rt?: CompatRuntime): ProvidedAction[] {
  const out: ProvidedAction[] = [];
  for (const p of providers.values()) {
    if (!isTarget(p)) out.push(...p.list(state, personId, rt));
    else if (p.kinds.includes('person')) out.push(...p.list(state, { kind: 'person', id: personId }, rt));
  }
  return out;
}

/** Verbs every target provider offers on this (non-person) thing. */
export function targetActions(state: SimState, target: Target, rt?: CompatRuntime): ProvidedAction[] {
  const out: ProvidedAction[] = [];
  for (const p of providers.values()) if (isTarget(p) && p.kinds.includes(target.kind)) out.push(...p.list(state, target, rt));
  return out;
}

/**
 * Let a provider handle an action id. Person providers return true when they did; target providers get the
 * target (from `target`, else parsed from the id) and their outcome is passed back through `onOutcome`.
 */
export function handleProvidedAction(
  state: SimState, actionId: string, eventLog: ProviderEvent[], rt?: CompatRuntime, target?: Target, onOutcome?: (o: ActOutcome) => void,
): boolean {
  const parsed = parseTargetAction(actionId);
  const t: Target | undefined = target ?? parsed?.target;
  for (const p of providers.values()) {
    if (!isTarget(p)) {
      if (p.act?.(state, actionId, eventLog, rt)) return true;
      continue;
    }
    if (!t || !p.kinds.includes(t.kind) || !p.act) continue;
    const out = p.act(state, actionId, t, { eventLog, rt });
    if (out) {
      onOutcome?.(out);
      return true;
    }
  }
  return false;
}
