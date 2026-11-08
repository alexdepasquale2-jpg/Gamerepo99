/** Resource nodes in the overworld: sprites, depletion look, nearest-node prompt, gather pop. */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { gatherNode, nodeCharges, placeNodes, wildNodesIn, type WorldNode } from '../../sim/goods/nodes';
import { CHUNK_SIZE, TILE_PX } from '../../sim/map/constants';
import type { MapPoint } from '../../sim/map/world-layout';
import { tileFootWorld } from '../depth-sort';
import { ensureGoodsTextures, texKey } from './node-textures';

const NEAR = 40;
type Pt = { x: number; y: number };
export type NodeView = { node: WorldNode; sprite: Phaser.GameObjects.Image; pos: Pt };

export type NodesLayer = {
  views: NodeView[];
  nearest: (p: Pt) => NodeView | null;
  gather: (v: NodeView) => string | null;
  refresh: () => void;
  /** Nodes near a town, used as villager work spots. */
  workSpots: (townId: string) => Pt[];
  /** Wild nodes just beyond a town's edge (foraging errands). */
  outskirtSpots: (townId: string) => Pt[];
  update: (player: Pt, time: number) => void;
};

export function createNodesLayer(
  scene: Phaser.Scene,
  getState: () => SimState | undefined,
  seed: number,
  settlements: { id: string; q: number; r: number }[],
  routes: { from: string; to: string; path?: MapPoint[] }[],
): NodesLayer {
  ensureGoodsTextures(scene);
  const makeView = (node: WorldNode): NodeView => {
    const f = tileFootWorld(node.q, node.r);
    const sprite = scene.add.image(f.x, f.y, texKey(node.kindId)).setOrigin(0.5, 1).setScale(2).setDepth(f.y);
    return { node, sprite, pos: { x: f.x, y: f.y } };
  };
  const fixed = placeNodes(seed, settlements, routes).map(makeView);
  // Wild nodes collapse into sprites only in the 3x3 chunks around the player and vanish when left.
  const wild = new Map<string, NodeView[]>();
  let views: NodeView[] = fixed;
  let lastChunk = '';
  const observe = (player: Pt): void => {
    const span = TILE_PX * CHUNK_SIZE;
    const cx = Math.floor(player.x / span), cy = Math.floor(player.y / span);
    const key = `${cx},${cy}`;
    if (key === lastChunk) return;
    lastChunk = key;
    const want = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) want.add(`${cx + dx},${cy + dy}`);
    for (const [k, vs] of wild) if (!want.has(k)) { for (const v of vs) v.sprite.destroy(); wild.delete(k); }
    for (const k of want) if (!wild.has(k)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const q0 = x * CHUNK_SIZE, r0 = y * CHUNK_SIZE;
      wild.set(k, wildNodesIn(seed, settlements, q0, r0, q0 + CHUNK_SIZE, r0 + CHUNK_SIZE).map(makeView));
    }
    views = [...fixed, ...[...wild.values()].flat()];
    refresh();
  };
  const prompt = scene.add
    .text(0, 0, 'E  gather', { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
    .setOrigin(0.5, 1).setDepth(998_400).setVisible(false);

  function refresh(): void {
    const st = getState();
    if (!st) return;
    for (const v of views) {
      const empty = nodeCharges(st, v.node) <= 0;
      const tex = empty ? (v.node.kindId === 'tree' ? 'tree_stump' : 'depleted') : v.node.kindId;
      if (v.sprite.texture.key !== texKey(tex)) v.sprite.setTexture(texKey(tex));
    }
  }
  refresh();

  const nearest = (p: Pt): NodeView | null => {
    const st = getState();
    let best: NodeView | null = null;
    let bd = NEAR;
    for (const v of views) {
      const d = Math.hypot(p.x - v.pos.x, p.y - v.pos.y);
      if (d < bd && st && nodeCharges(st, v.node) > 0) {
        bd = d;
        best = v;
      }
    }
    return best;
  };

  return {
    get views() { return views; },
    nearest,
    refresh,
    workSpots: (townId) => views.filter((v) => v.node.townId === townId).map((v) => ({ x: v.pos.x + 14, y: v.pos.y + 4 })),
    outskirtSpots(townId) {
      const t = settlements.find((s) => s.id === townId);
      if (!t) return [];
      // Positions only: collapse the wild probability here without making sprites.
      return wildNodesIn(seed, settlements, t.q - 34, t.r - 34, t.q + 34, t.r + 34).filter((n) => {
        const d = Math.hypot(n.q - t.q, n.r - t.r);
        return d > 12 && d < 34;
      }).map((n) => { const f = tileFootWorld(n.q, n.r); return { x: f.x + 14, y: f.y + 4 }; });
    },
    gather(v) {
      const st = getState();
      if (!st) return null;
      const line = gatherNode(st, v.node);
      if (line) scene.tweens.add({ targets: v.sprite, scaleX: 2.2, scaleY: 1.8, duration: 90, yoyo: true, onComplete: refresh });
      return line;
    },
    update(player, time) {
      observe(player);
      const n = nearest(player);
      prompt.setVisible(!!n);
      if (n) prompt.setPosition(n.pos.x, n.pos.y - n.sprite.displayHeight - 2 - Math.abs(Math.sin(time / 300)) * 2);
    },
  };
}
