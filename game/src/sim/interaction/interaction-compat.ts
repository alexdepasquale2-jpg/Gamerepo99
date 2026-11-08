/** Method → interaction compat adapter (spec §7). Remove once Probe uses interaction ids. */
import { createInteractionRuntime } from './interactions';
import type { InteractionPerson } from './interaction-state';
import type { InteractionRuntime } from './interaction-types';
import type { InteractionTables } from './load-interactions';

/** Interaction runtime plus the method→interaction map it was built with. */
export interface CompatRuntime extends InteractionRuntime {
  migration: ReadonlyMap<string, string[]>;
}

/** First recipeDefault interaction id for a legacy method id, if mapped. */
export function expandMethodAct(
  migration: ReadonlyMap<string, string[]>,
  methodId: string,
): string | undefined {
  return migration.get(methodId)?.[0];
}

export function createCompatRuntime(tables: InteractionTables, person: InteractionPerson): CompatRuntime {
  return {
    ...createInteractionRuntime({ catalog: tables.catalog, scoring: tables.scoring, person }),
    migration: tables.migration,
  };
}
