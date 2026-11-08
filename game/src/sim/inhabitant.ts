/** Compose runtime inhabitants from parts (trait + hook ids); archetypes are named bundles of parts. Pure: no Phaser/DOM. */

import type { DataTables } from './load-data';
import type { ArchetypeDef } from './types/data';
import type { BodyState, EmbodimentState, Inhabitant, InhabitantParts } from './types/runtime';

type TraitRow = { id: string } & Record<string, unknown>;

function findTrait(rows: unknown[], id: string, kind: string): TraitRow {
  const row = (rows as TraitRow[]).find((r) => r.id === id);
  if (!row) {
    throw new Error(`UNKNOWN ${kind} trait: ${id}`);
  }
  return row;
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? [...(v as string[])] : undefined);

function embodimentFromTrait(trait: TraitRow): EmbodimentState {
  return {
    bodySlots: Number(trait.bodySlots ?? 1),
    activeBodiesMax: Number(trait.activeBodiesMax ?? 1),
    blockedTileTags: strings(trait.blockedTileTags) ?? [],
    footprint: trait.footprint,
    moveTicksPerTile:
      typeof trait.moveTicksPerTile === 'number' ? trait.moveTicksPerTile : undefined,
    mode: typeof trait.mode === 'string' ? trait.mode : undefined,
    walkSpeedMul: typeof trait.walkSpeedMul === 'number' ? trait.walkSpeedMul : undefined,
    spriteScale: typeof trait.spriteScale === 'number' ? trait.spriteScale : undefined,
    blockedLine: typeof trait.blockedLine === 'string' ? trait.blockedLine : undefined,
    bodyNames: strings(trait.bodyNames),
    tags: strings(trait.tags) ?? [],
    allowedApproachTags: strings(trait.allowedApproachTags),
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

/** The parts an authored archetype is made of (the archetype is only a named bundle of parts). */
export function partsFromArchetype(arch: ArchetypeDef): InhabitantParts {
  return {
    embodimentTraitId: arch.embodimentTraitId,
    perceptionTraitId: arch.perceptionTraitId,
    methodModifierId: arch.methodModifierId,
    sparkProfileId: arch.sparkProfileId,
    personalCostHookIds: [...arch.personalCostHookIds],
    refusalHookIds: [...arch.refusalHookIds],
    legacyHookIds: [...arch.legacyHookIds],
    startRule: { townId: arch.startingTownId, ...(arch.startRule ?? { tag: 'default' }) },
    voiceId: arch.id,
    name: arch.name,
    speciesTags: [...(arch.speciesTags ?? [])],
  };
}

/**
 * The protagonist composer: an inhabitant from parts (embodiment, perception, method modifiers, spark
 * profile, personal-cost / refusal / legacy hooks, start rule). Trait blobs are copied on; hook ids come
 * from the parts plus the spark profile's recovery hooks. Systems iterate hookIds and read `parts` and the
 * trait fields, never archetypeId (kept only as a label for saves and the title screen).
 */
export function composeInhabitant(
  data: DataTables,
  parts: InhabitantParts,
  opts: { id?: string; archetypeId?: string } = {},
): Inhabitant {
  const embodimentTrait = findTrait(data.traits.embodiment, parts.embodimentTraitId, 'embodiment');
  const perceptionTrait = findTrait(data.traits.perception, parts.perceptionTraitId, 'perception');
  const methodModsTrait = findTrait(data.traits.methodModifiers, parts.methodModifierId, 'methodModifiers');
  const sparkProfile = findTrait(data.traits.sparkProfiles, parts.sparkProfileId, 'sparkProfiles');

  const sparkStart = typeof sparkProfile.sparkStart === 'number' ? sparkProfile.sparkStart : 70;
  const sparkMax = typeof sparkProfile.sparkMax === 'number' ? sparkProfile.sparkMax : undefined;

  const embodiment = embodimentFromTrait(embodimentTrait);
  const bodies = bodiesFor(embodiment);
  const archetypeId = opts.archetypeId ?? 'composed';
  return {
    id: opts.id ?? `inh-${archetypeId}`,
    archetypeId,
    spark: sparkStart,
    sparkMax,
    hookIds: collectHookIds(parts.personalCostHookIds, parts.refusalHookIds, parts.legacyHookIds, sparkProfile.recoveryHookIds),
    statusTraits: [],
    embodiment,
    perception: { ...perceptionTrait },
    methodMods: { ...methodModsTrait },
    townId: parts.startRule?.townId,
    homeTownId: typeof sparkProfile.homeTownId === 'string' ? sparkProfile.homeTownId : undefined,
    parts: structuredClone(parts),
    ...(bodies ? { bodies, activeBodyId: bodies[0]!.id } : {}),
  };
}

/** An authored archetype, through the composer. */
export function assembleInhabitant(data: DataTables, archetypeId: string): Inhabitant {
  const arch = data.archetypes.find((a) => a.id === archetypeId);
  if (!arch) {
    throw new Error(`UNKNOWN archetype: ${archetypeId}`);
  }
  return composeInhabitant(data, partsFromArchetype(arch), { id: `inh-${archetypeId}`, archetypeId: arch.id });
}

/**
 * The inhabitant's parts. Saves from before parts were stored rebuild them from the archetype row they
 * were assembled from (a data lookup for old saves, not a branch on who they are).
 */
export function partsOf(inh: Inhabitant, data: Pick<DataTables, 'archetypes'> | undefined): InhabitantParts | undefined {
  if (inh.parts) return inh.parts;
  const arch = data?.archetypes?.find((a) => a.id === inh.archetypeId);
  return arch ? partsFromArchetype(arch) : undefined;
}

/** The spark profile row this inhabitant burns by. */
export function sparkProfileOf(inh: Inhabitant, data: DataTables | undefined): Record<string, unknown> | undefined {
  const id = partsOf(inh, data)?.sparkProfileId;
  const rows = data?.traits?.sparkProfiles as Array<Record<string, unknown>> | undefined;
  return id ? rows?.find((p) => p.id === id) : undefined;
}

/** Whose voice a hook's lines bag speaks in. */
export const voiceOf = (inh: Inhabitant): string => inh.parts?.voiceId ?? inh.archetypeId;

/** Old saves: store the parts and the embodiment's tags and ways in, once. Idempotent and cheap after the first call. */
export function ensureInhabitantParts(state: { player: Inhabitant; data?: unknown; flags?: Record<string, unknown> }): InhabitantParts | undefined {
  const inh = state.player;
  const data = state.data as DataTables | undefined;
  // A run already under way when parts arrive has had its start: no first moment mid-life (sim/start-rules).
  if (!inh.parts && state.flags) state.flags.startMoment ??= 0;
  const parts = (inh.parts ??= partsOf(inh, data));
  const emb = inh.embodiment;
  if (parts && data && (!emb.tags || !emb.allowedApproachTags)) {
    const row = (data.traits.embodiment as TraitRow[]).find((r) => r.id === parts.embodimentTraitId);
    if (row) {
      const full = embodimentFromTrait(row);
      emb.tags ??= full.tags;
      emb.allowedApproachTags ??= full.allowedApproachTags;
    }
  }
  return parts;
}

/** The body's trait tags (empty when unknown) and the ways in it may use (undefined: any not blocked). */
export const bodyTags = (inh: Inhabitant): readonly string[] => inh.embodiment.tags ?? [];
export const approachTags = (inh: Inhabitant): readonly string[] | undefined => inh.embodiment.allowedApproachTags;

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
