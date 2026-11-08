/**
 * What the scene puts in `target.data` so the sim can offer verbs on a thing. Every field is optional;
 * the sim falls back to the player's town and to what the id alone says. Pure: no Phaser/DOM.
 *
 *   any kind      { heldItem?: string }       the item selected in the hotbar: its "Use …" verbs join the ring
 *   node          WorldNode & { heldItem? }   (objects.ts reads the node from data, as before)
 *   tile          TileTargetData              the tile in reach: land acts need its q, r and the live LandView
 *   fauna         FaunaTargetData             the animal's kind (fauna.json id) and its town
 *   hearth/board  { townId? }                 which town's hearth or noticeboard
 *   grave         a stone in state.legacy.graves (`<personId>#<day>`, contrib/graves); GraveData
 *   plot          a build claim id; an older grave is a plot whose id starts with "grave" (or data.grave = true)
 *   prop shrine   the wild shrine stone (`shrine@<q>,<r>`, data.type 'shrine') takes offerings
 *   node #shrine  a herb patch at a shrine (id ends "#shrine", or data.shrine = true) takes offerings too
 */
import type { WorldNode } from '../goods/nodes';
import type { LandTown, LandView } from '../land-acts';
import type { Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';

/** Common to every kind: the held item, and the town the thing belongs to. */
export type HeldData = { heldItem?: string | null; townId?: string };
export type TileTargetData = HeldData & { q: number; r: number; view?: LandView; towns?: LandTown[] };
export type FaunaTargetData = HeldData & {
  /** fauna.json id (rabbit, deer, …). Without it the id's head before '#', ':' or '_' is tried. */
  kindId?: string;
  /** Nodes near the animal (drive-off verbs help these regrow); else the town's depleted nodes. */
  nearNodes?: WorldNode[];
};
export type GraveData = HeldData & { grave?: boolean; personId?: string; name?: string };

const rec = (t: Target): Record<string, unknown> => (t.data && typeof t.data === 'object' ? (t.data as Record<string, unknown>) : {});

/** The held item the scene passed with the target, if any (coin included). */
export function heldItemOf(t: Target): string | undefined {
  const h = rec(t).heldItem;
  return typeof h === 'string' && h ? h : undefined;
}

/** Which town a thing belongs to: its data, a node's town, a person's town, a town id, else where the player stands. */
export function townOfTarget(state: SimState, t: Target): string | undefined {
  const d = rec(t);
  if (typeof d.townId === 'string' && d.townId) return d.townId;
  if (t.kind === 'person') return state.people[t.id]?.townId ?? state.player.townId;
  if (state.towns?.[t.id]) return t.id;
  if (t.kind === 'plot') {
    const claim = state.build?.claims.find((c) => c.id === t.id);
    if (claim) return claim.townId;
  }
  return state.player.townId;
}

export const isGrave = (t: Target): boolean => t.kind === 'grave' || (t.kind === 'plot' && (t.id.startsWith('grave') || rec(t).grave === true));
/**
 * A shrine takes offerings: the wild shrine stone (props.json `shrine`, a prop the world draws at shrine
 * spots) or the older herb-patch convention. Nothing in the world made the node form, so without the prop
 * "Offer them at the shrine" was never on any ring.
 */
export const isShrine = (t: Target): boolean =>
  (t.kind === 'prop' && (rec(t).type === 'shrine' || t.id.startsWith('shrine@'))) ||
  (t.kind === 'node' && (t.id.endsWith('#shrine') || rec(t).shrine === true));

/** The node in the data (the scene's own node object; objects.ts uses the same check). */
export function nodeData(t: Target): WorldNode | undefined {
  const n = t.data as WorldNode | undefined;
  return t.kind === 'node' && n && n.id === t.id && typeof n.kindId === 'string' ? n : undefined;
}

export function tileData(t: Target): TileTargetData | undefined {
  const d = rec(t);
  return t.kind === 'tile' && typeof d.q === 'number' && typeof d.r === 'number' ? (d as TileTargetData) : undefined;
}

/** The fauna kind of an animal target: data.kindId, else the id's head ("rabbit#3" → rabbit). */
export function faunaKindOf(t: Target): string | undefined {
  if (t.kind !== 'fauna') return undefined;
  const k = rec(t).kindId;
  if (typeof k === 'string' && k) return k;
  return t.id.split(/[#:_]/)[0] || undefined;
}
