/**
 * The noticeboard sheet: one tab for every page registered in sim/board-pages (People, Town economy, Road
 * works, Families, Power and whatever systems add later), the chosen page's lines below. Reading a board
 * never changes the world.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { boardPages } from '../sim/board-pages';
import { button, el, townNamer } from './dom';

export const BOARD_ID = 'board';

/** Resolve a page given by index or id to an index into boardPages(). */
export function pageIndex(page: string | number | undefined): number {
  const pages = boardPages();
  if (!pages.length) return 0;
  if (typeof page === 'string') return Math.max(0, pages.findIndex((p) => p.id === page));
  const n = Math.trunc(page ?? 0);
  return ((n % pages.length) + pages.length) % pages.length;
}

export function boardSheet(ctx: GameContext, townId: string, start: string | number | undefined, onPage: (pageId: string) => void): SheetDef {
  const nameOf = townNamer(ctx);
  let at = pageIndex(start);
  const def: SheetDef = {
    id: BOARD_ID,
    title: `${nameOf(townId)} · Noticeboard`,
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      const pages = boardPages();
      if (!st || !pages.length) { body.append(el('p', 'hf-muted', 'The board is bare.')); return; }
      at = Math.min(at, pages.length - 1);
      const tabs = el('div', 'hf-tabs', undefined, { role: 'tablist', 'aria-label': 'Board pages' });
      pages.forEach((p, i) => {
        const b = button(p.title, () => { at = i; onPage(p.id); render(); }, { cls: i === at ? 'is-on' : '', id: `board-${p.id}`, pressed: i === at });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(i === at));
        tabs.append(b);
      });
      const page = pages[at]!;
      const panel = el('div', 'hf-board-page', undefined, { role: 'tabpanel', 'data-page': page.id, 'aria-label': page.title });
      let content: ReturnType<typeof page.render>;
      try { content = page.render(st, townId, nameOf); } catch (err) {
        console.error(`board page ${page.id} failed`, err);
        content = { lines: ['This notice is too weathered to read.'] };
      }
      if (content.columns) {
        const cols = el('div', 'hf-cols');
        for (const col of content.columns) if (col.length) cols.append(el('pre', 'hf-pre', col.join('\n')));
        panel.append(cols);
      }
      if (content.lines?.length) panel.append(el('pre', 'hf-pre', content.lines.join('\n')));
      if (!panel.childElementCount) panel.append(el('p', 'hf-muted', 'Nothing posted here today.'));
      body.append(tabs, panel);
      body.scrollTop = 0;
      function render(): void { def.render(body); }
    },
  };
  return def;
}
