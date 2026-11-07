/** Stash chests: one small chest per stash site that holds coin or goods; click withdraws via the existing stash act. */

import Phaser from 'phaser';
import { applyStashAct, ensureHoard } from '../../sim/hoard';
import { siteDefs, totalGoods } from '../../sim/hoard/state';
import type { SimState } from '../../sim/types/runtime';
import { tileFootWorld } from '../depth-sort';
import { ensureGoodsTextures, texKey } from './node-textures';

export type StashChest = { siteId: string; townId: string; q: number; r: number };

/** Chest descriptors for sites currently holding anything. Pure. */
export function stashChests(
  state: SimState,
  sites: { id: string; townId: string }[],
  towns: { id: string; q: number; r: number }[],
): StashChest[] {
  const stash = ensureHoard(state).stash;
  const out: StashChest[] = [];
  for (const d of sites) {
    const s = stash[d.id], t = towns.find((x) => x.id === d.townId);
    if (!s || !t || s.coin + totalGoods(s) <= 0) continue;
    out.push({ siteId: d.id, townId: d.townId, q: t.q, r: t.r });
  }
  return out;
}

export function createStashChests(
  scene: Phaser.Scene,
  getState: () => SimState | undefined,
  towns: { id: string; q: number; r: number }[],
  onChange: () => void,
): { refresh: () => void; views: Map<string, Phaser.GameObjects.Image> } {
  ensureGoodsTextures(scene);
  const views = new Map<string, Phaser.GameObjects.Image>();
  const refresh = (): void => {
    const st = getState();
    if (!st) return;
    const live = stashChests(st, siteDefs(st), towns);
    for (const [id, img] of views) if (!live.some((c) => c.siteId === id)) { img.destroy(); views.delete(id); }
    for (const c of live) {
      if (views.has(c.siteId)) continue;
      const f = tileFootWorld(c.q, c.r);
      const img = scene.add.image(f.x - 30, f.y + 6, texKey('chest')).setOrigin(0.5, 1).setScale(2).setDepth(f.y + 6)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => {
        const s = getState();
        if (s && applyStashAct(s, 'stash_withdraw')) { onChange(); refresh(); }
      });
      views.set(c.siteId, img);
    }
  };
  refresh();
  return { refresh, views };
}
