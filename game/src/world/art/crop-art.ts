/**
 * A farm field row per crop and stage (data/economy/crops.json), code-drawn like the other props: the
 * tilled strip, then the crop as it stands today: bare drills with green tips (sown), short green stalks
 * (green), full heads in the crop's own colour (ripe), cut stubble and a sheaf (stubble). Shown at 2x.
 */
import type Phaser from 'phaser';
import { CROPS, CROPS_TABLE } from '../../sim/goods/crops';
import { makeTex, type Px } from './px';

const W = 16, H = 10;
const SOIL = '#7a5a34', SOIL_D = '#5e4426', SOIL_L = '#8e6c42';

/** Stalk, ripe head and highlight colours, and how the plant stands (grain heads, leafy roots, tall reeds, fine flax). */
const LOOK: Record<string, { stalk: string; head: string; hi: string; form: 'ear' | 'leaf' | 'reed' | 'fine' }> = {
  crop_wheat: { stalk: '#9a8a3a', head: '#e0c860', hi: '#f4e08a', form: 'ear' },
  crop_barley: { stalk: '#8a8a3e', head: '#c8b45a', hi: '#e2d07a', form: 'ear' },
  crop_root: { stalk: '#4a7a32', head: '#6a9a3a', hi: '#9ac05a', form: 'leaf' },
  crop_reed: { stalk: '#6a7a34', head: '#7a5232', hi: '#9a7044', form: 'reed' },
  crop_flax: { stalk: '#5a8a3a', head: '#8aa8e0', hi: '#b8cef4', form: 'fine' },
};
const GREEN = '#5a8a32', GREEN_L = '#7aac44';

export const cropTex = (cropId: string, stageId: string): string => `w-crop-${cropId}-${stageId}`;

function draw(p: Px, cropId: string, stage: string): void {
  const L = LOOK[cropId] ?? LOOK.crop_wheat!;
  p.rect(0, 5, W, 5, SOIL).rect(0, 5, W, 1, SOIL_L).rect(0, 9, W, 1, SOIL_D);
  for (let x = 1; x < W; x += 3) {
    if (stage === 'sown') { p.px(x, 6, SOIL_D).px(x + 1, 6, SOIL_D).rect(x, 4, 1, 2, GREEN_L); continue; }
    if (stage === 'stubble') { p.rect(x, 4, 1, 2, '#b8a058').px(x + 1, 5, '#a08a48'); continue; }
    // Green: a thick tuft of leaves, brighter than the grass round the field so the rows read at a glance.
    if (stage === 'green') { p.rect(x, 1, 1, 5, GREEN).rect(x + 1, 2, 1, 4, GREEN_L).px(x - 1 < 0 ? x : x - 1, 3, GREEN_L).px(x + 1, 1, '#9ad05a'); continue; }
    // ripe
    if (L.form === 'ear') p.rect(x, 1, 1, 5, L.stalk).rect(x, 0, 1, 2, L.head).px(x + 1, 1, L.hi).px(x + 1, 2, L.head);
    else if (L.form === 'leaf') p.disc(x + 0.5, 4, 1.8, 1.4, L.stalk).px(x, 3, L.hi).px(x + 1, 5, '#a8743e');
    else if (L.form === 'reed') p.rect(x, 0, 1, 6, L.stalk).rect(x, 0, 1, 2, L.head).px(x + 1, 3, L.hi);
    else p.rect(x, 1, 1, 5, L.stalk).px(x, 0, L.head).px(x + 1, 1, L.hi);
  }
  // A bound sheaf stands at the end of a cut row.
  if (stage === 'stubble') p.rect(12, 0, 3, 6, L.head).rect(12, 3, 3, 1, '#7a5a34').px(13, 0, L.hi);
}

export function paintCropTextures(scene: Phaser.Scene): void {
  for (const c of CROPS) for (const s of CROPS_TABLE.stages) makeTex(scene, cropTex(c.id, s.id), W, H, (p) => draw(p, c.id, s.id));
}
