/** Assemble runtime inhabitants from archetype + trait tables. Pure: no Phaser/DOM. */

import type { DataTables } from './load-data';
import type { EmbodimentState, Inhabitant } from './types/runtime';

type TraitRow = { id: string } & Record<string, unknown>;

function findTrait(rows: unknown[], id: string, kind: string): TraitRow {
  const row = (rows as TraitRow[]).find((r) => r.id === id);
  if (!row) {
    throw new Error(`UNKNOWN ${kind} trait: ${id}`);
  }
  return row;
}

function embodimentFromTrait(trait: TraitRow): EmbodimentState {
  const blocked = trait.blockedTileTags;
  return {
    bodySlots: Number(trait.bodySlots ?? 1),
    activeBodiesMax: Number(trait.activeBodiesMax ?? 1),
    blockedTileTags: Array.isArray(blocked) ? [...(blocked as string[])] : [],
    footprint: trait.footprint,
    moveTicksPerTile:
      typeof trait.moveTicksPerTile === 'number' ? trait.moveTicksPerTile : undefined,
    mode: typeof trait.mode === 'string' ? trait.mode : undefined,
  };
}

function collectHookIds(
  personalCost: string[],
  refusal: string[],
  legacy: string[],
  recovery: unknown,
): string[] {
  const recoveryIds = Array.isArray(recovery) ? (recovery as string[]) : [];
  return [...personalCost, ...refusal, ...legacy, ...recoveryIds];
}

/**
 * Copy trait blobs onto an inhabitant; hook ids from archetype + spark profile.
 * Systems must iterate hookIds / traits — never branch on archetypeId.
 */
export function assembleInhabitant(data: DataTables, archetypeId: string): Inhabitant {
  const arch = data.archetypes.find((a) => a.id === archetypeId);
  if (!arch) {
    throw new Error(`UNKNOWN archetype: ${archetypeId}`);
  }

  const embodimentTrait = findTrait(
    data.traits.embodiment,
    arch.embodimentTraitId,
    'embodiment',
  );
  const perceptionTrait = findTrait(
    data.traits.perception,
    arch.perceptionTraitId,
    'perception',
  );
  const methodModsTrait = findTrait(
    data.traits.methodModifiers,
    arch.methodModifierId,
    'methodModifiers',
  );
  const sparkProfile = findTrait(
    data.traits.sparkProfiles,
    arch.sparkProfileId,
    'sparkProfiles',
  );

  const sparkStart =
    typeof sparkProfile.sparkStart === 'number' ? sparkProfile.sparkStart : 70;
  const sparkMax =
    typeof sparkProfile.sparkMax === 'number' ? sparkProfile.sparkMax : undefined;

  return {
    id: `inh-${archetypeId}`,
    archetypeId: arch.id,
    spark: sparkStart,
    sparkMax,
    hookIds: collectHookIds(
      arch.personalCostHookIds,
      arch.refusalHookIds,
      arch.legacyHookIds,
      sparkProfile.recoveryHookIds,
    ),
    statusTraits: [],
    embodiment: embodimentFromTrait(embodimentTrait),
    perception: { ...perceptionTrait },
    methodMods: { ...methodModsTrait },
    townId: arch.startingTownId,
  };
}

/** Tile access from embodiment.blockedTileTags only (no archetype switches). */
export function canEnterTile(inh: Inhabitant, tileTags: string[]): boolean {
  const blocked = inh.embodiment.blockedTileTags;
  for (const tag of tileTags) {
    if (blocked.includes(tag)) return false;
  }
  return true;
}
