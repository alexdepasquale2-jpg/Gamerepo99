/** Land plots in the world: claimed plots are staked out with their builder's name and progress; finished buildings stand on theirs. */

import Phaser from 'phaser';
import { BUILDING_BY_ID, activePlans, type Claim } from '../../sim/economy/build-plans';
import { claimRect } from '../../sim/economy/borders';
import { townEconomyView } from '../../sim/economy/economy-view';
import type { SimState } from '../../sim/types/runtime';
import { TILE_PX } from '../../sim/map/constants';

type Pt = { x: number; y: number };
const font = { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3, align: 'center' };
/** Labels show only this close to the player so plots do not clutter the town. */
const LABEL_RANGE = 220;

export type PlotMarkers = { refresh: () => void; update: (player: Pt) => void; count: () => number };

export function createPlotMarkers(scene: Phaser.Scene, getState: () => SimState | undefined): PlotMarkers {
  const views = new Map<string, { g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; x: number; y: number }>();
  const first = (s: SimState, id: string): string => (s.people[id]?.name ?? id).split(' ')[0]!;

  const draw = (s: SimState, c: Claim, key: string): void => {
    const r = claimRect(s, c);
    if (!r) return;
    const x = r.q0 * TILE_PX, y = r.r0 * TILE_PX, w = (r.q1 - r.q0) * TILE_PX, h = (r.r1 - r.r0) * TILE_PX;
    const def = BUILDING_BY_ID.get(c.kind)!;
    const g = scene.add.graphics().setDepth(y + h);
    let text = `${first(s, c.ownerId)}'s ${def.name}`;
    if (c.status === 'built') {
      g.fillStyle(0x6a5a40, 0.45).fillRect(x + 4, y + 4, w - 8, h - 8);
      const bw = Math.min(w - 20, 56), bh = Math.min(h - 28, 34), bx = x + w / 2 - bw / 2, by = y + h - 10 - bh;
      g.fillStyle(0xd9c79a).fillRect(bx, by, bw, bh).lineStyle(2, 0x4a3a2c).strokeRect(bx, by, bw, bh);
      g.fillStyle(0xa8553a).fillTriangle(bx - 4, by, bx + bw + 4, by, bx + bw / 2, by - 16);
      g.fillStyle(0x4a3a2c).fillRect(bx + bw / 2 - 4, by + bh - 12, 8, 12);
    } else {
      g.lineStyle(2, 0xf2b84b, 0.8).strokeRect(x + 2, y + 2, w - 4, h - 4);
      for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) g.fillStyle(0x6a4a2a).fillRect(px - 2, py - 12, 4, 14);
      const v = townEconomyView(s, c.townId).plans.find((p) => p.id === c.planId);
      if (v) text += `\n${Math.round(v.progress * 100)}%${v.missing.length ? ` · needs ${v.missing[0]!.qty} ${v.missing[0]!.itemId}` : ' · building'}`;
    }
    const label = scene.add.text(x + w / 2, y - 6, text, font).setOrigin(0.5, 1).setDepth(y + h + 1).setVisible(false);
    views.set(key, { g, label, x: x + w / 2, y: y + h / 2 });
  };

  const refresh = (): void => {
    const s = getState();
    if (!s?.build) return;
    const live = new Map<string, Claim>();
    const plans = new Map(activePlans(s).map((p) => [p.claimId, p]));
    for (const c of s.build.claims) {
      const p = plans.get(c.id);
      // Progress changes the label, so a claim redraws when its plan's progress step changes.
      const v = p ? townEconomyView(s, c.townId).plans.find((x) => x.id === p.id) : undefined;
      live.set(`${c.id}:${c.status}:${v ? Math.round(v.progress * 20) : ''}`, c);
    }
    for (const [k, v] of views) if (!live.has(k)) { v.g.destroy(); v.label.destroy(); views.delete(k); }
    for (const [k, c] of live) if (!views.has(k)) draw(s, c, k);
  };

  refresh();
  return {
    refresh,
    count: () => views.size,
    update(player) { for (const v of views.values()) v.label.setVisible(Math.hypot(v.x - player.x, v.y - player.y) < LABEL_RANGE); },
  };
}
