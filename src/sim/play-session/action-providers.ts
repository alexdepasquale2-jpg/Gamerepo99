/**
 * Action providers: extra per-person acts offered in the ring alongside methods and deeds.
 * A system registers a provider in its own module (imported from ../contrib) instead of editing
 * listMethodActions. Acts whose id is a catalog interaction (stash, patron, …) need no handler; the
 * generic dispatcher already resolves them. Anything else supplies `act` and returns true when it
 * handled the action id. Pure: no Phaser/DOM.
 */
import type { CompatRuntime } from '../interaction';
import type { SimState } from '../types/runtime';

export type ProvidedAction = { id: string; label: string; family?: string };
export type ProviderEvent = { type: string; methodId?: string };

export type ActionProvider = {
  /** Stable id; registering the same id again replaces the earlier provider. */
  id: string;
  /** Acts on offer for this person right now (ids look like `<act>@<personId>`). */
  list: (state: SimState, personId: string, rt?: CompatRuntime) => ProvidedAction[];
  /** Handle one of this provider's own ids. Return true when handled. */
  act?: (state: SimState, actionId: string, eventLog: ProviderEvent[], rt?: CompatRuntime) => boolean;
};

const providers = new Map<string, ActionProvider>();

export function registerActionProvider(p: ActionProvider): void {
  providers.set(p.id, p);
}

export function providedActions(state: SimState, personId: string, rt?: CompatRuntime): ProvidedAction[] {
  const out: ProvidedAction[] = [];
  for (const p of providers.values()) out.push(...p.list(state, personId, rt));
  return out;
}

/** Let a provider handle an action id; true when one did. */
export function handleProvidedAction(state: SimState, actionId: string, eventLog: ProviderEvent[], rt?: CompatRuntime): boolean {
  for (const p of providers.values()) if (p.act?.(state, actionId, eventLog, rt)) return true;
  return false;
}
