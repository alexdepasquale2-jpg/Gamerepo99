/** Load and index locked JSON tables from src/data. Pure: no Phaser/DOM/Math.random. */

import type { ArchetypeDef, HookDef } from './types/data';
import { loadCaravanSchedules } from './caravans';
import type { CaravanScheduleRow } from './caravans-types';

import archetypesJson from '../data/people/archetypes.json';
import traitsJson from '../data/people/traits.json';
import methodsJson from '../data/systems/methods.json';
import peopleJson from '../data/people/people.json';
import townsJson from '../data/world/towns.json';
import linksJson from '../data/world/links.json';
import playerJson from '../data/systems/player.json';
import woundsJson from '../data/systems/wounds.json';
import marksJson from '../data/systems/marks.json';
import eventsJson from '../data/systems/events.json';
import proofsJson from '../data/people/proofs.json';
import timeJson from '../data/systems/time.json';
import ripplesJson from '../data/systems/ripples.json';
import namesJson from '../data/people/names.json';
import kinshipJson from '../data/people/kinship.json';
import lettersJson from '../data/dialogue/letters.json';
import doctrinesJson from '../data/systems/doctrines.json';
import { loadLineFragmentsTable } from './load-fragments';
import { loadInteractionTables, type InteractionTables } from './interaction/load-interactions';
import economyLodJson from '../data/economy/economy-lod.json';
import dawnStockJson from '../data/economy/dawn-stock.json';
import facilitiesJson from '../data/economy/facilities.json';
import economyResourcesJson from '../data/economy/economy-resources.json';
import routesJson from '../data/world/routes.json';
import type {
  DawnStockTable,
  EconomyLodTable,
  EconomyResourceRow,
  EconomyRouteState,
  FacilityRow,
} from './economy/economy-lod-types';
import socialWebJson from '../data/people/social-web.json';
import socialCentralityJson from '../data/people/social-centrality.json';
import unspokenClassesJson from '../data/people/unspoken/classes.json';
import unspokenBlessingsJson from '../data/people/unspoken/outcomes-blessings.json';
import unspokenBurdensJson from '../data/people/unspoken/outcomes-burdens.json';
import unspokenTuningJson from '../data/people/unspoken/tuning.json';
import unspokenFragmentsJson from '../data/dialogue/fragments/unspoken/come-to-pass.json';
import type { UnspokenTables } from './social/unspoken-types';
import socialPropagationJson from '../data/people/social-propagation.json';
import { normalizeSocialEdge } from './social/social-graph';
import { socialTablesForSeed } from './social/social-web-build';
import {
  DEFAULT_SOCIAL_PROPAGATION,
  type CentralityTable,
  type SocialPropagation,
  type SocialWebTable,
} from './social/social-types';
import voiceAnchorsJson from '../data/dialogue/voice-anchors.json';
import reactionCurvesJson from '../data/dialogue/reaction-curves.json';
import voiceConstraintsJson from '../data/dialogue/voice-constraints.json';

import hooksSparkRecovery from '../data/hooks/spark-recovery.json';
import hooksPersonalCost from '../data/hooks/personal-cost.json';
import hooksRefusal from '../data/hooks/refusal.json';
import notorietyJson from '../data/economy/notoriety.json';
import patronsJson from '../data/economy/patrons.json';
import stashSitesJson from '../data/economy/stash-sites.json';
import hooksLegacy from '../data/hooks/legacy.json';
import hooksCivic from '../data/hooks/civic.json';

export type TraitsTables = {
  embodiment: unknown[];
  perception: unknown[];
  methodModifiers: unknown[];
  sparkProfiles: unknown[];
  statusTraits?: unknown[];
};

export type LineFragmentsTable = {
  fragments: Array<{
    id: string;
    text: string;
    tags?: string[];
    weight?: number;
    slot?: string;
  }>;
  canonical?: boolean;
  replaces?: string;
};

export type VoiceAnchorsTable = {
  anchors: Array<{
    id: string;
    personId: string;
    tags?: string[];
    vector?: Record<string, number>;
  }>;
};

export type ReactionCurvesTable = {
  curves: Array<{
    id: string;
    drives?: unknown[];
  }>;
};

export type VoiceConstraintsTable = {
  constraints: Array<{
    id: string;
    forbidTagsTogether?: string[][];
    neverContradict?: unknown[];
  }>;
};

export type DataTables = {
  archetypes: ArchetypeDef[];
  traits: TraitsTables;
  hooks: HookDef[];
  methods: unknown[];
  /** From methods.json meta — used by commitMethod resolve. */
  rngFuzz: number;
  reigniteThreshold: number;
  people: unknown[];
  /** Indexed people rows (id → row). */
  names: { given: string[]; family: string[] };
  peopleById: Record<string, { id: string; authored?: boolean; anchor?: boolean; woundId?: string; flameStart?: number; tags?: string[]; [k: string]: unknown }>;
  towns: unknown[];
  links: unknown[];
  player: unknown;
  wounds: unknown[];
  marks: unknown[];
  events: unknown[];
  /** Happenings dawn-draw tuning (events.json `tuning`; see sim/happenings). */
  eventsTuning?: Record<string, unknown>;
  proofs: unknown[];
  time: unknown;
  ripples: unknown;
  lines: unknown;
  kinship: unknown;
  letters: unknown;
  doctrines: unknown;
  lineFragments: LineFragmentsTable;
  voiceAnchors: VoiceAnchorsTable;
  reactionCurves: ReactionCurvesTable;
  voiceConstraints: VoiceConstraintsTable;
  /** Interaction catalog/scoring/migration (interaction/). */
  interactions: InteractionTables;
  hooksById: Map<string, HookDef>;
  /** M5 hoarder: economy/notoriety.json and economy/stash-sites.json. */
  notoriety: unknown;
  patrons?: unknown;
  stashSites: { sites: unknown[]; acts: unknown[] };
  /** M4 dawn economy LOD (economy/economy-lod.json). */
  economyLod: EconomyLodTable;
  /** M4 dawn stock seeds/spoil (economy/dawn-stock.json). */
  dawnStock: DawnStockTable;
  /** economy/facilities.json rows (LOD produce). */
  facilities: FacilityRow[];
  /** economy/economy-resources.json rows (spoilPerDawn). */
  economyResources: EconomyResourceRow[];
  /** world/routes.json rows (LOD flow; condition/broken/receiveShare). */
  economyRoutes: EconomyRouteState[];
  /** world/caravan-schedules.json rows (maxConcurrent defaulted to 2). */
  caravanSchedules: CaravanScheduleRow[];
  /** Social graph 05: this world's web. loadData() gives the web baked for seed 42; dataForSeed() swaps in any other world's. */
  socialWeb: SocialWebTable;
  /** Social graph 05: this world's centrality (read-only; baked for 42, built at boot otherwise). */
  socialCentrality: CentralityTable;
  /** Social graph 05: falloff / maxHops / epsilon. */
  socialPropagation: SocialPropagation;
  /** Social graph 06: Blessings and Burdens classes/outcomes/tuning/fragments. */
  unspoken: UnspokenTables;
};

function loadSocialWeb(): SocialWebTable {
  const raw = socialWebJson as unknown as { version?: number; seed?: number; meanHops?: number; edges?: unknown[] };
  return {
    version: raw.version ?? 1,
    seed: raw.seed ?? 0,
    meanHops: raw.meanHops ?? 0,
    edges: (raw.edges ?? []).map((e) => normalizeSocialEdge(e as Record<string, unknown>)),
  };
}

/**
 * The tables for one world: same data, with the social web + centrality of `seed`.
 * Returns `data` itself when it already carries that seed's web (the known world,
 * seed 42, keeps the baked JSON byte for byte). Never mutates `data`, so two
 * sessions on different seeds each hold their own web.
 */
export function dataForSeed(data: DataTables, seed: number): DataTables {
  if (data.socialWeb.seed === seed && data.socialCentrality.seed === seed) return data;
  const baked = { socialWeb: loadSocialWeb(), socialCentrality: socialCentralityJson as unknown as CentralityTable };
  return { ...data, ...socialTablesForSeed(seed, baked) };
}

function loadSocialPropagation(): SocialPropagation {
  const raw = socialPropagationJson as Partial<SocialPropagation>;
  const d = DEFAULT_SOCIAL_PROPAGATION;
  return {
    falloff: typeof raw.falloff === 'number' ? raw.falloff : d.falloff,
    maxHops: typeof raw.maxHops === 'number' ? raw.maxHops : d.maxHops,
    epsilon: typeof raw.epsilon === 'number' ? raw.epsilon : d.epsilon,
    introduceWeight: typeof raw.introduceWeight === 'number' ? raw.introduceWeight : d.introduceWeight,
  };
}

const HOOK_PARTS = [
  hooksSparkRecovery,
  hooksPersonalCost,
  hooksRefusal,
  hooksLegacy,
  hooksCivic,
] as Array<{ hooks?: HookDef[] }>;

function collectHooks(): HookDef[] {
  const hooks: HookDef[] = [];
  for (const part of HOOK_PARTS) {
    hooks.push(...((part.hooks ?? []) as HookDef[]));
  }
  return hooks;
}

function indexHooks(hooks: HookDef[]): Map<string, HookDef> {
  const map = new Map<string, HookDef>();
  for (const h of hooks) {
    if (map.has(h.id)) {
      throw new Error(`duplicate hook id: ${h.id}`);
    }
    map.set(h.id, h);
  }
  return map;
}

function assertArchetypeHooks(archetypes: ArchetypeDef[], hooksById: Map<string, HookDef>): void {
  for (const a of archetypes) {
    const refs = [
      ...a.personalCostHookIds,
      ...a.refusalHookIds,
      ...a.legacyHookIds,
    ];
    for (const hid of refs) {
      if (!hooksById.has(hid)) {
        throw new Error(`UNKNOWN HOOK ${hid} referenced by archetype ${a.id}`);
      }
    }
  }
}

export function loadData(): DataTables {
  const archetypes = (archetypesJson.archetypes ?? []) as ArchetypeDef[];
  const hooks = collectHooks();
  const hooksById = indexHooks(hooks);
  assertArchetypeHooks(archetypes, hooksById);

  return {
    archetypes,
    traits: traitsJson as TraitsTables,
    hooks,
    methods: (methodsJson.methods ?? []) as unknown[],
    rngFuzz: typeof methodsJson.rngFuzz === 'number' ? methodsJson.rngFuzz : 0.1,
    reigniteThreshold:
      typeof methodsJson.reigniteThreshold === 'number' ? methodsJson.reigniteThreshold : 35,
    people: (peopleJson.people ?? []) as unknown[],
    peopleById: Object.fromEntries(
      ((peopleJson.people ?? []) as Array<{ id: string }>).map((p) => [p.id, p]),
    ) as DataTables['peopleById'],
    towns: (townsJson.towns ?? []) as unknown[],
    links: (linksJson.links ?? []) as unknown[],
    player: playerJson,
    wounds: (woundsJson.wounds ?? []) as unknown[],
    marks: (marksJson.marks ?? []) as unknown[],
    events: (eventsJson.events ?? []) as unknown[],
    eventsTuning: (eventsJson as { tuning?: Record<string, unknown> }).tuning,
    proofs: (proofsJson.proofs ?? []) as unknown[],
    time: timeJson,
    ripples: ripplesJson,
    lines: { deprecated: true, replaces: 'line-fragments' },
    kinship: kinshipJson,
    names: namesJson as DataTables['names'],
    letters: lettersJson,
    doctrines: doctrinesJson,
    lineFragments: loadLineFragmentsTable(),
    voiceAnchors: voiceAnchorsJson as VoiceAnchorsTable,
    reactionCurves: reactionCurvesJson as ReactionCurvesTable,
    voiceConstraints: voiceConstraintsJson as VoiceConstraintsTable,
    interactions: loadInteractionTables(),
    hooksById,
    notoriety: notorietyJson,
    patrons: patronsJson,
    stashSites: stashSitesJson as unknown as DataTables['stashSites'],
    economyLod: economyLodJson as unknown as EconomyLodTable,
    dawnStock: dawnStockJson as unknown as DawnStockTable,
    facilities: (facilitiesJson.facilities ?? []) as unknown as FacilityRow[],
    economyResources: (economyResourcesJson.resources ?? []) as unknown as EconomyResourceRow[],
    economyRoutes: (routesJson.routes ?? []).map((r) => ({
      id: r.id,
      fromTownId: r.fromTownId,
      toTownId: r.toTownId,
      days: typeof r.days === 'number' ? r.days : 1,
      condition: typeof r.condition === 'number' ? r.condition : 1,
      broken: r.broken === true,
      extractive: r.extractive === true,
      receiveShare: r.receiveShare as unknown as Record<string, number> | undefined,
      facilityIds: [...(r.facilityIds ?? [])],
    })),
    caravanSchedules: loadCaravanSchedules(),
    socialWeb: loadSocialWeb(),
    socialCentrality: socialCentralityJson as unknown as CentralityTable,
    socialPropagation: loadSocialPropagation(),
    unspoken: {
      classes: unspokenClassesJson.classes,
      outcomes: [...unspokenBlessingsJson.outcomes, ...unspokenBurdensJson.outcomes],
      tuning: unspokenTuningJson,
      fragments: unspokenFragmentsJson.fragments,
    } as unknown as UnspokenTables,
  };
}
