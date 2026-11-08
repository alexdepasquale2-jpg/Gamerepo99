/**
 * A site's staffing, drawn where it stands (civic slice 5), so you can read a town by walking it:
 *   working   a warm window and chimney smoke
 *   idle      the building dims, no smoke
 *   wanted    a small notice nailed to a post by the door ("wanted: manager")
 *   pips      one dot per hand at work, hollow for the room left
 * Shared by the plot and facility layers. Reads the site registry only; draws nothing for a plot that is not a site.
 */
import type Phaser from 'phaser';
import { siteById, siteIdForFacility, siteIdForPlan, type Site } from '../../sim/civic/sites';
import { isWanted } from '../../sim/civic/site-actions';
import { BUILDING_BY_ID, PLAYER_OWNER } from '../../sim/economy/build-plans';
import type { SimState } from '../../sim/types/runtime';
import { PUFF_TEX } from '../assets';

export type SiteLook = { id: string; status: Site['status']; wanted: boolean; hands: number; room: number; yours: boolean };

const MAX_PIPS = 6;

function lookOf(site: Site | undefined): SiteLook | undefined {
  if (!site || site.status === 'closed') return undefined;
  const slots = BUILDING_BY_ID.get(site.building)?.slots ?? 0;
  // At another's site the manager takes one of the slots; a crew counts its foreman among the hands.
  const room = site.crewRun ? 1 + site.workers.length : site.ownerId === PLAYER_OWNER ? slots : Math.max(0, slots - 1);
  const hands = site.crewRun ? (site.managerId ? 1 : 0) + site.workers.length : site.workers.length;
  return { id: site.id, status: site.status, wanted: isWanted(site) || (!!site.crewRun && !site.managerId), hands, room: Math.max(room, hands), yours: site.managerId === PLAYER_OWNER };
}

export const plotSiteLook = (s: SimState, planId: string): SiteLook | undefined => lookOf(siteById(s, siteIdForPlan(planId)));
export const facilitySiteLook = (s: SimState, facilityId: string): SiteLook | undefined => lookOf(siteById(s, siteIdForFacility(facilityId)));
export const lookSig = (l: SiteLook | undefined): string => (l ? `${l.status}:${l.wanted}:${l.hands}/${l.room}:${l.yours}` : '-');

/** Notice and pips beside a door at (x, y) (the ground line). Returns the objects drawn. */
export function drawSiteMarks(scene: Phaser.Scene, look: SiteLook, x: number, y: number): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics().setDepth(y + 1);
  if (look.wanted) {
    // A post with a pale sheet nailed to it; the dark strokes read as writing at a glance.
    g.fillStyle(0x5a3a24, 1).fillRect(x + 22, y - 26, 3, 26);
    g.fillStyle(0xe8e0c8, 1).fillRect(x + 15, y - 30, 17, 13);
    g.fillStyle(0x7a2e2e, 1).fillRect(x + 17, y - 28, 13, 2);
    g.fillStyle(0x3a3028, 1).fillRect(x + 17, y - 24, 10, 1).fillRect(x + 17, y - 21, 12, 1);
  }
  const n = Math.min(MAX_PIPS, look.room);
  for (let i = 0; i < n; i++) {
    const px = x - (n - 1) * 4 + i * 8, py = y + 6;
    if (i < look.hands) g.fillStyle(look.yours ? 0xf2b84b : 0xf0d878, 1).fillCircle(px, py, 2.5);
    else g.lineStyle(1, 0x7a7060, 1).strokeCircle(px, py, 2.5);
  }
  return [g];
}

/** A working building: a warm window and chimney smoke above an image standing on its base (origin 0.5, 1). */
export function drawWorking(scene: Phaser.Scene, img: Phaser.GameObjects.Image): Phaser.GameObjects.GameObject[] {
  const w = img.displayWidth, h = img.displayHeight;
  const glow = scene.add.graphics().setDepth(img.depth + 0.2).setBlendMode('ADD');
  glow.fillStyle(0xf0d878, 0.55).fillRect(img.x - w * 0.18, img.y - h * 0.38, 7, 6);
  const smoke = scene.add.particles(img.x + w * 0.22, img.y - h * 0.92, PUFF_TEX, {
    speedY: { min: -14, max: -8 }, speedX: { min: 2, max: 7 }, lifespan: 2800, scale: { start: 0.4, end: 1.3 },
    tint: 0xb8b0a8, alpha: { start: 0.3, end: 0 }, frequency: 600,
  }).setDepth(img.depth + 1);
  return [glow, smoke];
}
