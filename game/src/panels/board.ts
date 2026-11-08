/**
 * The noticeboard sheet: one tab for every page registered in sim/board-pages (People, Town economy, Road
 * works, Families, Power and whatever systems add later), the chosen page's lines below. Reading a board
 * never changes the world.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { boardPages, type BoardPage, type BoardPageContent } from '../sim/board-pages';
import type { SimState } from '../sim/types/runtime';
import { button, el, townNamer } from './dom';

export const BOARD_ID = 'board';

/**
 * A page that wants more than lines (rows you can click to open something) registers a DOM renderer for its
 * id here; the board calls it in place of the page's text. Sim pages stay text, so tests can read them.
 */
export type BoardDecor = (ctx: GameContext, panel: HTMLElement, townId: string) => void;
const decors = new Map<string, BoardDecor>();
export function registerBoardDecor(pageId: string, render: BoardDecor): void {
  decors.set(pageId, render);
}

/** Resolve a page given by index or id to an index into boardPages(). */
export function pageIndex(page: string | number | undefined): number {
  const pages = boardPages();
  if (!pages.length) return 0;
  if (typeof page === 'string') return Math.max(0, pages.findIndex((p) => p.id === page));
  const n = Math.trunc(page ?? 0);
  return ((n % pages.length) + pages.length) % pages.length;
}

function textPage(page: BoardPage, st: SimState, panel: HTMLElement, townId: string, nameOf: (t: string) => string): void {
  let content: BoardPageContent;
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
      const decor = decors.get(page.id);
      if (!decor || !tryDecor(decor, panel)) textPage(page, st, panel, townId, nameOf);
      if (!panel.childElementCount) panel.append(el('p', 'hf-muted', 'Nothing posted here today.'));
      body.append(tabs, panel);
      body.scrollTop = 0;
      function render(): void { def.render(body); }
      function tryDecor(decor: BoardDecor, panel: HTMLElement): boolean {
        try { decor(ctx, panel, townId); return true; } catch (err) {
          console.error(`board decor ${page.id} failed`, err);
          panel.replaceChildren();
          return false;
        }
      }
    },
  };
  return def;
}
