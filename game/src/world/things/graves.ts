/**
 * Graves (state.legacy.graves: past inhabitants, villagers who died in play, and graves a world file carried
 * in): a headstone each in a small yard beside their town. Each stone is a `grave:<personId>#<day>` Thing,
 * so it can be focused and acted on (sim/contrib/graves: Visit, Lay a keepsake).
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { GraveData } from '../../sim/contrib/target-data';
import type { SimState } from '../../sim/types/runtime';
import { ART_SCALE } from '../art/px';
import { thingTex } from '../art/thing-art';
import type { Pt } from '../depth';
import { firstNameOf } from '../../sim/names';

const GRAVE_REACH = 40;

export type GravesLayer = {
  refresh(): void;
  things(near: Pt, radius: number): Thing[];
  list(): { personId: string; name: string; townId: string; x: number; y: number }[];
  setVisible(on: boolean): void;
  destroy(): void;
};

type View = { id: string; personId: string; name: string; townId: string; p: Pt; img: Phaser.GameObjects.Image };

export function createGraves(scene: Phaser.Scene, getState: () => SimState | undefined, graveAt: (townId: string, n: number) => Pt | undefined): GravesLayer {
  let views: View[] = [];
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
        // Same id as sim/contrib/graves graveId().
        return [{ id: `${g.personId}#${g.day}`, personId: g.personId, name: g.name, townId, p, img }];
      });
    },
    things(near, radius) {
      if (!visible) return [];
      return views
        .filter((v) => Math.hypot(v.p.x - near.x, v.p.y - near.y) <= radius)
        .map((v): Thing => {
          const data: GraveData = { grave: true, personId: v.personId, name: v.name, townId: v.townId };
          const first = firstNameOf(v.name) ?? v.name;
          return { key: `grave:${v.id}`, kind: 'grave', id: v.id, x: v.p.x, y: v.p.y, reach: GRAVE_REACH, label: `${first}'s grave`, target: { kind: 'grave', id: v.id, data } };
        });
    },
    list: () => views.map((v) => ({ personId: v.personId, name: v.name, townId: v.townId, x: v.p.x, y: v.p.y })),
    setVisible(on) { visible = on; views.forEach((v) => v.img.setVisible(on)); },
    destroy() { views.forEach((v) => v.img.destroy()); views = []; sig = ''; },
  };
}
