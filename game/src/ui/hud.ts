/**
 * The minimal HUD (README rule 4), DOM in the canvas-aligned layer so text stays crisp:
 * - spark bar top-left: gold fill, cyan outline (an empty bar still reads); it gutters when low
 * - "Day N · phase" muted at top-centre
 * - the unread-letters chip on the right edge (hidden at 0, and while a sheet covers that edge)
 * - the purse just above the hotbar's left end
 * - ☰ bottom-left on desktop (the touch bar carries Menu on phones)
 * Callers push values; nothing here polls. `destroy()` removes this run's elements.
 */
import type { UiApi } from '../app/contracts';
import { uiLayer } from './kit/layer';
import { overlays } from './kit/overlay-stack';
import { ensureKitStyle } from './kit/style';

/** Day clock 0..1 → the word the day chip shows (0 dawn, .5 noon, .75 dusk). */
export function dayPhaseLabel(p01: number): 'dawn' | 'morning' | 'day' | 'dusk' | 'night' {
  const t = ((p01 % 1) + 1) % 1;
  if (t < 0.08) return 'dawn';
  if (t < 0.3) return 'morning';
  if (t < 0.66) return 'day';
  if (t < 0.82) return 'dusk';
  if (t < 0.97) return 'night';
  return 'dawn';
}

export type Hud = UiApi['hud'] & {
  /** The day chip (e2e reads its text and data-*). */
  status: HTMLElement;
  /** Desktop ☰ (hidden while the touch bar shows its own Menu). */
  setMenuButton: (show: boolean) => void;
  unread: () => number;
  destroy: () => void;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, id: string, cls = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.id = id;
  if (cls) e.className = cls;
  return e;
};

export function createHud(io: { onLetters: () => void; onMenu: () => void }): Hud {
  ensureKitStyle();
  const layer = uiLayer().el;

  const spark = el('div', 'hf-spark');
  spark.setAttribute('role', 'meter');
  spark.setAttribute('aria-label', 'Spark');
  spark.setAttribute('aria-valuemin', '0');
  spark.setAttribute('aria-valuemax', '100');
  spark.appendChild(document.createElement('i'));

  const daybar = el('div', 'hf-daybar', 'hf-chip');
  daybar.hidden = true;
  const status = el('span', 'hf-status');
  const phase = el('span', 'hf-phase');
  daybar.append(status, phase);

  const letters = el('button', 'hf-letter-chip', 'hf-chip');
  letters.type = 'button';
  letters.hidden = true;
  letters.addEventListener('click', () => io.onLetters());

  const purse = el('div', 'hf-purse', 'hf-chip');
  purse.setAttribute('aria-label', 'Purse');

  const menuBtn = el('button', 'hf-menu-btn', 'hf-chip');
  menuBtn.type = 'button';
  menuBtn.textContent = '☰';
  menuBtn.title = 'Menu · Esc';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.hidden = true;
  menuBtn.addEventListener('click', () => io.onMenu());

  const parts = [spark, daybar, letters, purse, menuBtn];
  layer.append(...parts);

  let unread = 0;
  let menuWanted = false;
  const paint = (): void => {
    const covered = overlays.count('menu', 'modal') > 0;
    letters.hidden = unread <= 0 || covered || overlays.count('sheet') > 0;
    menuBtn.hidden = !menuWanted || covered;
  };
  const offStack = overlays.subscribe(paint);

  let lastDay = -1, lastWord = '';
  return {
    status,
    spark(v01) {
      const v = Math.max(0, Math.min(1, Number.isFinite(v01) ? v01 : 0));
      spark.style.setProperty('--v', v.toFixed(3));
      spark.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      spark.classList.toggle('is-low', v > 0 && v < 0.2);
      spark.dataset.spark = v.toFixed(3);
    },
    day(day, p01) {
      const word = dayPhaseLabel(p01);
      if (day === lastDay && word === lastWord) return;
      lastDay = day;
      lastWord = word;
      status.textContent = `Day ${day}`;
      phase.textContent = ` · ${word}`;
      daybar.hidden = false;
      status.dataset.day = String(day);
    },
    letters(n) {
      if (n === unread) return;
      unread = n;
      letters.textContent = `✉ ${n}`;
      const what = `${n} unread ${n === 1 ? 'letter' : 'letters'}`;
      letters.setAttribute('aria-label', `${what}; open letters (L)`);
      letters.title = `${what} · L`;
      paint();
    },
    purse(coin) {
      const c = Math.max(0, Math.floor(coin || 0));
      purse.textContent = `◉ ${c}`;
      purse.title = `${c} coin`;
      purse.dataset.coin = String(c);
    },
    setMenuButton(show) {
      menuWanted = show;
      paint();
    },
    unread: () => unread,
    destroy() {
      offStack();
      for (const p of parts) p.remove();
    },
  };
}
