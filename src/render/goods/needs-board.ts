/** Diegetic noticeboards only point at deeds; reading one never fixes a town. */
import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { WorldLayout } from '../../sim/map/world-layout';
import { boardPages } from '../../sim/board-pages';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
import { createSheet, kitButton, kitEl } from '../../ui/kit/sheet';
type Pt = { x: number; y: number };
export function createNeedsBoards(scene: Phaser.Scene, session: PlaySession, layout: WorldLayout, names: Map<string, string>, getPlayer: () => Pt) {
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
  // The board reads as a kit side sheet: tabs for every page, the world still in view.
  const sheet = createSheet({ id: 'hf-board', title: 'Noticeboard' });
  scene.events.once('shutdown', () => sheet.destroy());
  const close = () => sheet.close();
  /** One registered page at a time (sim/board-pages); the tabs jump between pages. */
  const open = (id: string, page = 0): void => {
    const s = session.getState(); if (!s) return;
    const pages = boardPages();
    if (!pages.length) return;
    const at = ((page % pages.length) + pages.length) % pages.length;
    const def = pages[at]!;
    const content = def.render(s, id, (t) => names.get(t) ?? t);
    sheet.setTitle(`${names.get(id) ?? id} · Noticeboard · ${def.title}`);
    sheet.body.replaceChildren();
    if (content.columns) {
      const cols = kitEl('div', 'hf-cols');
      for (const col of content.columns) cols.append(kitEl('pre', 'hf-pre', col.join('\n')));
      sheet.body.append(cols);
    }
    if (content.lines?.length) sheet.body.append(kitEl('pre', 'hf-pre', content.lines.join('\n')));
    const tabs = sheet.el.querySelector('.hf-tabs') ?? kitEl('div', 'hf-tabs');
    tabs.replaceChildren(...pages.map((p, i) => kitButton(p.title, () => open(id, i), { on: i === at, id: `board-${p.id}` })));
    if (!tabs.isConnected) sheet.head.after(tabs);
    (tabs as HTMLElement).hidden = pages.length < 2;
    sheet.body.scrollTop = 0;
    sheet.open();
  };
  return {
    close, isOpen: () => sheet.isOpen(),
    interact(p: Pt) { const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 50); if (!spot) return false; open(spot.id); return true; },
    openNearest() { const p = getPlayer(); const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < 90); if (spot) open(spot.id); },
    /** Open a town's board at a page (by index or page id) — for tests and dev. */
    openAt(townId: string, page: number | string = 0) { const i = typeof page === 'number' ? page : boardPages().findIndex((p) => p.id === page); open(townId, Math.max(0, i)); },
  };
}
