/** Former PCs as legends / NPCs / graves, their budget-capped LOD acts, and inherited-dependence decay. */

import { applyEffect } from '../effects';
import type { DataTables } from '../load-data';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { assembleFromImprint } from './imprint';
import { ensureLegacy, fill, legacyTable, pushDelta } from './state';
import type { Grave, ProtagonistImprint } from './types';

const FLAME_MAX = 100;

/** Place an imprint into the world: NPC (people + legacy.npcs), legend rumor lines. Idempotent per id. */
export function placeLegend(state: SimState, imprint: ProtagonistImprint): string[] {
  const lg = ensureLegacy(state);
  const npc = assembleFromImprint(imprint);
  if (lg.npcs[npc.id]) return [];
  lg.npcs[npc.id] = npc;
  const townId = imprint.homeTownId;
  state.people[npc.id] = { id: npc.id, name: imprint.displayName, flame: 40, flameStart: 40, townId, tags: [...npc.tags], marks: [] };
  const t = legacyTable();
  const lines = t.legendLines.map((l) => fill(l, imprint.displayName));
  for (const l of lines) if (!lg.legends.includes(l)) lg.legends.push(l);
  pushJuice(state, 'legend.heard', { legacyName: imprint.displayName, personId: npc.id, lines });
  return lines;
}

export function placeGrave(state: SimState, g: Grave): void {
  const lg = ensureLegacy(state);
  if (lg.graves.some((x) => x.personId === g.personId && x.day === g.day)) return;
  lg.graves.push(g);
  const line = fill(legacyTable().graveLines[0]!, g.name);
  pushJuice(state, 'grave.found', { personId: g.personId, townId: g.townId, line });
}

/** Inspect lines for a person who remembers a former PC (people-surface; no popups). */
export function legacyInspectLines(state: SimState, personId: string): string[] {
  const lg = ensureLegacy(state);
  const names = lg.lineage.filter((l) => l.imprint.bonds.some((b) => b.personId === personId)).map((l) => l.imprint.displayName);
  const imported = Object.values(lg.npcs).filter((n) => state.people[personId]?.townId === n.townId).map((n) => n.displayName);
  return [...new Set([...names, ...imported])].sort().map((n) => fill(legacyTable().inspectLines[0]!, n));
}

function pickMethod(weights: Record<string, number>, r: number): string | null {
  const keys = Object.keys(weights).sort();
  const total = keys.reduce((a, k) => a + Math.max(0, weights[k]!), 0);
  if (total <= 0) return null;
  let acc = 0;
  for (const k of keys) {
    acc += Math.max(0, weights[k]!) / total;
    if (r < acc) return k;
  }
  return keys[keys.length - 1]!;
}

/** Legend NPCs act on neighbours in LOD: same method resolve table, budget-capped per dawn. */
export function tickLegacyNpcs(state: SimState): void {
  const lg = ensureLegacy(state);
  const lod = legacyTable().npcLod;
  const deltas = lod.methodFlameDelta as Record<string, number>;
  for (const id of Object.keys(lg.npcs).sort().slice(0, lod.maxNpcs)) {
    const npc = lg.npcs[id]!;
    const home = state.people[id]?.townId ?? npc.townId;
    const targets = Object.keys(state.people).sort().filter((p) => p !== id && !state.people[p]!.tags?.includes('legacy_player') && state.people[p]!.townId === home);
    for (let i = 0; i < lod.actsPerDawn && targets.length; i++) {
      const rng = deriveRng(state.seed, 'legacy_npc', state.day, id, i);
      const methodId = pickMethod(npc.methodWeights, rng.next());
      if (!methodId) break;
      const target = state.people[targets[rng.int(0, targets.length)]!]!;
      target.flame = Math.max(0, Math.min(FLAME_MAX, target.flame + (deltas[methodId] ?? lod.defaultFlameDelta)));
      pushDelta(state, { t: 'reignite', personId: target.id, methodId, marks: (target.marks ?? []).filter((m) => m.stacks > 0).map((m) => `${m.markId}:${m.stacks}`).sort(), flame: target.flame, day: state.day });
      pushJuice(state, 'legend.act', { personId: id, targetId: target.id, methodId });
    }
  }
}

type DecayCond = { genuineGrowthAppliedByPlayerCount?: number; daysElapsedWithoutMethod?: { methodId: string; days: number }; playerSparkAbove?: number };

/** inherited_dependence fades on its three authored conditions, then its resolve hook runs. */
export function tickInheritedDependence(state: SimState): boolean {
  const data = state.data as DataTables | undefined;
  const lg = ensureLegacy(state);
  const traitId = 'inherited_dependence';
  if (!data || !state.player.statusTraits.includes(traitId)) return false;
  const row = (data.traits.statusTraits as Array<{ id: string; decay?: { any?: DecayCond[]; onResolveHookId?: string; removeStatusTraitId?: string } }> | undefined)?.find((t) => t.id === traitId);
  const born = Number(state.flags.lifeStartDay ?? 0);
  const met = (row?.decay?.any ?? []).some(
    (c) =>
      (c.genuineGrowthAppliedByPlayerCount !== undefined && lg.growthSinceSuccession >= c.genuineGrowthAppliedByPlayerCount) ||
      (c.daysElapsedWithoutMethod !== undefined && state.day - Math.max(born, lg.lastMethodDay[c.daysElapsedWithoutMethod.methodId] ?? born) >= c.daysElapsedWithoutMethod.days) ||
      (c.playerSparkAbove !== undefined && state.player.spark > c.playerSparkAbove),
  );
  if (!met) return false;
  state.player.statusTraits = state.player.statusTraits.filter((t) => t !== (row?.decay?.removeStatusTraitId ?? traitId));
  const hook = row?.decay?.onResolveHookId ? data.hooksById.get(row.decay.onResolveHookId) : undefined;
  for (const fx of hook?.effects ?? []) applyEffect(state, fx, { data, rng: deriveRng(state.seed, 'dep_resolve', state.day) });
  lg.dependenceResolvedDay = state.day;
  pushJuice(state, 'status.lose', { traitId });
  return true;
}

/** Log route condition/broken changes since the last dawn (baseline = authored rows). */
export function recordRouteDeltas(state: SimState): void {
  const routes = state.economyRoutes;
  if (!routes?.length) return;
  const lg = ensureLegacy(state);
  const seen = (lg.routeSeen ??= Object.fromEntries(((state.data as DataTables | undefined)?.economyRoutes ?? []).map((r) => [r.id, { broken: r.broken, condition: r.condition }])));
  for (const r of routes) {
    const prev = seen[r.id];
    if (prev && prev.broken === r.broken && prev.condition === r.condition) continue;
    seen[r.id] = { broken: r.broken, condition: r.condition };
    pushDelta(state, { t: 'route', routeId: r.id, broken: r.broken, condition: r.condition, day: state.day });
  }
}

export function tickLegacyDawn(state: SimState): void {
  if (!state.legacy) return;
  recordRouteDeltas(state);
  tickLegacyNpcs(state);
  tickInheritedDependence(state);
}
