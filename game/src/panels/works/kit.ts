/**
 * What every tab of the Works sheet shares: the sheet's context (which yard it is looking at), the one
 * path that runs a Works act (sim call → arcs checked → juice → clock → redraw), and small builders for
 * sections, rows, progress bars and stock lists in the kit's look.
 */
import type { GameContext } from '../../app/contracts';
import { SHIFT_PHASE_CAP } from '../../interact/present';
import { withArcs } from '../../sim/contrib/works';
import type { SimState } from '../../sim/types/runtime';
import { goodName } from '../../sim/works/data';
import type { Result, Stock } from '../../sim/works/types';
import { button, el } from '../dom';

export type WorksUi = {
  ctx: GameContext;
  st: SimState;
  /** The yard (town) the sheet is looking at; may differ from where you stand. */
  town: string;
  here: string;
  setTown(townId: string): void;
  setTab(tab: string): void;
  /** Run a Works act: say its line, pass its hours, check the arcs, redraw. */
  run(fn: (st: SimState) => Result, juice: string): Result;
  redraw(): void;
};

export function runAct(ctx: GameContext, fn: (st: SimState) => Result, juice: string, after: (r: Result) => void): Result {
  const st = ctx.session.getState();
  if (!st) return { ok: false, line: '' };
  const r = withArcs(st, fn(st), juice);
  if (r.ok) {
    ctx.voice?.sfx?.('act');
    if (r.hours) {
      const ph = ctx.world.phase();
      ctx.world.setPhase(Math.max(ph, Math.min(SHIFT_PHASE_CAP, ph + r.hours / 24)));
    }
  } else ctx.voice?.sfx?.('refuse');
  ctx.events.emit('inventory', {});
  after(r);
  return r;
}

export const section = (title: string, note?: string): HTMLElement => {
  const s = el('section', 'hf-works-sec');
  s.append(el('h3', 'hf-subhead', title));
  if (note) s.append(el('p', 'hf-muted hf-small', note));
  return s;
};

/** A row: a title, a line of detail, and buttons on the right (wrapping under on a narrow sheet). */
export function row(title: string, detail: string, buttons: HTMLButtonElement[] = [], cls = ''): HTMLElement {
  const r = el('div', `hf-works-row ${cls}`.trim());
  const text = el('div', 'hf-works-row__text');
  text.append(el('strong', '', title));
  if (detail) text.append(el('span', 'hf-small hf-muted', detail));
  const acts = el('div', 'hf-works-row__acts');
  acts.append(...buttons);
  r.append(text, acts);
  return r;
}

export const btn = (label: string, onClick: () => void, opts: { disabled?: boolean; title?: string; id?: string; hot?: boolean } = {}): HTMLButtonElement =>
  button(label, onClick, { cls: `hf-works-btn${opts.hot ? ' is-hot' : ''}`, ...(opts.disabled ? { disabled: true } : {}), ...(opts.title ? { title: opts.title } : {}), ...(opts.id ? { id: opts.id } : {}) });

export function bar(have: number, need: number): HTMLElement {
  const b = el('div', 'hf-works-bar', undefined, { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(need), 'aria-valuenow': String(Math.min(have, need)) });
  const i = document.createElement('i');
  i.style.width = `${Math.min(100, Math.round((100 * have) / Math.max(1, need)))}%`;
  b.append(i);
  return b;
}

export function stockList(s: Stock, empty = 'Nothing.'): HTMLElement {
  const entries = Object.entries(s).filter(([, n]) => n > 0).sort((a, b) => goodName(a[0]).localeCompare(goodName(b[0])));
  if (!entries.length) return el('p', 'hf-muted hf-small', empty);
  const ul = el('ul', 'hf-works-stock');
  for (const [id, n] of entries) ul.append(el('li', '', `${goodName(id)} ×${n}`));
  return ul;
}

export const recipeText = (inp: Stock | undefined, out: Stock): string => {
  const t = (s: Stock): string => Object.entries(s).map(([id, n]) => `${n} ${goodName(id).toLowerCase()}`).join(' + ');
  return inp && Object.keys(inp).length ? `${t(inp)} → ${t(out)}` : `→ ${t(out)}`;
};
