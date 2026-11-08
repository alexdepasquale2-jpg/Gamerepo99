/**
 * The one prompt in the world: a small marker and a label over the focused thing, and nothing anywhere
 * else. Hidden while the ring is open or nothing is in focus.
 */
import type { Pt } from '../app/contracts';
import type { Layer } from './layer';

export type WorldPrompt = {
  /** Show `label` (with an optional verb hint) over the world point `at`; null hides it. */
  show(at: Pt | null, label?: string, hint?: string): void;
  text(): string;
};

export function createPrompt(layer: Layer): WorldPrompt {
  const el = document.createElement('div');
  el.className = 'ix-prompt';
  el.style.display = 'none';
  const name = document.createElement('b');
  const marker = document.createElement('i');
  marker.textContent = '▼';
  el.append(name, marker);
  layer.el.appendChild(el);
  let shown = '';

  return {
    show(at, label, hint) {
      if (!at || !label) {
        if (shown) el.style.display = 'none';
        shown = '';
        return;
      }
      const text = hint ? `${label} · ${hint}` : label;
      if (text !== shown) name.textContent = text;
      if (!shown) el.style.display = '';
      shown = text;
      const p = layer.toLayer(at);
      el.style.left = `${Math.round(p.x)}px`;
      el.style.top = `${Math.round(p.y)}px`;
    },
    text: () => shown,
  };
}
