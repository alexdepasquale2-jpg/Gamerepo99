/**
 * Graves (state.legacy.graves: past inhabitants, and graves a world file carried in): a headstone each in
 * a small yard beside their town. Drawn only: the sim has no 'grave' target kind yet, so they are not Things.
 */
import type Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { ART_SCALE } from '../art/px';
import { thingTex } from '../art/thing-art';
import type { Pt } from '../depth';

export type GravesLayer = {
  refresh(): void;
  list(): { personId: string; name: string; townId: string; x: number; y: number }[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createGraves(scene: Phaser.Scene, getState: () => SimState | undefined, graveAt: (townId: string, n: number) => Pt | undefined): GravesLayer {
  let views: { personId: string; name: string; townId: string; p: Pt; img: Phaser.GameObjects.Image }[] = [];
  let sig = '';
  let visible = true;
  return {
    refresh() {
      const graves = getState()?.legacy?.graves ?? [];
      const next = graves.map((g) => `${g.personId}@${g.day}`).join('|');
      if (next === sig) return;
      sig = next;
      views.forEach((v) => v.img.destroy());
      const perTown = new Map<string, number>();
      views = graves.flatMap((g) => {
        const townId = g.townId ?? '';
        const n = perTown.get(townId) ?? 0;
        perTown.set(townId, n + 1);
        const p = graveAt(townId, n);
        if (!p) return [];
        const img = scene.add.image(p.x, p.y, thingTex('grave')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(p.y).setVisible(visible);
        return [{ personId: g.personId, name: g.name, townId, p, img }];
      });
    },
    list: () => views.map((v) => ({ personId: v.personId, name: v.name, townId: v.townId, x: v.p.x, y: v.p.y })),
    setVisible(on) { visible = on; views.forEach((v) => v.img.setVisible(on)); },
    destroy() { views.forEach((v) => v.img.destroy()); views = []; sig = ''; },
  };
}
