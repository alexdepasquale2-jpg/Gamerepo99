/**
 * A letter from another district on its way (civic/district-relations: a relation's `courier`, sent on one
 * day and due on another): a rider walks in toward your town from the side of the realm the letter comes
 * from, nearer each day, and reaches the edge of town the day it lands (then the leader reads it out at
 * dawn, civic/district-letters). Only drawn while the player is in a town and the rider is in view.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt } from '../app/contracts';
import { districtName, liveId, otherOf, polityIfAny, refOf } from '../sim/civic/district-relations';
import { TILE_PX } from '../sim/map/constants';
import { countVisual } from '../dev/visual-counts';
import { ART_SCALE, ensureShadow, vehicleTexture } from './looks';
import type { NameLayer } from './name-layer';
import { safe } from './player';
import { footOf, inRect, viewRect } from './towns';

/** How far out the rider starts (tiles from the town's centre): the district's edge, as far as you can see. */
const FAR_TILES = 22;

type Rider = { key: string; label: string; at: Pt; dx: number; body: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image };
export type DistrictCourier = { update(timeSec: number, names: NameLayer): void; list(): { from: string; x: number; y: number; progress: number }[]; destroy(): void };

export function createDistrictCourier(ctx: GameContext): DistrictCourier {
  const scene = ctx.scene;
  const riders = new Map<string, Rider>();
  let rows: { key: string; from: string; at: Pt; dx: number; progress: number; label: string }[] = [];
  let last = -10;

  const plan = (): void => {
    const st = ctx.session.getState();
    rows = [];
    const town = st && ctx.layout.settlements.find((t) => t.id === st.player.townId);
    if (!st || !town || !polityIfAny(st)) return;
    const live = liveId(st), me = refOf(live);
    const centre = footOf(town.q, town.r);
    const phase = safe(() => ctx.world.phase(), 0.3);
    // Read the relations as stored (liveRelations would make missing ones: render never writes the sim).
    for (const r of Object.values(polityIfAny(st)!.relations)) {
      if (r.a !== live && r.b !== live) continue;
      const c = r.courier;
      if (!c || c.from === live) continue; // our own letters ride out of sight
      const from = otherOf(r, live), them = refOf(from);
      const len = Math.max(1, c.due - c.sent);
      const progress = Math.max(0, Math.min(1, (st.day - c.sent + phase) / len));
      const dir = { x: Math.sign(them.col - me.col), y: Math.sign(them.row - me.row) };
      const n = Math.hypot(dir.x, dir.y) || 1;
      const far = (1 - progress) * FAR_TILES * TILE_PX + TILE_PX * 4;
      rows.push({ key: `${r.a}|${r.b}`, from, at: { x: centre.x + (dir.x / n) * far, y: centre.y + (dir.y / n) * far * 0.8 }, dx: -dir.x || 1, progress, label: `A rider from ${districtName(st, from)}` });
    }
  };

  return {
    update(timeSec, names) {
      if (timeSec - last > 1) { last = timeSec; plan(); }
      const vr = viewRect(scene, 96), lr = viewRect(scene, 8);
      const indoors = !!safe(() => ctx.world.room(), null);
      const seen = new Set<string>();
      for (const row of rows) {
        if (indoors || !inRect(vr, row.at.x, row.at.y)) continue;
        seen.add(row.key);
        let r = riders.get(row.key);
        if (!r) {
          r = { key: row.key, label: row.label, at: { ...row.at }, dx: row.dx, shadow: scene.add.image(0, 0, ensureShadow(scene)).setScale(1.4, 1.2), body: scene.add.sprite(0, 0, vehicleTexture(scene, 'courier'), '0').setOrigin(0.5, 1).setScale(ART_SCALE) };
          riders.set(row.key, r);
        }
        // Ease toward where the day puts them, stepping as they go.
        const ox = r.at.x;
        r.at.x += (row.at.x - r.at.x) * 0.05;
        r.at.y += (row.at.y - r.at.y) * 0.05;
        const moving = Math.abs(r.at.x - ox) > 0.02;
        r.body.setPosition(r.at.x, r.at.y).setDepth(r.at.y).setFlipX(row.dx < 0).setFrame(moving ? String(Math.floor(timeSec * 5) % 2) : '0');
        r.shadow.setPosition(r.at.x, r.at.y - 1).setDepth(r.at.y - 0.5);
        if (inRect(lr, r.at.x, r.at.y)) names.put(`dc:${row.key}`, r.at.x, r.at.y - 36, { text: row.label, alpha: 0.85, muted: true });
      }
      for (const [k, r] of riders) if (!seen.has(k)) { r.body.destroy(); r.shadow.destroy(); riders.delete(k); }
      countVisual('districtCouriers', riders.size);
    },
    list: () => rows.map((r) => ({ from: r.from, x: Math.round(r.at.x), y: Math.round(r.at.y), progress: Math.round(r.progress * 100) / 100 })),
    destroy() { for (const r of riders.values()) { r.body.destroy(); r.shadow.destroy(); } riders.clear(); },
  };
}
