/**
 * Facilities on the roads (sim/economy/facilities): the mill, wood camp, mine or waystation beside its
 * road, with one crew figure per staffed role at work beside it. A facility nobody staffs stands grey and
 * empty. Things carry `{ nameOf }` as target data (workShift names the towns it feeds).
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { facilityPlaces, rolesFor, type FacilityPlace } from '../../sim/economy/facilities';
import { ART_SCALE } from '../art/px';
import { thingTex } from '../art/thing-art';
import { tileFoot, type Pt } from '../depth';

const REACH = 64;
const KNOWN = new Set(['mill', 'lumber_camp', 'mine', 'waystation']);
type View = { place: FacilityPlace; pos: Pt; img: Phaser.GameObjects.Image; crew: Phaser.GameObjects.Image[]; sig: string };

export type FacilitiesLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  update(time: number): void;
  list(): { id: string; name: string; kind: string; q: number; r: number; staffed: number; idle: boolean }[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createFacilitiesLayer(scene: Phaser.Scene, getState: () => SimState | undefined, nameOf: (townId: string) => string): FacilitiesLayer {
  let views: View[] = [];
  let visible = true;
  let placesSig = '';
  const staffOf = (id: string) => getState()?.facilityStaff?.[id];

  const build = (): void => {
    for (const v of views) { v.img.destroy(); v.crew.forEach((c) => c.destroy()); }
    views = facilityPlaces(getState()).map((place) => {
      const pos = tileFoot(place.q, place.r);
      const img = scene.add.image(pos.x, pos.y, thingTex(KNOWN.has(place.kind) ? place.kind : 'waystation'))
        .setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(pos.y).setVisible(visible);
      const crew = Array.from({ length: Math.min(3, rolesFor(place.kind)) }, (_, i) => {
        const x = pos.x + 40 + i * 14, y = pos.y + 4 + (i % 2) * 6;
        return scene.add.image(x, y, thingTex(i === 0 ? 'crew-tool' : 'crew')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(y).setVisible(false);
      });
      return { place, pos, img, crew, sig: '' };
    });
  };

  const refresh = (): void => {
    const sig = facilityPlaces(getState()).map((p) => p.id).join('|');
    if (sig !== placesSig) { placesSig = sig; build(); }
    for (const v of views) {
      const s = staffOf(v.place.id);
      const idle = s?.idle ?? false, staffed = idle ? 0 : Math.min(v.crew.length, s?.staffed ?? v.crew.length);
      const next = `${idle}:${staffed}`;
      if (next === v.sig) continue;
      v.sig = next;
      if (idle) v.img.setTint(0x8a8a8a); else v.img.clearTint();
      v.crew.forEach((c, i) => c.setVisible(visible && i < staffed).setData('on', i < staffed));
    }
  };

  return {
    things(near, radius) {
      return views.filter((v) => Math.hypot(v.pos.x - near.x, v.pos.y - near.y) <= radius).map((v) => ({
        key: `facility:${v.place.id}`, kind: 'facility' as const, id: v.place.id, x: v.pos.x, y: v.pos.y, reach: REACH,
        label: v.place.name, target: { kind: 'facility' as const, id: v.place.id, data: { nameOf } },
      }));
    },
    refresh,
    update(time) {
      // Crew at work: a small rhythmic bob, each a beat apart.
      for (const v of views) v.crew.forEach((c, i) => { if (c.visible) c.setScale(ART_SCALE, ART_SCALE * (1 + Math.max(0, Math.sin(time / 260 + i * 2)) * 0.06)); });
    },
    list: () => views.map((v) => {
      const s = staffOf(v.place.id);
      return { id: v.place.id, name: v.place.name, kind: v.place.kind, q: v.place.q, r: v.place.r, staffed: s?.staffed ?? 0, idle: s?.idle ?? false };
    }),
    setVisible(on) {
      visible = on;
      for (const v of views) { v.img.setVisible(on); v.crew.forEach((c) => c.setVisible(on && c.getData('on') === true)); }
    },
    destroy() { for (const v of views) { v.img.destroy(); v.crew.forEach((c) => c.destroy()); } views = []; },
  };
}
