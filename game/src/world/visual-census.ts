/**
 * Counts for what the world already draws of the sim (dev/visual-counts), all on or near the camera: graves,
 * plots under construction (stakes, timber, rising frame), sites showing their staffing, and towns whose palette has
 * gone grey with despair or warm with hope. Read once a second from the layers' own lists; draws nothing.
 */
import type Phaser from 'phaser';
import { countVisual } from '../dev/visual-counts';
import { tileFoot } from './depth';
import type { WorldThings } from './things';
import type { PlotData } from './things/plots';
import type { TownTone } from './light-fx';

export function censusWorld(cam: Phaser.Cameras.Scene2D.Camera, things: WorldThings, tones: TownTone[]): void {
  const v = cam.worldView;
  const inView = (x: number, y: number, pad = 64) => x > v.x - pad && x < v.right + pad && y > v.y - pad && y < v.bottom + pad;
  countVisual('graves', things.graves.list().filter((g) => inView(g.x, g.y)).length);
  // Plots and sites count only what is on screen, like every other counter (not the whole district).
  // The plot layer's Things carry each plot's front (where it is drawn), so ask it around the view.
  const cx = v.x + v.width / 2, cy = v.y + v.height / 2;
  const plots = things.plots.things({ x: cx, y: cy }, Math.hypot(v.width, v.height) / 2 + 64)
    .filter((t) => inView(t.x, t.y))
    .map((t) => t.target?.data as PlotData | undefined)
    .filter((d): d is PlotData => !!d);
  countVisual('scaffolds', plots.filter((p) => p.status === 'claimed').length);
  // A facility stands on its tile's foot (things/facilities), so that is where it is on screen.
  const inFoot = (q: number, r: number): boolean => { const f = tileFoot(q, r); return inView(f.x, f.y); };
  const sites = things.facilities.list().filter((f) => (f.staffed > 0 || f.idle) && inFoot(f.q, f.r));
  countVisual('siteMarks', plots.filter((p) => p.site).length + sites.length);
  const near = tones.filter((t) => inView(t.x, t.y, 600));
  countVisual('gloom', near.filter((t) => t.despair >= 0.3).length);
  countVisual('warmth', near.filter((t) => t.warm >= 0.1).length);
}
