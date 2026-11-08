/** Load interaction tables (catalog, scoring, migration) from src/data. Only JSON entry point for interaction/. */

import catalogJson from '../../data/systems/interactions/catalog.json';
import migrationJson from '../../data/systems/interactions/migration.json';
import scoringJson from '../../data/systems/interactions/scoring.json';
import type { InteractionDef, InteractionScoring } from './interaction-types';

export interface MigrationTable {
  map: { methodId: string; recipeDefault: string[] }[];
}

export interface InteractionTables {
  catalog: { interactions: InteractionDef[] };
  scoring: InteractionScoring;
  /** Legacy method id → recipeDefault interaction ids. */
  migration: Map<string, string[]>;
}

/** Index a migration table by method id. Pure. */
export function loadMigrationMap(table: MigrationTable): Map<string, string[]> {
  return new Map(table.map.map((r) => [r.methodId, r.recipeDefault]));
}

export function loadInteractionTables(): InteractionTables {
  return {
    catalog: catalogJson as unknown as InteractionTables['catalog'],
    scoring: scoringJson as unknown as InteractionScoring,
    migration: loadMigrationMap(migrationJson as MigrationTable),
  };
}
