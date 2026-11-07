/** Protagonist imprint: build from a finished life, assemble a legend NPC from one. No archetype branches. */

import { detectEnding } from '../hoard';
import type { DataTables } from '../load-data';
import type { Inhabitant, SimState } from '../types/runtime';
import { scoreBonds } from './heir';
import { ensureLegacy, legacyTable, slug } from './state';
import type { LegacyInhabitant, ProtagonistImprint } from './types';

export function buildImprint(state: SimState): ProtagonistImprint {
  const data = state.data as DataTables | undefined;
  const lg = ensureLegacy(state);
  const arch = data?.archetypes?.find((a) => a.id === state.player.archetypeId);
  const displayName = lg.playerName ?? arch?.name ?? 'A stranger';
  const max = Math.max(1, ...Object.values(lg.methodCounts));
  const methodTendencies = Object.fromEntries(
    Object.keys(lg.methodCounts).sort().map((m) => [m, Math.round((lg.methodCounts[m]! / max) * 100) / 100]),
  );
  const refusalHookIds = state.player.hookIds.filter((h) => data?.hooksById.get(h)?.kind === 'refusal').sort();
  const bonds = scoreBonds(state).map((b) => ({ personId: b.personId, weight: b.score, lastMethod: lg.bonds[b.personId]?.lastMethod }));
  const marksLeft = Object.keys(state.people).sort().flatMap((personId) =>
    (state.people[personId]!.marks ?? []).filter((m) => m.stacks > 0).map((m) => ({ personId, markId: m.markId, stacks: m.stacks })),
  ).slice(0, 24);
  const imprint: ProtagonistImprint = {
    slot: 'reserved',
    displayName,
    speciesTags: [...(arch?.speciesTags ?? [])],
    embodimentTraitId: arch?.embodimentTraitId,
    methodTendencies,
    refusalHookIds,
    notableChoices: lg.choices.slice(-12).map((c) => ({ ...c })),
    bonds,
    marksLeft,
    legendSeed: `${state.seed}:${state.day}:${slug(displayName)}`,
    homeTownId: state.player.townId,
  };
  if (detectEnding(state) === 'ash_hoard') {
    imprint.flags = ['hoard_legacy'];
    imprint.ending = 'ash_hoard';
  }
  return imprint;
}

/** Hook ids a legend NPC leans on, from data table byMethod with a tendency floor. */
export function mapTendenciesToHooks(imprint: ProtagonistImprint): string[] {
  const t = legacyTable().tendencyHooks;
  const byMethod = t.byMethod as Record<string, string[]>;
  const out = new Set<string>(imprint.refusalHookIds);
  for (const m of Object.keys(imprint.methodTendencies).sort()) {
    if ((imprint.methodTendencies[m] ?? 0) >= t.minTendency) for (const h of byMethod[m] ?? []) out.add(h);
  }
  return [...out].sort();
}

export const legacyNpcId = (imprint: ProtagonistImprint): string => `legacy_${slug(imprint.displayName)}_${slug(imprint.legendSeed)}`;

export function assembleFromImprint(imprint: ProtagonistImprint): LegacyInhabitant {
  const base: Inhabitant = {
    id: legacyNpcId(imprint),
    archetypeId: 'legacy_player',
    spark: 50,
    hookIds: mapTendenciesToHooks(imprint),
    statusTraits: [],
    embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] },
    townId: imprint.homeTownId,
  };
  return {
    ...base,
    displayName: imprint.displayName,
    tags: ['legacy_player', 'legend_candidate', ...imprint.speciesTags],
    methodWeights: { ...imprint.methodTendencies },
  };
}
