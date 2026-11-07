/** Resource nodes in the overworld: sprites, depletion look, nearest-node prompt, gather pop. */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { gatherNode, nodeCharges, placeNodes, type WorldNode } from '../../sim/goods/nodes';
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
  const nodes = placeNodes(seed, settlements, routes);
  const views: NodeView[] = nodes.map((node) => {
    const f = tileFootWorld(node.q, node.r);
    const sprite = scene.add.image(f.x, f.y, texKey(node.kindId)).setOrigin(0.5, 1).setScale(2).setDepth(f.y);
    return { node, sprite, pos: { x: f.x, y: f.y } };
  });
  const prompt = scene.add
    .text(0, 0, 'E  gather', { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
    .setOrigin(0.5, 1).setDepth(998_400).setVisible(false);

  const refresh = (): void => {
    const st = getState();
    if (!st) return;
    for (const v of views) {
      const empty = nodeCharges(st, v.node) <= 0;
      const tex = empty ? (v.node.kindId === 'tree' ? 'tree_stump' : 'depleted') : v.node.kindId;
      if (v.sprite.texture.key !== texKey(tex)) v.sprite.setTexture(texKey(tex));
    }
  };
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
    views,
    nearest,
    refresh,
    workSpots: (townId) => views.filter((v) => v.node.townId === townId).map((v) => ({ x: v.pos.x + 14, y: v.pos.y + 4 })),
    outskirtSpots(townId) {
      const t = settlements.find((s) => s.id === townId);
      if (!t) return [];
      return views.filter((v) => {
        const d = Math.hypot(v.node.q - t.q, v.node.r - t.r);
        return !v.node.townId && d > 12 && d < 34;
      }).map((v) => ({ x: v.pos.x + 14, y: v.pos.y + 4 }));
    },
    gather(v) {
      const st = getState();
      if (!st) return null;
      const line = gatherNode(st, v.node);
      if (line) scene.tweens.add({ targets: v.sprite, scaleX: 2.2, scaleY: 1.8, duration: 90, yoyo: true, onComplete: refresh });
      return line;
    },
    update(player, time) {
      const n = nearest(player);
      prompt.setVisible(!!n);
      if (n) prompt.setPosition(n.pos.x, n.pos.y - n.sprite.displayHeight - 2 - Math.abs(Math.sin(time / 300)) * 2);
    },
  };
}
