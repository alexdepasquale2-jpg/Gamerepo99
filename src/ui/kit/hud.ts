/**
 * The minimal DOM HUD in the canvas-aligned layer (UI_JUICE_SPEC §2): day and phase at top-centre,
 * muted; the unread-letters chip on the right edge; the ☰ button for touch. The spark bar stays on the
 * canvas (overworld-scene createSparkHud). Everything is event-driven: callers push values, and the
 * chips hide themselves while a menu or sheet covers their spot.
 */
import { uiLayer } from './layer';
import { overlays } from './overlay-stack';
import { ensureKitStyle } from './style';

/** Day clock 0..1 → the word the day chip shows (matches world-life skyAt: 0 dawn, .62 dusk, .76 night). */
export function dayPhaseLabel(p01: number): 'dawn' | 'day' | 'dusk' | 'night' {
  const t = ((p01 % 1) + 1) % 1;
  if (t < 0.1) return 'dawn';
  if (t < 0.55) return 'day';
  if (t < 0.72) return 'dusk';
  if (t < 0.96) return 'night';
  return 'dawn';
}

export type Hud = {
  /** The `#hf-status` element ("Day N"; e2e reads its text and data-*). */
  status: HTMLElement;
  setDay: (day: number | null) => void;
  setPhase: (p01: number | null) => void;
  setLetters: (unread: number) => void;
  onLetters: (fn: (() => void) | null) => void;
  /** Show the ☰ button (it still hides while a menu is open). */
  setMenuButton: (enabled: boolean, onClick?: () => void) => void;
};

let hud: Hud | undefined;

export function getHud(): Hud {
  if (hud && hud.status.isConnected) return hud;
  ensureKitStyle();
  const layer = uiLayer().el;
  const daybar = document.createElement('div');
  daybar.id = 'hf-daybar';
  daybar.className = 'hf-chip';
  daybar.hidden = true;
  const status = document.createElement('span');
  status.id = 'hf-status';
  const phase = document.createElement('span');
  phase.id = 'hf-phase';
  daybar.append(status, phase);

  const letters = document.createElement('button');
  letters.type = 'button';
  letters.id = 'hf-letter-chip';
  letters.className = 'hf-chip';
  letters.hidden = true;

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.id = 'hf-menu-btn';
  menuBtn.className = 'hf-chip';
  menuBtn.textContent = '☰';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.hidden = true;
  layer.append(daybar, letters, menuBtn);

  let unread = 0;
  let menuEnabled = false;
  let onLetters: (() => void) | null = null;
  let onMenu: (() => void) | undefined;
  const paint = (): void => {
    const covered = overlays.count('menu', 'modal') > 0;
    const sheet = overlays.count('sheet') > 0;
    letters.hidden = unread <= 0 || covered || sheet;
    menuBtn.hidden = !menuEnabled || covered;
  };
  overlays.subscribe(paint);
  letters.addEventListener('click', () => onLetters?.());
  menuBtn.addEventListener('click', () => onMenu?.());

  hud = {
    status,
    setDay(day) {
      status.textContent = day === null ? '' : `Day ${day}`;
      daybar.hidden = day === null;
    },
    setPhase(p) {
      const word = p === null ? '' : dayPhaseLabel(p);
      if (phase.textContent !== (word ? ` · ${word}` : '')) phase.textContent = word ? ` · ${word}` : '';
    },
    setLetters(n) {
      if (n === unread) return;
      unread = n;
      letters.textContent = `✉ ${n}`;
      letters.setAttribute('aria-label', `${n} unread ${n === 1 ? 'reply' : 'replies'}; open letters (L)`);
      letters.title = `${n} unread ${n === 1 ? 'reply' : 'replies'} · L`;
      paint();
    },
    onLetters(fn) { onLetters = fn; },
    setMenuButton(enabled, onClick) {
      menuEnabled = enabled;
      if (onClick) onMenu = onClick;
      paint();
    },
  };
  return hud;
}
