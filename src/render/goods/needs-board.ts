/** Diegetic noticeboards only point at deeds; reading one never fixes a town. */
import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { WorldLayout } from '../../sim/map/world-layout';
import { townNeeds } from '../../sim/goods/town-needs';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
type Pt = { x: number; y: number };
export function createNeedsBoards(scene: Phaser.Scene, session: PlaySession, layout: WorldLayout, names: Map<string, string>, getPlayer: () => Pt) {
  const panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(1_000_140).setVisible(false);
  const font = { fontFamily: 'monospace', fontSize: '12px', color: '#efdfb9', wordWrap: { width: 400 } };
  const spots = layout.settlements.map((t) => {
    const p = tileFootWorld(t.q - 3.5, t.r + 3.2);
    const g = scene.add.graphics().setDepth(p.y);
    g.fillStyle(0x59412d).fillRect(p.x - 21, p.y - 36, 4, 38).fillRect(p.x + 17, p.y - 36, 4, 38);
    g.fillStyle(0xa87643).fillRect(p.x - 28, p.y - 46, 56, 34);
    g.lineStyle(3, 0x68472e).strokeRect(p.x - 28, p.y - 46, 56, 34);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0xe9d4a2).fillRect(p.x - 21 + i * 15, p.y - 40 + i % 2 * 4, 11, 20);
      g.lineStyle(1, 0x907951).lineBetween(p.x - 19 + i * 15, p.y - 34 + i % 2 * 4, p.x - 13 + i * 15, p.y - 34 + i % 2 * 4);
    }
    scene.add.text(p.x, p.y + 5, 'Needs · E', { ...font, fontSize: '10px', stroke: '#1b1612', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(p.y + 1);
    return { id: t.id, p };
  });
  const close = () => panel.setVisible(false);
  const open = (id: string) => {
    const s = session.getState(); if (!s) return;
    const needs = townNeeds(s, id);
    panel.removeAll(true); panel.setVisible(true);
    const x = scene.scale.width / 2 - 225, y = scene.scale.height / 2 - 180;
    panel.add(scene.add.rectangle(x, y, 450, 360, 0x292017, 0.98).setOrigin(0).setStrokeStyle(3, 0xa57b49));
    panel.add(scene.add.text(x + 20, y + 15, `${names.get(id) ?? id} · Noticeboard`, { ...font, fontSize: '15px', color: '#f2b84b' }));
    const lines = ['What our neighbours need', ''];
    if (!needs.shortages.length) lines.push('The stores are holding. No supply shortage today.');
    for (const n of needs.shortages) lines.push(`• ${n.missing} more: ${n.items.join(' / ')}.`);
    lines.push('', 'People who could use a hand');
    if (!needs.struggling.length) lines.push('No urgent personal appeals today.');
    for (const p of needs.struggling) lines.push(`• ${p.name ?? p.id}: ${(p.woundId ?? 'spirits low').replace(/_/g, ' ')}. Work alongside, listen or help.`);
    lines.push('', 'Bring supplies to a resident: select an item in your satchel, then give, trade or deliver it. The board changes when real stock and people change.');
    panel.add(scene.add.text(x + 20, y + 49, lines.join('\n'), { ...font, fontSize: '11px', lineSpacing: 4, wordWrap: { width: 410 } }));
    const b = scene.add.text(x + 330, y + 321, 'Close [Esc]', { ...font, backgroundColor: '#65482c', padding: { x: 6, y: 5 } }).setInteractive({ useHandCursor: true });
    b.on('pointerdown', close); panel.add(b);
  };
  return {
    close, isOpen: () => panel.visible,
    interact(p: Pt) { const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 50); if (!spot) return false; open(spot.id); return true; },
    openNearest() { const p = getPlayer(); const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 90); if (spot) open(spot.id); },
  };
}
