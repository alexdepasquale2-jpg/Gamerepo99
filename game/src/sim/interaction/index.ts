/** Interaction model barrel (spec: interaction migration) + method→interaction compat. */
export {
  createInteractionRuntime,
  resolveInteraction,
  REIGNITE_MIN_KINDS,
} from './interactions';
export type {
  InteractionDef,
  InteractionResult,
  InteractionRuntime,
  InteractionRuntimeInit,
  InteractionScoring,
  InteractionTouch,
  MarkAdd,
} from './interactions';
export type { InteractionPerson, PromiseStatus } from './interaction-state';
export { createCompatRuntime, expandMethodAct } from './interaction-compat';
export type { CompatRuntime } from './interaction-compat';
export { loadInteractionTables, loadMigrationMap } from './load-interactions';
export type { InteractionTables, MigrationTable } from './load-interactions';
