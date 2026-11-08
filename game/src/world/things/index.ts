/**
 * Every interactable world Thing in one place: town fixtures (noticeboard, signpost, hearth, doors),
 * nodes, facilities, stash chests, ground items, plots, graves, and the wild props (trees, rocks, camps, critters …).
 * Keys are `${kind}:${id}`; each target carries what its sim provider (sim/contrib/objects, stash) needs.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import type { WorldLayout } from '../../sim/map/world-layout';
import type { TerrainAccess } from '../../sim/map/terrain-access';
import { DOOR_REACH, INTERIOR_TITLE } from '../../sim/map/interiors';
import { TILE_PX } from '../../sim/map/constants';
import type { FacilityRenderView } from '../../sim/map/types';
import { FAUNA, propRow, spotStoryKey } from '../../sim/contrib/thing-verbs';
import { spotTagOf } from '../../sim/map/ladder/dress';
import { isSpotHeart, spotLore, title } from '../../sim/map/ladder/spot-lore';
import { usedToday } from '../../sim/contrib/use-effects';
import { tileFoot, type Pt } from '../depth';
import type { TownSpots } from '../town-spots';
import type { DrawnTile } from '../chunk-layer';
import { createNodesLayer, type NodesLayer } from './nodes';
import { createFacilitiesLayer, type FacilitiesLayer } from './facilities';
import { createChests, type ChestsLayer } from './chests';
import { createGroundItems, type GroundLayer } from './ground';
import { createPlots, type PlotsLayer } from './plots';
import { createGraves, type GravesLayer } from './graves';

const BOARD_REACH = 50, SIGN_REACH = TILE_PX * 1.8, HEARTH_REACH = 44, PROP_REACH = 40, CRITTER_REACH = 56;

export type WorldThings = {
  nodes: NodesLayer; facilities: FacilitiesLayer; chests: ChestsLayer; ground: GroundLayer; plots: PlotsLayer; graves: GravesLayer;
  things(near: Pt, radius: number, facing?: { dx: number; dy: number }): Thing[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createWorldThings(o: {
  scene: Phaser.Scene;
  getState: () => SimState | undefined;
  seed: number;
  layout: WorldLayout;
  towns: TownSpots[];
  nameOf: (townId: string) => string;
  terrain: TerrainAccess;
  drawn: (q: number, r: number) => DrawnTile;
  /** Wild props standing near a point (chunk-layer), so each can be used. */
  propsNear?: (near: Pt, radius: number) => { prop: FacilityRenderView; x: number; y: number }[];
}): WorldThings {
  const { scene, getState } = o;
  const byTown = new Map(o.towns.map((t) => [t.town.id, t]));
  const nodes = createNodesLayer(scene, getState, o.seed, o.layout);
  const facilities = createFacilitiesLayer(scene, getState, o.nameOf);
  const chests = createChests(scene, getState, (townId) => byTown.get(townId)?.chest);
  const ground = createGroundItems(scene, getState);
  const plots = createPlots(scene, getState);
  const graves = createGraves(scene, getState, (townId, n) => byTown.get(townId)?.grave(n));

  const fixtures = (near: Pt, radius: number): Thing[] => {
    const out: Thing[] = [];
    const within = (p: Pt) => Math.hypot(p.x - near.x, p.y - near.y) <= radius;
    for (const s of o.towns) {
      if (Math.hypot(s.centre.x - near.x, s.centre.y - near.y) > radius + TILE_PX * 14) continue;
      const id = s.town.id;
      if (within(s.board)) out.push({ key: `board:${id}`, kind: 'board', id, ...s.board, reach: BOARD_REACH, label: 'Noticeboard', target: { kind: 'board', id } });
      if (within(s.signpost)) out.push({ key: `signpost:${id}`, kind: 'signpost', id, ...s.signpost, reach: SIGN_REACH, label: 'Signpost', target: { kind: 'signpost', id } });
      if (within(s.hearth)) out.push({ key: `hearth:${id}`, kind: 'hearth', id, ...s.hearth, reach: HEARTH_REACH, label: 'Hearth', target: { kind: 'hearth', id } });
      for (const b of s.buildings) {
        if (!within(b.door)) continue;
        out.push({ key: `door:${b.id}`, kind: 'door', id: b.id, x: b.door.x, y: b.door.y, reach: DOOR_REACH, label: INTERIOR_TITLE[b.kind], target: { kind: 'door', id: b.id, data: { kind: b.kind } } });
      }
    }
    return out;
  };

  const faunaName = new Map(FAUNA.map((f) => [f.id, f.name]));
  /** Every wild prop in reach as a Thing: critters act as their animal, the rest by props.json; a prop spent for today drops out. */
  const wild = (near: Pt, radius: number): Thing[] => {
    const st = getState();
    const out: Thing[] = [];
    for (const { prop, x, y } of o.propsNear?.(near, radius) ?? []) {
      const q = prop.position.x, r = prop.position.y;
      if (prop.type === 'critter') {
        const kind = prop.state && faunaName.has(prop.state) ? prop.state : 'rabbit';
        const id = `${kind}#${q},${r}`;
        out.push({ key: `fauna:${id}`, kind: 'fauna', id, x, y, reach: CRITTER_REACH, label: faunaName.get(kind) ?? 'Animal', target: { kind: 'fauna', id, data: { kindId: kind } } });
        continue;
      }
      const row = propRow(prop.type);
      if (!row) continue;
      // A named spot's props keep its name, and stay while its story is untold today.
      const spot = spotTagOf(prop), lore = spot ? spotLore(o.seed, spot.id, spot.type) : null;
      const storyLeft = !!spot && !!st && !usedToday(st, spotStoryKey(spot));
      if (st && !storyLeft && row.verbs.every((v) => usedToday(st, `prop.${v.id}@${row.type}`))) continue;
      const id = `${prop.type}@${q},${r}`;
      const label = !spot || !lore ? row.name : isSpotHeart(spot.type, prop.type) ? title(lore.name) : `${row.name} by ${lore.name}`;
      out.push({ key: `prop:${id}`, kind: 'prop', id, x, y, reach: PROP_REACH, label, target: { kind: 'prop', id, data: spot ? { type: prop.type, spot } : { type: prop.type } } });
    }
    return out;
  };

  const all = [nodes, facilities, chests, ground, plots, graves];
  return {
    nodes, facilities, chests, ground, plots, graves,
    things(near, radius, facing) {
      const out = [...fixtures(near, radius), ...nodes.things(near, radius), ...facilities.things(near, radius), ...chests.things(near, radius), ...ground.things(near, radius), ...plots.things(near, radius), ...graves.things(near, radius), ...wild(near, radius)];
      return out;
    },
    setVisible(on) { for (const l of all) l.setVisible(on); },
    destroy() { for (const l of all) l.destroy(); },
  };
}
