/**
 * The verb ring, anchored to whatever was chosen (a person's head, a node, a door), as DOM chips over the
 * canvas. At most RING_MAX chips, never a page: past six verbs the chips are families (Speak, Help, …) and
 * picking one shows its verbs, with the family's name above them to step back. Chip text is short; the full
 * label is a tip on hover or long-press. Kind = teal, savage = rust, family = gold, held item = dashed.
 * Each chip leads with its family's glyph (ring-look.ts holds the look). Keys 1–6 pick while it is open (see input.ts); a tap or click picks too.
 */
import type { Pt } from '../app/contracts';
import { RING_MAX, type RingChip } from '../sim/play-session/verb-families';
import type { Layer } from './layer';
import { ensureRingLook, glyphFor } from './ring-look';

export type RingView = {
  family: string | null;
  chips: { id: string; label: string; tip?: string; savage: boolean; verbs?: string[] }[];
};
export type Ring = {
  /** Open on `anchor` (re-read every frame so the ring follows a walking person). */
  open(anchor: () => Pt | null, chips: RingChip[], pick: (c: RingChip) => void, opts?: { held?: ReadonlySet<string> }): void;
  close(): void;
  isOpen(): boolean;
  /** Number-key pick (0-based): a verb acts, a family opens its verbs. True if handled. */
  pickIndex(i: number): boolean;
  /** From a family's verbs back to the top. False when already at the top. */
  back(): boolean;
  /** Follow the anchor (once a frame). False when the anchor is gone. */
  place(): boolean;
  view(): RingView | null;
};

const PER_ROW = 3;
const LONG_PRESS_MS = 450;
const EDGE = 4;

export function createRing(layer: Layer): Ring {
  ensureRingLook();
  const root = document.createElement('div');
  root.className = 'ix-ring';
  root.style.display = 'none';
  root.setAttribute('role', 'menu');
  layer.el.appendChild(root);
  const tip = document.createElement('div');
  tip.className = 'ix-tip';
  tip.style.display = 'none';
  layer.el.appendChild(tip);

  let open = false;
  let top: RingChip[] = [];
  let shown: RingChip[] = [];
  let family: RingChip | null = null;
  let anchor: () => Pt | null = () => null;
  let cb: ((c: RingChip) => void) | null = null;
  let held: ReadonlySet<string> = new Set();

  const hideTip = (): void => void (tip.style.display = 'none');
  const showTip = (c: RingChip, chip: HTMLElement): void => {
    if (!c.tip) return;
    tip.textContent = c.tip;
    tip.style.display = '';
    const r = chip.getBoundingClientRect();
    const L = layer.el.getBoundingClientRect();
    tip.style.left = `${Math.round(r.left - L.left + r.width / 2)}px`;
    tip.style.top = `${Math.round(r.bottom - L.top + 3)}px`;
  };

  const choose = (c: RingChip): void => {
    hideTip();
    if (c.verbs?.length) {
      family = c;
      draw(c.verbs);
      return;
    }
    cb?.(c);
  };

  function chipEl(c: RingChip, i: number): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ix-chip${c.verbs ? ' family' : c.savage ? ' savage' : ''}${held.has(c.id) ? ' held' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.dataset.id = c.id;
    if (c.tip) b.setAttribute('aria-label', c.tip);
    b.style.animationDelay = `${i * 30}ms`;
    const n = document.createElement('sup');
    n.textContent = String(i + 1);
    // The glyph leads (icon first, then the short label); it is decoration, so screen readers skip it.
    const g = document.createElement('i');
    g.className = 'ix-glyph';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = glyphFor(c);
    b.append(n, g, document.createTextNode(c.verbs ? `${c.label} ›` : c.label));
    // A press must start on this chip (not the tap that opened the ring under the finger). A long press
    // shows the full label instead of acting.
    let downAt = 0;
    let longShown = false;
    let timer = 0;
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTip(c, b); });
    b.addEventListener('pointerleave', () => { window.clearTimeout(timer); downAt = 0; hideTip(); });
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      downAt = performance.now();
      longShown = false;
      window.clearTimeout(timer);
      if (e.pointerType !== 'mouse') timer = window.setTimeout(() => { longShown = true; showTip(c, b); }, LONG_PRESS_MS);
    });
    b.addEventListener('pointerup', () => {
      window.clearTimeout(timer);
      const began = downAt;
      downAt = 0;
      if (!began || longShown) return;
      choose(c);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  function draw(chips: RingChip[]): void {
    root.replaceChildren();
    hideTip();
    shown = chips.slice(0, RING_MAX);
    if (family) {
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'ix-head';
      head.textContent = `‹ ${family.label}`;
      head.addEventListener('pointerup', () => api.back());
      root.appendChild(head);
    }
    const grid = document.createElement('div');
    grid.className = 'ix-grid';
    grid.style.gridTemplateColumns = `repeat(${Math.min(PER_ROW, shown.length)}, 1fr)`;
    shown.forEach((c, i) => grid.appendChild(chipEl(c, i)));
    root.appendChild(grid);
    api.place();
  }

  const api: Ring = {
    open(a, chips, pick, opts) {
      api.close();
      if (!chips.length) return;
      open = true;
      anchor = a;
      cb = pick;
      held = opts?.held ?? new Set();
      top = chips.slice(0, RING_MAX);
      family = null;
      root.style.display = '';
      draw(top);
    },
    close() {
      open = false;
      cb = null;
      family = null;
      shown = [];
      root.replaceChildren();
      root.style.display = 'none';
      hideTip();
    },
    isOpen: () => open,
    pickIndex(i) {
      const c = shown[i];
      if (!open || !c) return false;
      choose(c);
      return true;
    },
    back() {
      if (!open || !family) return false;
      family = null;
      draw(top);
      return true;
    },
    place() {
      if (!open) return false;
      const at = anchor();
      if (!at) return false;
      const p = layer.toLayer(at);
      const { w, h } = layer.size();
      const rw = root.offsetWidth, rh = root.offsetHeight;
      // Keep the whole ring on the canvas: it hangs above the anchor, nudged in from the edges.
      const x = w ? Math.max(rw / 2 + EDGE, Math.min(w - rw / 2 - EDGE, p.x)) : p.x;
      const y = h ? Math.max(rh + EDGE, Math.min(h - EDGE, p.y - 6)) : p.y - 6;
      root.style.left = `${Math.round(x)}px`;
      root.style.top = `${Math.round(y)}px`;
      return true;
    },
    view: () => (open
      ? {
          family: family?.family ?? null,
          chips: shown.map((c) => ({ id: c.id, label: c.label, savage: c.savage, ...(c.tip ? { tip: c.tip } : {}), ...(c.verbs ? { verbs: c.verbs.map((v) => v.id) } : {}) })),
        }
      : null),
  };
  return api;
}
