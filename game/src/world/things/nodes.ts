/**
 * Resource nodes (sim/goods/nodes): fixed ones around towns and along roads, wild ones collapsed only in
 * the chunks around the player. Each shows how much is left (full, picked over, spent; a felled tree is a
 * stump) and pops when it is gathered. Charged nodes are Things with the WorldNode as target data.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { nodeCharges, nodeKind, placeNodes, wildNodesIn, type WorldNode } from '../../sim/goods/nodes';
import { CHUNK_SIZE, TILE_PX } from '../../sim/map/constants';
import type { WorldLayout } from '../../sim/map/world-layout';
import { ART_SCALE } from '../art/px';
import { nodeTex } from '../art/thing-art';
import { tileFoot, type Pt } from '../depth';

const REACH = 40;
type View = { node: WorldNode; img: Phaser.GameObjects.Image; pos: Pt; level: number };

export type NodesLayer = {
  things(near: Pt, radius: number): Thing[];
  update(player: Pt): void;
  refresh(): void;
  /** Every node currently drawn (dev). */
  all(): WorldNode[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function levelOf(state: SimState | undefined, n: WorldNode): number {
  const max = nodeKind(n.kindId)?.charges ?? 1;
  const left = state ? nodeCharges(state, n) : max;
  return left <= 0 ? 0 : left < max ? 1 : 2;
}

export function createNodesLayer(scene: Phaser.Scene, getState: () => SimState | undefined, seed: number, layout: WorldLayout): NodesLayer {
  let visible = true;
  const make = (node: WorldNode): View => {
    const pos = tileFoot(node.q, node.r);
    const level = levelOf(getState(), node);
    const img = scene.add.image(pos.x, pos.y, nodeTex(node.kindId, level)).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(pos.y).setVisible(visible);
    return { node, img, pos, level };
  };
  const fixed = placeNodes(seed, layout.settlements, layout.routes).map(make);
  const wild = new Map<string, View[]>();
  let views: View[] = fixed;
  let lastChunk = '';

  const observe = (player: Pt): void => {
    const span = TILE_PX * CHUNK_SIZE;
    const cx = Math.floor(player.x / span), cy = Math.floor(player.y / span);
    const key = `${cx},${cy}`;
    if (key === lastChunk) return;
    lastChunk = key;
    const want = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) want.add(`${cx + dx},${cy + dy}`);
    for (const [k, vs] of wild) if (!want.has(k)) { for (const v of vs) v.img.destroy(); wild.delete(k); }
    for (const k of want) if (!wild.has(k)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const q0 = x * CHUNK_SIZE, r0 = y * CHUNK_SIZE;
      wild.set(k, wildNodesIn(seed, layout.settlements, q0, r0, q0 + CHUNK_SIZE, r0 + CHUNK_SIZE).map(make));
    }
    views = [...fixed, ...[...wild.values()].flat()];
  };

  const refresh = (): void => {
    const st = getState();
    for (const v of views) {
      const level = levelOf(st, v.node);
      if (level === v.level) continue;
      const gathered = level < v.level;
      v.level = level;
      v.img.setTexture(nodeTex(v.node.kindId, level));
      if (gathered) scene.tweens.add({ targets: v.img, scaleX: ART_SCALE * 1.12, scaleY: ART_SCALE * 0.88, duration: 90, yoyo: true });
    }
  };

  return {
    things(near, radius) {
      const st = getState();
      const out: Thing[] = [];
      for (const v of views) {
        if (v.level === 0 || Math.hypot(v.pos.x - near.x, v.pos.y - near.y) > radius) continue;
        if (st && nodeCharges(st, v.node) <= 0) continue;
        out.push({
          key: `node:${v.node.id}`, kind: 'node', id: v.node.id, x: v.pos.x, y: v.pos.y, reach: REACH,
          label: nodeKind(v.node.kindId)?.name ?? 'Gathering spot',
          target: { kind: 'node', id: v.node.id, data: v.node },
        });
      }
      return out;
    },
    update: observe,
    refresh,
    all: () => views.map((v) => v.node),
    setVisible(on) { visible = on; for (const v of views) v.img.setVisible(on); },
    destroy() { for (const v of views) v.img.destroy(); wild.clear(); },
  };
}
