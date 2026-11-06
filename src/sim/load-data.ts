/** Load and index locked JSON tables from src/data. Pure: no Phaser/DOM/Math.random. */

import type { ArchetypeDef, HookDef } from './types/data';

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
import kinshipJson from '../data/people/kinship.json';
import lettersJson from '../data/dialogue/letters.json';
import doctrinesJson from '../data/systems/doctrines.json';
import { loadLineFragmentsTable } from './load-fragments';
import voiceAnchorsJson from '../data/dialogue/voice-anchors.json';
import reactionCurvesJson from '../data/dialogue/reaction-curves.json';
import voiceConstraintsJson from '../data/dialogue/voice-constraints.json';

import hooksSparkRecovery from '../data/hooks/spark-recovery.json';
import hooksPersonalCost from '../data/hooks/personal-cost.json';
import hooksRefusal from '../data/hooks/refusal.json';
import hooksLegacy from '../data/hooks/legacy.json';

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
  peopleById: Record<string, { id: string; authored?: boolean; anchor?: boolean; woundId?: string; flameStart?: number; tags?: string[]; [k: string]: unknown }>;
  towns: unknown[];
  links: unknown[];
  player: unknown;
  wounds: unknown[];
  marks: unknown[];
  events: unknown[];
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
  hooksById: Map<string, HookDef>;
};

const HOOK_PARTS = [
  hooksSparkRecovery,
  hooksPersonalCost,
  hooksRefusal,
  hooksLegacy,
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
    proofs: (proofsJson.proofs ?? []) as unknown[],
    time: timeJson,
    ripples: ripplesJson,
    lines: { deprecated: true, replaces: 'line-fragments' },
    kinship: kinshipJson,
    letters: lettersJson,
    doctrines: doctrinesJson,
    lineFragments: loadLineFragmentsTable(),
    voiceAnchors: voiceAnchorsJson as VoiceAnchorsTable,
    reactionCurves: reactionCurvesJson as ReactionCurvesTable,
    voiceConstraints: voiceConstraintsJson as VoiceConstraintsTable,
    hooksById,
  };
}
