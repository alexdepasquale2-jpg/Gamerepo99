/** Burnout → succession stub: locked UI copy from archetypes.json. Pure; no Phaser/DOM. */

import archetypesJson from '../data/people/archetypes.json';
import type { DataTables } from './load-data';
import type { Inhabitant, SimState } from './types/runtime';
import type { PlayEvent } from './play-session/play-session-types';

export type SuccessionUi = {
  screenCopy: string;
  buttons: { continue: string; quit: string };
  quitNeverShamed: boolean;
  defaultButton: string;
};

export type SuccessionRules = {
  dependenceWeightMul: number;
  bondAccumulators: Array<{
    event: string;
    weight: number;
    mulWith?: string;
  }>;
  minBond: number;
  defaultChoice: string;
};

type SuccessionHandle = {
  setSpark: (spark: number) => void;
  getUi: () => SuccessionUi;
  getBurnedOut: () => boolean;
};

const handles = new WeakMap<object, SuccessionHandle>();

const LOCKED_UI: SuccessionUi = (() => {
  const ui = (archetypesJson as { succession?: { ui?: Record<string, unknown> } }).succession?.ui;
  const buttons = (ui?.buttons ?? {}) as { continue?: string; quit?: string };
  return {
    screenCopy: String(ui?.screenCopy ?? ''),
    buttons: {
      continue: String(buttons.continue ?? ''),
      quit: String(buttons.quit ?? ''),
    },
    quitNeverShamed: ui?.quitNeverShamed === true,
    defaultButton: String(ui?.defaultButton ?? 'continue'),
  };
})();

export function lockedSuccessionUi(): SuccessionUi {
  return { ...LOCKED_UI, buttons: { ...LOCKED_UI.buttons } };
}

export function successionRules(): SuccessionRules {
  const s = (archetypesJson as { succession?: SuccessionRules }).succession;
  return {
    dependenceWeightMul: s?.dependenceWeightMul ?? 0.5,
    bondAccumulators: s?.bondAccumulators ?? [],
    minBond: s?.minBond ?? 3,
    defaultChoice: s?.defaultChoice ?? 'continue',
  };
}

/** Bond event weight; dependence paths use succession.dependenceWeightMul (×0.5). */
export function scoreBondEvent(event: string, rules: SuccessionRules = successionRules()): number {
  const row = rules.bondAccumulators.find((a) => a.event === event);
  if (!row) return 0;
  let w = row.weight;
  if (row.mulWith === 'dependenceWeightMul') {
    w *= rules.dependenceWeightMul;
  }
  return w;
}

export function burnoutAtFor(
  player: Inhabitant,
  data: DataTables | undefined,
): number {
  const defaults = (data?.player as { defaults?: { burnoutAt?: number } } | undefined)?.defaults;
  const profiles = data?.traits?.sparkProfiles as Array<{ id: string; burnoutAt?: number }> | undefined;
  const arch = data?.archetypes?.find((a) => a.id === player.archetypeId);
  if (arch && profiles) {
    const sp = profiles.find((p) => p.id === arch.sparkProfileId);
    if (typeof sp?.burnoutAt === 'number') return sp.burnoutAt;
  }
  return typeof defaults?.burnoutAt === 'number' ? defaults.burnoutAt : 0;
}

/** Ember-zone floor from spark profile / player defaults (succession offer threshold). */
export function emberZoneBelowFor(
  player: Inhabitant,
  data: DataTables | undefined,
): number {
  const defaults = (data?.player as { defaults?: { emberZoneBelow?: number } } | undefined)?.defaults;
  const profiles = data?.traits?.sparkProfiles as Array<{ id: string; emberZoneBelow?: number }> | undefined;
  const arch = data?.archetypes?.find((a) => a.id === player.archetypeId);
  if (arch && profiles) {
    const sp = profiles.find((p) => p.id === arch.sparkProfileId);
    if (typeof sp?.emberZoneBelow === 'number') return sp.emberZoneBelow;
  }
  return typeof defaults?.emberZoneBelow === 'number' ? defaults.emberZoneBelow : 20;
}

export function isBurnedOut(
  player: Inhabitant,
  data: DataTables | undefined,
): boolean {
  return player.spark <= burnoutAtFor(player, data);
}

/**
 * Offer succession when spark ≤ emberZoneBelow (earlier than hard burnoutAt).
 * burnoutAt remains the hard floor after succession is declined/ignored.
 * Returns true when succession is open after this call.
 */
export function maybeOpenSuccession(
  state: SimState,
  eventLog: PlayEvent[],
  alreadyOpen: { value: boolean },
): boolean {
  if (alreadyOpen.value && state.flags.successionOpen === false) alreadyOpen.value = false; // heir carried on
  if (alreadyOpen.value) return true;
  const data = state.data as DataTables | undefined;
  if (state.player.spark > emberZoneBelowFor(state.player, data)) return false;
  alreadyOpen.value = true;
  state.ended = 'succession';
  state.flags = { ...state.flags, successionOpen: true };
  state.bus?.emit?.('succession.open', { ui: lockedSuccessionUi() });
  eventLog.push({ type: 'succession.open' });
  return true;
}

export function attachSuccessionHandle(session: object, handle: SuccessionHandle): void {
  handles.set(session, handle);
}

export function forceSpark(session: object, spark: number): void {
  const h = handles.get(session);
  if (!h) throw new Error('succession: session has no forceSpark handle');
  h.setSpark(spark);
}

export function getSuccessionUi(session: object): SuccessionUi {
  const h = handles.get(session);
  if (!h) throw new Error('succession: session has no succession UI handle');
  return h.getUi();
}
