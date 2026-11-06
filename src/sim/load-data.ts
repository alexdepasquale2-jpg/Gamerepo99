/** Load and index locked JSON tables from src/data. Pure: no Phaser/DOM/Math.random. */

import type { ArchetypeDef, HookDef } from './types/data';

import archetypesJson from '../data/archetypes.json';
import traitsJson from '../data/traits.json';
import methodsJson from '../data/methods.json';
import peopleJson from '../data/people.json';
import townsJson from '../data/towns.json';
import linksJson from '../data/links.json';
import playerJson from '../data/player.json';
import woundsJson from '../data/wounds.json';
import marksJson from '../data/marks.json';
import eventsJson from '../data/events.json';
import proofsJson from '../data/proofs.json';
import timeJson from '../data/time.json';
import ripplesJson from '../data/ripples.json';
import linesJson from '../data/lines.json';
import kinshipJson from '../data/kinship.json';
import lettersJson from '../data/letters.json';
import doctrinesJson from '../data/doctrines.json';

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

export type DataTables = {
  archetypes: ArchetypeDef[];
  traits: TraitsTables;
  hooks: HookDef[];
  methods: unknown[];
  /** From methods.json meta — used by commitMethod resolve. */
  rngFuzz: number;
  reigniteThreshold: number;
  people: unknown[];
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
    towns: (townsJson.towns ?? []) as unknown[],
    links: (linksJson.links ?? []) as unknown[],
    player: playerJson,
    wounds: (woundsJson.wounds ?? []) as unknown[],
    marks: (marksJson.marks ?? []) as unknown[],
    events: (eventsJson.events ?? []) as unknown[],
    proofs: (proofsJson.proofs ?? []) as unknown[],
    time: timeJson,
    ripples: ripplesJson,
    lines: linesJson,
    kinship: kinshipJson,
    letters: lettersJson,
    doctrines: doctrinesJson,
    hooksById,
  };
}
