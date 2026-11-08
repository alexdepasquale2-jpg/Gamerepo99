/**
 * Verbs on the things of the world, one ring model with people: gather a node,
 * read a noticeboard, trade at a wagon, take a road at a signpost, enter (or leave) by a door, rest at a
 * hearth, pick up what lies on the ground. The stash chest's verbs live with the stash (contrib/stash.ts).
 *
 * Each act runs through session.act, so moments, juice and the event log see it. Acts whose effect is a
 * sheet or a scene change (read, trade, roads, enter, rest) only settle the sim side here (and refuse what
 * the body cannot do); the scene then opens the sheet or plays the fade.
 */
import { entranceFor, entryLine, refusedDoorLine } from '../embodiment';
import { ensureInhabitantParts } from '../inhabitant';
import { ITEM_BY_ID } from '../goods/inventory';
import { pickUpItem } from '../goods/item-use';
import { gatherNode, nodeCharges, nodeKind, type WorldNode } from '../goods/nodes';
import type { InteriorKind } from '../map/interiors';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const one = (t: Target, verb: string, label: string, short: string = label, family?: string): ProvidedAction[] => [
  { id: targetActionId(verb, t), label, short, ...(family ? { family } : {}) },
];

/** The scene's resource node (q, r, kind) rides along as target data; the id alone cannot rebuild it. */
const nodeOf = (t: Target): WorldNode | undefined => {
  const n = t.data as WorldNode | undefined;
  return n && n.id === t.id && typeof n.kindId === 'string' ? n : undefined;
};

registerTargetProvider({
  id: 'node',
  kinds: ['node'],
  list(state, t) {
    const n = nodeOf(t);
    if (!n || nodeCharges(state, n) <= 0) return [];
    return one(t, 'gather', `Gather · ${nodeKind(n.kindId)?.name ?? 'here'}`, 'Gather', 'work');
  },
  act(state, actionId, t) {
    const n = nodeOf(t);
    if (verbOf(actionId) !== 'gather' || !n) return false;
    const line = gatherNode(state, n);
    return line ? { ok: true, line } : { ok: false, line: 'Nothing left to take here today.' };
  },
});

// Facilities have no ring verb: you work one by holding to work at its spot (sim/tasks, hold-to-work).

registerTargetProvider({
  id: 'board',
  kinds: ['board'],
  list: (_s, t) => one(t, 'read', 'Read the noticeboard', 'Read'),
  act: (_s, actionId) => (verbOf(actionId) === 'read' ? { ok: true } : false),
});

registerTargetProvider({
  id: 'wagon',
  kinds: ['wagon'],
  list: (state, t) => (state.caravans?.some((c) => c.id === t.id) ? one(t, 'trade', 'Trade with the driver', 'Trade') : []),
  act: (state, actionId, t) => (verbOf(actionId) === 'trade' && state.caravans?.some((c) => c.id === t.id) ? { ok: true } : false),
});

registerTargetProvider({
  id: 'signpost',
  kinds: ['signpost'],
  list: (_s, t) => one(t, 'roads', 'Take a road', 'Roads'),
  act(state, actionId, t) {
    if (verbOf(actionId) !== 'roads') return false;
    // You leave from where you stand: the signpost belongs to this town.
    state.player.townId = t.id;
    return { ok: true };
  },
});

/** A door: the building's interior kind rides along as data. The room's own exit is `door:exit`. */
type DoorData = { kind?: InteriorKind };
export const EXIT_DOOR = 'exit';

registerTargetProvider({
  id: 'door',
  kinds: ['door'],
  list: (_s, t) => (t.id === EXIT_DOOR ? one(t, 'leave', 'Step outside', 'Leave') : one(t, 'enter', 'Go inside', 'Enter')),
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (verb === 'leave' && t.id === EXIT_DOOR) return { ok: true };
    if (verb !== 'enter') return false;
    const kind = (t.data as DoorData | undefined)?.kind;
    if (!kind) return { ok: true };
    // Some bodies don't fit every door (an ogre and a cottage) and some rooms want business (an office):
    // the body's traits and ways in decide (data/world/entrances.json), not its name.
    ensureInhabitantParts(state);
    const way = entranceFor(state.player, kind);
    if (!way) return { ok: false, line: refusedDoorLine(state.player, kind, `${t.id}:${state.day}`) };
    const line = entryLine(state.player, way, `${t.id}:${state.day}`);
    return line ? { ok: true, line } : { ok: true };
  },
});

registerTargetProvider({
  id: 'hearth',
  kinds: ['hearth'],
  list: (_s, t) => one(t, 'rest', 'Rest until dawn', 'Rest'),
  act: (_s, actionId) => (verbOf(actionId) === 'rest' ? { ok: true } : false),
});

const groundOf = (state: SimState, id: string) => (state.groundItems ?? []).find((g) => g.id === id);

registerTargetProvider({
  id: 'ground-item',
  kinds: ['ground-item'],
  list(state, t) {
    const g = groundOf(state, t.id);
    return g ? one(t, 'pick_up', `Pick up the ${ITEM_BY_ID.get(g.itemId)?.name ?? g.itemId}`, 'Pick up') : [];
  },
  act(state, actionId, t) {
    if (verbOf(actionId) !== 'pick_up') return false;
    const g = groundOf(state, t.id);
    if (!g || !pickUpItem(state, t.id)) return { ok: false, line: 'It is gone.' };
    return { ok: true, line: `You pick up the ${ITEM_BY_ID.get(g.itemId)?.name ?? g.itemId}.` };
  },
});
