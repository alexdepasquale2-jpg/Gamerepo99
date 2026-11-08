/**
 * Field rows that grow with the days. Chunk props are mounted once (world/props.ts), so each field image
 * registers here and the world's update re-dresses them when the sim day turns: a field sown last week is
 * green now, ripe next week, then cut to stubble (data/economy/crops.json stages).
 */
import type Phaser from 'phaser';
import { cropStage, fieldCrop } from '../sim/goods/crops';
import { cropTex } from './art/crop-art';
import { noteUse } from '../sim/data-use-world';

const FIELDS = new Set<{ img: Phaser.GameObjects.Image; crop: string; q: number; r: number }>();
let day = 0;

/** Today's texture for the field prop at (q, r) with this state (its crop, when a farm sowed it). */
export function fieldTex(state: string | undefined, q: number, r: number): string {
  const crop = fieldCrop(state, q, r);
  return cropTex(crop.id, cropStage(crop, day).id);
}

/** A field image just mounted: keep it in step with the days until its chunk streams out. */
export function trackField(img: Phaser.GameObjects.Image, state: string | undefined, q: number, r: number): void {
  const f = { img, crop: fieldCrop(state, q, r).id, q, r };
  FIELDS.add(f);
  noteUse('crops.drawn', f.crop); noteUse('art', `crop.${f.crop}`);
  img.once('destroy', () => FIELDS.delete(f));
}

/** Call each frame with the sim day; only a new day re-textures anything. */
export function restageFields(today: number | undefined): void {
  if (today === undefined || today === day) return;
  day = today;
  for (const f of FIELDS) f.img.setTexture(fieldTex(f.crop, f.q, f.r));
}
