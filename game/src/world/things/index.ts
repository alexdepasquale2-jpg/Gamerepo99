/**
 * Every interactable world Thing in one place: town fixtures (noticeboard, signpost, hearth, doors),
 * nodes, facilities, stash chests, ground items, plots, graves, and the workable tile in front of the player.
 * Keys are `${kind}:${id}`; each target carries what its sim provider (sim/contrib/objects, stash) needs.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import type { WorldLayout } from '../../sim/map/world-layout';
import type { TerrainAccess } from '../../sim/map/terrain-access';
import { DOOR_REACH, INTERIOR_TITLE } from '../../sim/map/interiors';
import { pickLandWork, type LandTown, type LandView } from '../../sim/land-acts';
import { TILE_PX } from '../../sim/map/constants';
import { tileFoot, type Pt } from '../depth';
import type { TownSpots } from '../town-spots';
import type { DrawnTile } from '../chunk-layer';
import { createNodesLayer, type NodesLayer } from './nodes';
import { createFacilitiesLayer, type FacilitiesLayer } from './facilities';
import { createChests, type ChestsLayer } from './chests';
import { createGroundItems, type GroundLayer } from './ground';
import { createPlots, type PlotsLayer } from './plots';
import { createGraves, type GravesLayer } from './graves';

/** What a `tile:<q>,<r>` Thing carries: the faced workable tile and everything sim/land-acts needs to work it. */
export type TileData = {
  q: number; r: number;
  /** The land act this tile allows (data/world/land-acts.json id). */
  act: string;
  /** Where the player stands and faces (pickLandWork / workLandHere take these). */
  from: { q: number; r: number };
  facing: { dx: number; dy: number };
  /** Live, edit-aware terrain plus what is drawn on each tile. */
  view: LandView;
  towns: LandTown[];
};

const TILE_LABEL: Record<string, string> = { lay_stones: 'Shallows', clear_brush: 'Brush', mend_path: 'Open ground' };
const BOARD_REACH = 50, SIGN_REACH = TILE_PX * 1.8, HEARTH_REACH = 44, TILE_REACH = 56;

export type WorldThings = {
  nodes: NodesLayer; facilities: FacilitiesLayer; chests: ChestsLayer; ground: GroundLayer; plots: PlotsLayer; graves: GravesLayer;
  things(near: Pt, radius: number, facing?: { dx: number; dy: number }): Thing[];
  /** The tile Thing in front of a point (null when nothing there can be worked). */
  tileThing(at: Pt, facing: { dx: number; dy: number }): Thing | null;
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
}): WorldThings {
  const { scene, getState } = o;
  const byTown = new Map(o.towns.map((t) => [t.town.id, t]));
  const nodes = createNodesLayer(scene, getState, o.seed, o.layout);
  const facilities = createFacilitiesLayer(scene, getState, o.nameOf);
  const chests = createChests(scene, getState, (townId) => byTown.get(townId)?.chest);
  const ground = createGroundItems(scene, getState);
  const plots = createPlots(scene, getState);
  const graves = createGraves(scene, getState, (townId, n) => byTown.get(townId)?.grave(n));
  const landTowns: LandTown[] = o.layout.settlements.map((t) => ({ id: t.id, q: t.q, r: t.r, name: o.nameOf(t.id) }));
  const view: LandView = { ...o.terrain, drawn: o.drawn };

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

  const tileThing = (at: Pt, facing: { dx: number; dy: number }): Thing | null => {
    const st = getState();
    if (!st) return null;
    const from = { q: Math.floor(at.x / TILE_PX), r: Math.floor((at.y - 2) / TILE_PX) };
    const pick = pickLandWork(st, view, from, facing);
    if (!pick) return null;
    const f = tileFoot(pick.q, pick.r);
    const id = `${pick.q},${pick.r}`;
    const data: TileData = { q: pick.q, r: pick.r, act: pick.act.id, from, facing: { ...facing }, view, towns: landTowns };
    return { key: `tile:${id}`, kind: 'tile', id, x: f.x, y: f.y, reach: TILE_REACH, label: TILE_LABEL[pick.act.id] ?? pick.act.label, target: { kind: 'tile', id, data } };
  };

  const all = [nodes, facilities, chests, ground, plots, graves];
  return {
    nodes, facilities, chests, ground, plots, graves,
    things(near, radius, facing) {
      const out = [...fixtures(near, radius), ...nodes.things(near, radius), ...facilities.things(near, radius), ...chests.things(near, radius), ...ground.things(near, radius), ...plots.things(near, radius), ...graves.things(near, radius)];
      if (facing) { const t = tileThing(near, facing); if (t) out.push(t); }
      return out;
    },
    tileThing,
    setVisible(on) { for (const l of all) l.setVisible(on); },
    destroy() { for (const l of all) l.destroy(); },
  };
}
