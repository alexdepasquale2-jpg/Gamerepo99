/** Method → interaction compat adapter (spec §7). Remove once Probe uses interaction ids. */
import catalogJson from '../data/systems/interactions/catalog.json';
import migrationJson from '../data/systems/interactions/migration.json';
import scoringJson from '../data/systems/interactions/scoring.json';
import {
  createInteractionRuntime,
  type InteractionDef,
  type InteractionRuntime,
  type InteractionScoring,
} from './interactions';
import type { InteractionPerson } from './interaction-state';

export function loadMigrationMap(): Map<string, string[]> {
  const rows = (migrationJson as { map: { methodId: string; recipeDefault: string[] }[] }).map;
  return new Map(rows.map((r) => [r.methodId, r.recipeDefault]));
}

/** First recipeDefault interaction id for a legacy method id, if mapped. */
export function expandMethodAct(methodId: string): string | undefined {
  return loadMigrationMap().get(methodId)?.[0];
}

export function createCompatRuntime(person: InteractionPerson): InteractionRuntime {
  return createInteractionRuntime({
    catalog: catalogJson as unknown as { interactions: InteractionDef[] },
    scoring: scoringJson as unknown as InteractionScoring,
    person,
  });
}
