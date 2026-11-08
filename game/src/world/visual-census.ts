/**
 * Counts for what the world already draws of the sim (dev/visual-counts): graves in view, plots under
 * construction (stakes, timber, rising frame), sites showing their staffing, and towns whose palette has
 * gone grey with despair or warm with hope. Read once a second from the layers' own lists; draws nothing.
 */
import type Phaser from 'phaser';
import { countVisual } from '../dev/visual-counts';
import type { WorldThings } from './things';
import type { TownTone } from './light-fx';

export function censusWorld(cam: Phaser.Cameras.Scene2D.Camera, things: WorldThings, tones: TownTone[]): void {
  const v = cam.worldView;
  const inView = (x: number, y: number, pad = 64) => x > v.x - pad && x < v.right + pad && y > v.y - pad && y < v.bottom + pad;
  countVisual('graves', things.graves.list().filter((g) => inView(g.x, g.y)).length);
  const plots = things.plots.list();
  countVisual('scaffolds', plots.filter((p) => p.status === 'claimed').length);
  countVisual('siteMarks', plots.filter((p) => p.site).length + things.facilities.list().filter((f) => f.staffed > 0 || f.idle).length);
  const near = tones.filter((t) => inView(t.x, t.y, 600));
  countVisual('gloom', near.filter((t) => t.despair >= 0.3).length);
  countVisual('warmth', near.filter((t) => t.warm >= 0.1).length);
}
