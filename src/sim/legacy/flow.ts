/** Succession choices: "Carry it on" (heir continues) / "Let it rest" (run ends, never shamed). Burnout only. */

import { applyEffect, type EffectCtx } from '../effects';
import { assembleInhabitant } from '../inhabitant';
import { matchesWhen } from '../hooks';
import { enqueueLetter } from '../letters-scale';
import type { DataTables } from '../load-data';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import { encodeUnspokenForState } from '../social/unspoken';
import { isBurnedOut, lockedSuccessionUi, type SuccessionUi } from '../succession';
import type { Effect } from '../types/data';
import type { SimState } from '../types/runtime';
import { pickHeir, type HeirPick } from './heir';
import { buildImprint, legacyNpcId } from './imprint';
import { placeGrave } from './npc';
import { ensureLegacy, legacyTable } from './state';
import type { ProtagonistImprint } from './types';

export type SuccessionOffer = { ui: SuccessionUi; canContinue: boolean; heir: HeirPick | null; note?: string };
export type SuccessionResult =
  | { ok: true; choice: 'continue' | 'quit'; imprint: ProtagonistImprint; heirPersonId?: string }
  | { ok: false; reason: 'not_open' | 'no_heir' };

const isOpen = (state: SimState): boolean => state.ended !== 'rest' && (state.ended === 'succession' || isBurnedOut(state.player, state.data as DataTables | undefined));

/** What the (M6) screen shows: locked copy, and "Carry it on" only when someone can carry it. */
export function offerSuccession(state: SimState): SuccessionOffer {
  const heir = pickHeir(state);
  return { ui: lockedSuccessionUi(), canContinue: heir !== null, heir, note: heir ? undefined : legacyTable().ui.noHeirNote };
}

function recordEnd(state: SimState, imprint: ProtagonistImprint, ending: 'carry' | 'rest', heirPersonId?: string): void {
  const lg = ensureLegacy(state);
  if (lg.graves.some((x) => x.personId === legacyNpcId(imprint) && x.day === state.day)) return;
  lg.lineage.push({ imprint, ending, heirPersonId });
  lg.lastImprint = imprint;
  const g = { personId: legacyNpcId(imprint), name: imprint.displayName, townId: imprint.homeTownId, epitaphId: legacyTable().graveEpitaphId, day: state.day };
  lg.deltas.push({ t: 'grave', ...g });
  placeGrave(state, g);
}

type ScopedEffect = Effect & { scope?: string };

/** on_burnout_or_death hooks of the finished life: ember gift, reputation echoes, memory packet. */
function applyLegacyHooks(state: SimState, topBond: string | undefined): number {
  const data = state.data as DataTables;
  const lg = ensureLegacy(state);
  const ctx: EffectCtx = { data, rng: deriveRng(state.seed, 'legacy_hooks', state.day), successor: {} };
  const scopes: Record<string, string[]> = { townsTouched: lg.touchedTowns, townsWhereGenuineGrowth: lg.growthTowns };
  for (const id of new Set(state.player.hookIds)) {
    const hook = data.hooksById.get(id);
    if (!hook || hook.trigger !== 'on_burnout_or_death' || !matchesWhen(hook.when, state, ctx)) continue;
    for (const fx of (hook.effects ?? []) as ScopedEffect[]) {
      if (fx.scope) {
        for (const townId of [...(scopes[fx.scope] ?? [])].sort()) {
          const rep = (lg.townRep[townId] ??= { fear: 0, trust: 0 });
          const local: EffectCtx = { ...ctx, town: { ...rep } };
          applyEffect(state, fx, local);
          lg.townRep[townId] = { fear: local.town?.fear ?? rep.fear, trust: local.town?.trust ?? rep.trust };
        }
        continue;
      }
      applyEffect(state, fx, ctx);
      if (fx.op === 'emit_packet' && topBond) {
        enqueueLetter(state, { kind: 'rumor', fromPersonId: topBond, outcomeId: legacyTable().rumorOutcomeId });
      }
    }
  }
  return ctx.successor?.sparkStart ?? 0;
}

function heirArchetypeId(state: SimState, personId: string): string {
  const t = legacyTable();
  const wound = state.people[personId]?.woundId;
  const byWound = t.heirArchetypeByWound as Record<string, string>;
  const mapped = wound ? byWound[wound] : undefined;
  if (mapped) return mapped;
  const fb = t.heirArchetypeFallbacks;
  return fb[deriveRng(state.seed, 'heir_archetype', personId).int(0, fb.length)]!;
}

export function carryItOn(state: SimState): SuccessionResult {
  if (!isOpen(state)) return { ok: false, reason: 'not_open' };
  const heir = pickHeir(state);
  if (!heir) return { ok: false, reason: 'no_heir' };
  const data = state.data as DataTables;
  const lg = ensureLegacy(state);
  const imprint = buildImprint(state);
  const heirPerson = state.people[heir.personId]!;
  const ledger = lg.bonds[heir.personId];

  if (ledger?.lastInteractionId) encodeUnspokenForState(state, ledger.lastInteractionId, heir.personId, { reignited: (ledger.events.genuine_growth_applied ?? 0) > 0 });
  const gift = applyLegacyHooks(state, heir.personId);
  recordEnd(state, imprint, 'carry', heir.personId);

  const next = assembleInhabitant(data, heirArchetypeId(state, heir.personId));
  next.id = `inh-heir-${heir.personId}`;
  next.townId = heirPerson.townId ?? state.player.townId;
  next.spark = Math.min(next.sparkMax ?? Number.POSITIVE_INFINITY, next.spark + gift);
  state.player = next;
  delete state.people[heir.personId];

  lg.bonds = {};
  lg.methodCounts = {};
  lg.lastMethodDay = {};
  lg.touchedTowns = [];
  lg.growthTowns = [];
  lg.choices = [];
  lg.growthSinceSuccession = 0;
  lg.playerName = heirPerson.name;
  if (state.hoard) Object.assign(state.hoard, { peakCoin: 0, reigniteCount: 0 });
  state.flags = { ...state.flags, successionOpen: false, lifeStartDay: state.day, successorChosenViaDependenceBond: heir.viaDependence };
  state.ended = undefined;

  const ctx: EffectCtx = { data, rng: deriveRng(state.seed, 'legacy_continue', state.day) };
  for (const hook of [...data.hooksById.values()].filter((h) => h.trigger === 'on_succession_continue')) {
    if (matchesWhen(hook.when, state, ctx)) for (const fx of hook.effects ?? []) applyEffect(state, fx, ctx);
  }
  pushJuice(state, 'succession.carried', { heirPersonId: heir.personId, spark: next.spark, viaDependence: heir.viaDependence });
  return { ok: true, choice: 'continue', imprint, heirPersonId: heir.personId };
}

/** "Let it rest": the run ends warmly; an ash_hoard imprint is just another ending, never a shame. */
export function letItRest(state: SimState): SuccessionResult {
  if (!isOpen(state)) return { ok: false, reason: 'not_open' };
  const imprint = buildImprint(state);
  recordEnd(state, imprint, 'rest');
  state.ended = 'rest';
  state.flags = { ...state.flags, successionOpen: false, ending: imprint.ending ?? 'rest' };
  pushJuice(state, 'succession.rested', { ending: imprint.ending ?? 'rest' });
  return { ok: true, choice: 'quit', imprint };
}
