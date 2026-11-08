/**
 * Noticeboard pages. Each town's board cycles through every registered page. Systems register a page
 * in their own module (imported from ./contrib); the board renders its lines. A page may return
 * `columns: [left, right]` to split long content. Boards point at people and deeds; reading one never
 * changes the world. Pure: no Phaser/DOM.
 */
import type { SimState } from './types/runtime';

export type BoardPageContent = { lines?: string[]; columns?: [string[], string[]] };
export type BoardPage = {
  id: string;
  /** Tab label, e.g. "Town economy". */
  title: string;
  render: (state: SimState, townId: string, nameOf: (townId: string) => string) => BoardPageContent;
};

const pages = new Map<string, BoardPage>();

/** Register (or replace) a page. Pages appear in registration order. */
export function registerBoardPage(page: BoardPage): void {
  pages.set(page.id, page);
}

export function boardPages(): BoardPage[] {
  return [...pages.values()];
}
