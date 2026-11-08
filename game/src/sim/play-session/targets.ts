/**
 * Interaction targets: every thing the player can press E on, tap or click. A target is a kind plus an
 * id; acts on it are `<verb>@<personId>` for people (the old ids) and `<verb>@<kind>:<id>` for things.
 * Pure: no Phaser/DOM.
 */

export const TARGET_KINDS = [
  'person', 'node', 'facility', 'board', 'wagon', 'signpost', 'door', 'hearth', 'chest', 'ground-item', 'plot', 'tile', 'fauna', 'grave', 'prop', 'stall',
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** A thing in the world, by kind and id. */
export type TargetRef = { kind: TargetKind; id: string };
/**
 * A target as the scene hands it to the sim: the ref plus whatever the thing is in the scene that the
 * sim cannot rebuild by id (a resource node's tile and kind, a town-name lookup).
 */
export type Target = TargetRef & { data?: unknown };

const KIND_SET = new Set<string>(TARGET_KINDS);
export const isTargetKind = (k: string): k is TargetKind => KIND_SET.has(k);

/** `person:jonah_pike`, `node:peat_ladder#3`. */
export const targetKey = (t: TargetRef): string => `${t.kind}:${t.id}`;

/** Parse `kind:id` (or a bare person id). Ids may contain ':' themselves; only the first one splits. */
export function parseTargetKey(key: string): TargetRef | null {
  const c = key.indexOf(':');
  if (c > 0 && isTargetKind(key.slice(0, c))) return { kind: key.slice(0, c) as TargetKind, id: key.slice(c + 1) };
  return key ? { kind: 'person', id: key } : null;
}

/** The act id for a verb on a target: people keep `<verb>@<personId>`. */
export const targetActionId = (verb: string, t: TargetRef): string => (t.kind === 'person' ? `${verb}@${t.id}` : `${verb}@${targetKey(t)}`);

/** Split an act id into its verb and target (people for plain `<verb>@<id>`). */
export function parseTargetAction(actionId: string): { verb: string; target: TargetRef } | null {
  const at = actionId.indexOf('@');
  if (at <= 0 || at === actionId.length - 1) return null;
  const target = parseTargetKey(actionId.slice(at + 1));
  return target ? { verb: actionId.slice(0, at), target } : null;
}
