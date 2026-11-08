/** Diegetic noticeboards only point at deeds; reading one never fixes a town. */
import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { WorldLayout } from '../../sim/map/world-layout';
import { boardPages } from '../../sim/board-pages';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
type Pt = { x: number; y: number };
export function createNeedsBoards(scene: Phaser.Scene, session: PlaySession, layout: WorldLayout, names: Map<string, string>, getPlayer: () => Pt) {
  const panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(1_000_400).setVisible(false);
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
  /** One registered page at a time (sim/board-pages); the tab steps to the next page. */
  const open = (id: string, page = 0): void => {
    const s = session.getState(); if (!s) return;
    const pages = boardPages();
    if (!pages.length) return;
    const at = ((page % pages.length) + pages.length) % pages.length;
    const def = pages[at]!;
    const content = def.render(s, id, (t) => names.get(t) ?? t);
    panel.removeAll(true); panel.setVisible(true);
    const PW = 600, PH = 340;
    const x = scene.scale.width / 2 - PW / 2, y = scene.scale.height / 2 - PH / 2;
    panel.add(scene.add.rectangle(x, y, PW, PH, 0x292017, 0.98).setOrigin(0).setStrokeStyle(3, 0xa57b49));
    panel.add(scene.add.text(x + 20, y + 15, `${names.get(id) ?? id} · Noticeboard · ${def.title}`, { ...font, fontSize: '14px', color: '#f2b84b' }));
    const small = { ...font, fontSize: '10px', lineSpacing: 2 };
    if (content.columns) {
      const [left, right] = content.columns;
      panel.add(scene.add.text(x + 16, y + 40, left.join('\n'), { ...small, wordWrap: { width: PW / 2 - 26 } }));
      panel.add(scene.add.text(x + PW / 2 + 4, y + 40, right.join('\n'), { ...small, wordWrap: { width: PW / 2 - 26 } }));
    }
    if (content.lines?.length) panel.add(scene.add.text(x + 16, y + 40, content.lines.join('\n'), { ...small, fontSize: '11px', lineSpacing: 3, wordWrap: { width: PW - 32 } }));
    if (pages.length > 1) {
      const next = pages[(at + 1) % pages.length]!;
      const tab = scene.add.text(x + 16, y + PH - 32, `${next.title} ▸`, { ...font, fontSize: '11px', backgroundColor: '#65482c', padding: { x: 6, y: 4 } }).setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => open(id, at + 1)); panel.add(tab);
    }
    const b = scene.add.text(x + PW - 100, y + PH - 32, 'Close [Esc]', { ...font, backgroundColor: '#65482c', padding: { x: 6, y: 5 } }).setInteractive({ useHandCursor: true });
    b.on('pointerdown', close); panel.add(b);
  };
  return {
    close, isOpen: () => panel.visible,
    interact(p: Pt) { const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 50); if (!spot) return false; open(spot.id); return true; },
    openNearest() { const p = getPlayer(); const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 90); if (spot) open(spot.id); },
    /** Open a town's board at a page (by index or page id) — for tests and dev. */
    openAt(townId: string, page: number | string = 0) { const i = typeof page === 'number' ? page : boardPages().findIndex((p) => p.id === page); open(townId, Math.max(0, i)); },
  };
}
