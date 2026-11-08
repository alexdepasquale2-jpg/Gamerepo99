/**
 * Things set down on the ground (state.groundItems, world px): a small bundle tinted the item's colour.
 * Things: `ground-item:<id>` (the provider finds the item by id).
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { ITEM_BY_ID } from '../../sim/goods/inventory';
import { ART_SCALE, hexNum } from '../art/px';
import { thingTex } from '../art/thing-art';
import type { Pt } from '../depth';

const REACH = 40;
type Ground = NonNullable<SimState['groundItems']>[number];

export type GroundLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createGroundItems(scene: Phaser.Scene, getState: () => SimState | undefined): GroundLayer {
  const views = new Map<string, { g: Ground; img: Phaser.GameObjects.Image }>();
  let visible = true;
  const refresh = (): void => {
    const live = getState()?.groundItems ?? [];
    const ids = new Set(live.map((g) => g.id));
    for (const [id, v] of views) if (!ids.has(id)) { v.img.destroy(); views.delete(id); }
    for (const g of live) {
      if (views.has(g.id)) continue;
      const img = scene.add.image(g.x, g.y, thingTex('bundle')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(g.y).setVisible(visible)
        .setTint(hexNum(ITEM_BY_ID.get(g.itemId)?.color ?? '#f4e6c8'));
      scene.tweens.add({ targets: img, y: { from: g.y - 10, to: g.y }, duration: 220, ease: 'Bounce.easeOut' });
      views.set(g.id, { g, img });
    }
  };
  return {
    things(near, radius) {
      const out: Thing[] = [];
      for (const { g } of views.values()) {
        if (Math.hypot(g.x - near.x, g.y - near.y) > radius) continue;
        out.push({
          key: `ground-item:${g.id}`, kind: 'ground-item', id: g.id, x: g.x, y: g.y, reach: REACH,
          label: ITEM_BY_ID.get(g.itemId)?.name ?? g.itemId, target: { kind: 'ground-item', id: g.id },
        });
      }
      return out;
    },
    refresh,
    setVisible(on) { visible = on; for (const v of views.values()) v.img.setVisible(on); },
    destroy() { for (const v of views.values()) v.img.destroy(); views.clear(); },
  };
}
