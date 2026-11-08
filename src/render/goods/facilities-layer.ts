/**
 * Facilities on the roads: a painted mill / wood camp / quarry / waystation beside its road, its name
 * on a sign, a crew figure while anyone works there (greyed when it stands idle), and an
 * Work-a-shift verb in its ring (sim/contrib/objects). Presentation only; the shift is sim/economy/facilities.
 */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { facilityPlaces, type FacilityPlace } from '../../sim/economy/facilities';
import { tileFootWorld } from '../depth-sort';
import { facilityAssetKey, type FacilityRenderView } from '../world-view';

type Pt = { x: number; y: number };
type Painter = (g: Phaser.GameObjects.Graphics) => void;
/** Stand within this many px of a facility's foot to work it. */
const NEAR = 64;
const LABEL_RANGE = 520;
const font = { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3, align: 'center' };

/** Painted structures (source px, drawn at x2), keyed like the asset manifest's facility.<kind>.<state>. */
const PAINT: Record<string, [number, number, Painter]> = {
  mill: [36, 40, (g) => {
    g.fillStyle(0x8a8274).fillRect(9, 18, 18, 22);
    g.fillStyle(0xb0a894).fillRect(10, 19, 7, 20);
    g.fillStyle(0x7a3a28).fillTriangle(7, 19, 29, 19, 18, 9);
    g.fillStyle(0x3a2a1c).fillRect(15, 31, 6, 9);
    g.fillStyle(0xf2d28a).fillRect(22, 24, 3, 3);
    // Sails: a cross of slatted blades on a hub.
    g.lineStyle(3, 0x5a3e26).lineBetween(4, 3, 32, 25).lineBetween(32, 3, 4, 25);
    g.fillStyle(0xe8dcc0).fillRect(5, 4, 6, 3).fillRect(25, 4, 6, 3).fillRect(5, 21, 6, 3).fillRect(25, 21, 6, 3);
    g.fillStyle(0x3a2a1c).fillCircle(18, 14, 2);
  }],
  lumber_camp: [36, 28, (g) => {
    g.fillStyle(0x6a4a2a).fillTriangle(2, 26, 18, 6, 20, 26);
    g.fillStyle(0x8b5a2b).fillTriangle(6, 26, 18, 10, 18, 26);
    g.fillStyle(0x5a3a24).fillRect(18, 6, 2, 20);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
      const x = 22 + j * 4 + i * 2, y = 23 - i * 4;
      g.fillStyle(0x7a5232).fillCircle(x, y, 2.2);
      g.fillStyle(0xd9b07a).fillCircle(x, y, 1.1);
    }
    g.fillStyle(0x8a8a90).fillRect(28, 8, 1, 8);
    g.fillStyle(0xc8c8d0).fillTriangle(26, 8, 31, 8, 28, 5);
  }],
  mine: [36, 30, (g) => {
    g.fillStyle(0x6a6a72).fillTriangle(0, 30, 16, 2, 36, 30);
    g.fillStyle(0x8a8a92).fillTriangle(6, 30, 16, 8, 24, 30);
    g.fillStyle(0x1b1612).fillRect(12, 18, 9, 12);
    g.fillStyle(0x6a4a2a).fillRect(11, 16, 11, 2).fillRect(11, 16, 2, 14).fillRect(20, 16, 2, 14);
    g.fillStyle(0x4a3a2c).fillRect(24, 25, 9, 4);
    g.fillStyle(0xc88a4a).fillRect(25, 23, 3, 2).fillRect(29, 23, 3, 2);
    g.fillStyle(0x2a1a10).fillCircle(26, 29, 1.5).fillCircle(31, 29, 1.5);
  }],
  waystation: [36, 34, (g) => {
    g.fillStyle(0xc4a574).fillRect(5, 14, 22, 20);
    g.fillStyle(0x8a3a2a).fillTriangle(2, 15, 30, 15, 16, 4);
    g.fillStyle(0x3a2a1c).fillRect(13, 24, 6, 10);
    g.fillStyle(0xf2d28a).fillRect(8, 19, 3, 3).fillRect(21, 19, 3, 3);
    g.fillStyle(0x6a4a2a).fillRect(30, 20, 1, 14).fillRect(28, 22, 8, 1);
    g.fillStyle(0xf2b84b).fillRect(32, 23, 1, 3);
  }],
  crew: [8, 14, (g) => {
    g.fillStyle(0x3a2a1c).fillRect(2, 10, 1, 4).fillRect(5, 10, 1, 4);
    g.fillStyle(0x7a5a3a).fillRect(1, 5, 6, 6);
    g.fillStyle(0xe0b890).fillRect(2, 1, 4, 4);
  }],
};
const tex = (kind: string): string => `hf-fac-${PAINT[kind] ? kind : 'waystation'}`;

function ensureTextures(scene: Phaser.Scene): void {
  for (const [id, [w, h, paint]] of Object.entries(PAINT)) {
    const key = `hf-fac-${id}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    paint(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}

type View = { place: FacilityPlace; pos: Pt; sprite: Phaser.GameObjects.Image; crew: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text };
export type FacilityMarker = { x: number; y: number; kind: string; name: string; idle: boolean };

export type FacilitiesLayer = {
  /** Facility you are standing at, if any. */
  nearest: (p: Pt) => FacilityPlace | null;
  /** Each facility (foot and sprite top, world px) for the focus resolver. */
  spots: () => { id: string; x: number; y: number; top: number; reach: number }[];
  /** After a shift: the structure bobs (when it went ahead) and the crew/idle look is redrawn. */
  worked: (id: string, ok: boolean) => void;
  refresh: () => void;
  update: (player: Pt, time: number) => void;
  /** World-px markers for the map. */
  markers: () => FacilityMarker[];
  /** Render views (FacilityRenderView contract) for tests/dev. */
  views: () => (FacilityRenderView & { name: string; q: number; r: number; assetKey: string })[];
};

export function createFacilitiesLayer(
  scene: Phaser.Scene, getState: () => SimState | undefined, _nameOf: (townId: string) => string,
): FacilitiesLayer {
  ensureTextures(scene);
  const views: View[] = facilityPlaces(getState()).map((place) => {
    const pos = tileFootWorld(place.q, place.r);
    const sprite = scene.add.image(pos.x, pos.y, tex(place.kind)).setOrigin(0.5, 1).setScale(2).setDepth(pos.y).setName(`facility:${place.id}`);
    const crew = scene.add.image(pos.x + 44, pos.y, tex('crew')).setOrigin(0.5, 1).setScale(2).setDepth(pos.y + 1);
    const label = scene.add.text(pos.x, pos.y + 4, place.name, font).setOrigin(0.5, 0).setDepth(pos.y + 2);
    return { place, pos, sprite, crew, label };
  });

  const idleOf = (id: string): boolean => getState()?.facilityStaff?.[id]?.idle ?? false;
  const refresh = (): void => {
    for (const v of views) {
      const idle = idleOf(v.place.id);
      if (idle) v.sprite.setTint(0x8a8a8a); else v.sprite.clearTint();
      v.crew.setVisible(!idle);
      v.label.setText(`${v.place.name}${idle ? '\n(standing idle)' : ''}`);
    }
  };
  refresh();

  const nearestView = (p: Pt): View | null => {
    let best: View | null = null, bd = NEAR;
    for (const v of views) {
      const d = Math.hypot(p.x - v.pos.x, p.y - v.pos.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };

  return {
    nearest: (p) => nearestView(p)?.place ?? null,
    spots: () => views.map((v) => ({ id: v.place.id, x: v.pos.x, y: v.pos.y, top: v.pos.y - v.sprite.displayHeight - 4, reach: NEAR })),
    worked(id, ok) {
      const v = views.find((x) => x.place.id === id);
      if (v && ok) scene.tweens.add({ targets: v.sprite, scaleX: 2.12, scaleY: 1.9, duration: 110, yoyo: true });
      refresh();
    },
    refresh,
    update(player) {
      for (const w of views) w.label.setVisible(Math.hypot(player.x - w.pos.x, player.y - w.pos.y) < LABEL_RANGE);
    },
    markers: () => views.map((v) => ({ x: v.pos.x, y: v.pos.y, kind: v.place.kind, name: v.place.name, idle: idleOf(v.place.id) })),
    views: () => views.map((v) => {
      const state = idleOf(v.place.id) ? 'idle' : 'working';
      return {
        id: v.place.id, type: v.place.kind, state, warmth: state === 'working' ? 1 : 0, position: { x: v.place.q, y: v.place.r },
        name: v.place.name, q: v.place.q, r: v.place.r, assetKey: facilityAssetKey(v.place.kind, state),
      };
    }),
  };
}
