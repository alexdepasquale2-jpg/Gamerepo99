/** Assemble runtime inhabitants from archetype + trait tables. Pure: no Phaser/DOM. */

import type { DataTables } from './load-data';
import type { ArchetypeDef } from './types/data';
import type { BodyState, EmbodimentState, Inhabitant } from './types/runtime';

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
    walkSpeedMul: typeof trait.walkSpeedMul === 'number' ? trait.walkSpeedMul : undefined,
    spriteScale: typeof trait.spriteScale === 'number' ? trait.spriteScale : undefined,
    blockedLine: typeof trait.blockedLine === 'string' ? trait.blockedLine : undefined,
    bodyNames: Array.isArray(trait.bodyNames) ? [...(trait.bodyNames as string[])] : undefined,
  };
}

/** Multi-body inhabitants get one body per slot, all travelling with the player at the start. */
function bodiesFor(emb: EmbodimentState): BodyState[] | undefined {
  if (emb.mode !== 'multi' || emb.bodySlots < 2) return undefined;
  return Array.from({ length: emb.bodySlots }, (_, i) => ({
    id: `body_${i}`,
    name: emb.bodyNames?.[i] ?? `Sibling ${i + 1}`,
    at: 'with_you',
  }));
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

  const embodiment = embodimentFromTrait(embodimentTrait);
  const bodies = bodiesFor(embodiment);
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
    embodiment,
    perception: { ...perceptionTrait },
    methodMods: { ...methodModsTrait },
    townId: arch.startingTownId,
    homeTownId: typeof sparkProfile.homeTownId === 'string' ? sparkProfile.homeTownId : undefined,
    ...(bodies ? { bodies, activeBodyId: bodies[0]!.id } : {}),
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

/** Archetypes a player can pick at the start of a run. */
export function playableArchetypes(data: Pick<DataTables, 'archetypes'>): ArchetypeDef[] {
  return data.archetypes.filter((a) => a.m2Playable);
}

/** Roll an archetype by generatorWeight. `r01` is a number in [0, 1) (e.g. Math.random()). */
export function rollArchetype(list: ArchetypeDef[], r01: number): ArchetypeDef {
  if (!list.length) throw new Error('no archetypes to roll');
  const total = list.reduce((n, a) => n + Math.max(0, a.generatorWeight ?? 1), 0);
  let pick = Math.min(Math.max(r01, 0), 0.999999) * total;
  for (const a of list) {
    pick -= Math.max(0, a.generatorWeight ?? 1);
    if (pick < 0) return a;
  }
  return list[list.length - 1]!;
}
