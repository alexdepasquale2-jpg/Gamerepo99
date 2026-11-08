/**
 * A chunk's standing props (trees, bushes, fences, camps, critters...) as foot-sorted images. Each one
 * is a scene child (not in a container) so it sorts against people by foot y. Returned so the chunk can
 * destroy them when it streams out.
 */
import type Phaser from 'phaser';
import type { FacilityRenderView } from '../sim/map/types';
import { TILE_PX } from '../sim/map/constants';
import { ART_SCALE, ihash } from './art/px';
import { FLAME_TEX, propTex } from './art/prop-art';
import { tileFoot } from './depth';
import { fieldTex, trackField } from './crop-fields';
import { noteUse } from '../sim/data-use-world';

/** Where a prop stands in the world (px): its tile foot plus the same sub-tile jitter it is drawn with. */
export function propFoot(prop: FacilityRenderView): { x: number; y: number } {
  const q = prop.position.x, r = prop.position.y;
  const f = tileFoot(q, r);
  if (prop.type.startsWith('fence')) return f;
  return { x: f.x + Math.round((ihash(q, r, 7) - 0.5) * TILE_PX * 0.5), y: f.y + Math.round((ihash(q, r, 9) - 0.5) * 6) };
}

export function mountProps(scene: Phaser.Scene, props: FacilityRenderView[]): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [];
  for (const prop of props) {
    const q = prop.position.x, r = prop.position.y;
    const f = tileFoot(q, r);
    // Sub-tile jitter so rows of props do not read as a grid.
    const jx = Math.round((ihash(q, r, 7) - 0.5) * TILE_PX * 0.5), jy = Math.round((ihash(q, r, 9) - 0.5) * 6);
    const x = f.x + jx, y = f.y + jy;
    // A field row shows its crop at today's stage (world/crop-fields.ts); every other prop has one look.
    const key = prop.type === 'field' ? fieldTex(prop.state, q, r) : propTex(prop.type, prop.state);
    if (!key) continue;
    noteUse('props.drawn', prop.type === 'critter' ? `critter.${prop.state}` : prop.type);
    // Fences stay on the tile grid so runs join up.
    const fx = prop.type.startsWith('fence') ? f.x : x, fy = prop.type.startsWith('fence') ? f.y : y;
    const img = scene.add.image(fx, fy, key).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(fy);
    if (prop.type !== 'fence_h' && prop.type !== 'fence_v' && ihash(q, r, 5) < 0.5) img.setFlipX(true);
    out.push(img);
    if (prop.type === 'field') trackField(img, prop.state, q, r);
    if (prop.type === 'campfire') out.push(flame(scene, fx, fy - 4, q + r));
    else if (prop.type === 'critter') wander(scene, img, prop.state === 'bird', q * 31 + r * 17);
  }
  return out;
}

/** A flickering flame (campfire). */
function flame(scene: Phaser.Scene, x: number, y: number, seed: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, FLAME_TEX).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(y + 4.1);
  const tw = scene.tweens.add({ targets: img, scaleY: ART_SCALE * 1.3, alpha: 0.8, duration: 170 + (seed % 5) * 30, yoyo: true, repeat: -1 });
  img.once('destroy', () => tw.remove());
  return img;
}

/** Critters drift to a nearby point and back, pausing, until their chunk streams out. */
function wander(scene: Phaser.Scene, img: Phaser.GameObjects.Image, fly: boolean, seedish: number): void {
  const s = Math.abs(seedish) % 97, x = img.x, y = img.y;
  const tw = scene.tweens.add({
    targets: img, x: x + ((s % 7) - 3) * (fly ? 18 : 10), y: y + ((s % 5) - 2) * (fly ? 14 : 8),
    duration: (fly ? 900 : 2200) + s * 20, delay: s * 40, hold: 600 + s * 15, repeatDelay: 800,
    yoyo: true, repeat: -1, ease: 'Sine.easeInOut', onUpdate: () => img.setDepth(img.y),
  });
  img.once('destroy', () => tw.remove());
}
