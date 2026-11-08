/**
 * The hotbar: 9 DOM slots over the canvas, bottom centre. Slots keep their item: a stack that empties
 * stays as a faded ghost (no reshuffle) until a new item needs the room. The selection is the held item
 * id, not a slot index. Coin never takes a slot (the HUD purse shows it). Dragging a stack out of a slot
 * emits 'item-drag' for the interact area (drop on a person gives it).
 */
import type { GameContext } from '../app/contracts';
import { ITEMS, inventoryOf, itemName } from '../sim/goods/inventory';
import { sealedLetters } from '../sim/goods/instances';
import { clientToWorld, el } from './dom';
import { itemIcon, paintIcon } from './icons';

export const HOTBAR_SLOTS = 9;
const DRAG_PX = 6;

export type Hotbar = {
  /** Re-read the inventory; redraw only if something changed (cheap to call often). */
  sync(force?: boolean): void;
  held(): string | null;
  hold(itemId: string | null): void;
  /** Select by slot (keys 1–9): the slot's item, or toggle off if it is already held / empty. */
  selectSlot(i: number): void;
  slots(): (string | null)[];
  dragging(): string | null;
  cancelDrag(): void;
  /** Forget slot order (after a load or a new world). */
  reset(): void;
};

export function createHotbar(ctx: GameContext, parent: HTMLElement): Hotbar {
  const root = el('div', 'hf-hotbar', undefined, { role: 'toolbar', 'aria-label': 'Hotbar' });
  const name = el('div', 'hf-hotbar__name', '', { 'aria-live': 'polite' });
  const row = el('div', 'hf-hotbar__slots');
  root.append(name, row);
  parent.append(root);

  let slots: (string | null)[] = new Array(HOTBAR_SLOTS).fill(null);
  let held: string | null = null;
  let sig = '';
  const counts = (): Record<string, number> => {
    const st = ctx.session.getState();
    return st ? inventoryOf(st) : {};
  };

  /** Keep every slot's item; new items take the first free slot, then the first ghost. */
  const place = (inv: Record<string, number>): void => {
    for (const item of ITEMS.items) {
      const id = item.id;
      if (id === 'coin' || (inv[id] ?? 0) <= 0 || slots.includes(id)) continue;
      let at = slots.indexOf(null);
      if (at < 0) at = slots.findIndex((s) => s !== null && (inv[s] ?? 0) <= 0);
      if (at < 0) break; // satchel only
      slots[at] = id;
    }
  };

  const setHeld = (id: string | null): void => {
    if (id === held) return;
    held = id;
    sig = '';
    ctx.events.emit('held-item', { itemId: id });
    sync();
  };

  const buildSlot = (i: number, id: string | null, qty: number): HTMLButtonElement => {
    const b = el('button', `hf-hotslot${qty <= 0 ? ' is-empty' : ''}`, undefined, {
      type: 'button',
      'data-slot': i,
      'data-item': id ?? undefined,
      'aria-pressed': String(!!id && id === held && qty > 0),
      'aria-label': id ? `${itemName(id)}, ${qty}` : `Empty slot ${i + 1}`,
      title: id ? `${itemName(id)} ×${qty}${letterNote(id)}` : '',
    });
    b.append(el('span', 'hf-hotslot__key', String(i + 1)));
    if (id) {
      b.append(itemIcon(id));
      if (qty > 0) b.append(el('span', 'hf-hotslot__qty', String(qty)));
      if (letterNote(id)) b.append(el('span', 'hf-hotslot__mark', '✉'));
    }
    b.addEventListener('pointerdown', (e) => onDown(e, b, i));
    return b;
  };

  const letterNote = (id: string): string => {
    const st = ctx.session.getState();
    if (!st || id !== 'letter') return '';
    const sealed = sealedLetters(st);
    return sealed.length ? `\nIn the post to ${sealed.map((l) => st.people[l.to ?? '']?.name ?? l.to).join(', ')}` : '';
  };

  function sync(force = false): void {
    const inv = counts();
    place(inv);
    if (held && (inv[held] ?? 0) <= 0) {
      held = null;
      ctx.events.emit('held-item', { itemId: null });
    }
    const next = `${held}|${slots.map((s) => `${s}:${s ? inv[s] ?? 0 : 0}`).join(',')}|${sealedCount()}`;
    if (!force && next === sig) return;
    sig = next;
    row.replaceChildren(...slots.map((id, i) => buildSlot(i, id, id ? inv[id] ?? 0 : 0)));
    name.textContent = held ? `${itemName(held)} ×${inv[held] ?? 0}` : '';
  }
  const sealedCount = (): number => {
    const st = ctx.session.getState();
    return st ? sealedLetters(st).length : 0;
  };

  // ---- Drag out of a slot ----
  let press: { id: string; x: number; y: number; pointer: number; slot: HTMLElement; moved: boolean; ghost?: HTMLElement } | null = null;
  const point = (e: PointerEvent): { world: { x: number; y: number }; screen: { x: number; y: number } } => ({
    world: clientToWorld(ctx, e.clientX, e.clientY),
    screen: { x: e.clientX, y: e.clientY },
  });
  const endPress = (phase: 'drop' | 'cancel' | null, e?: PointerEvent): void => {
    const p = press;
    if (!p) return;
    press = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    p.ghost?.remove();
    if (p.moved && phase) {
      const at = e ? point(e) : { world: { x: 0, y: 0 }, screen: { x: 0, y: 0 } };
      ctx.events.emit('item-drag', { itemId: p.id, phase, ...at });
    }
  };
  const onDown = (e: PointerEvent, slot: HTMLElement, i: number): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    const id = slots[i];
    if (!id || (counts()[id] ?? 0) <= 0) { selectSlot(i); return; }
    endPress('cancel');
    press = { id, x: e.clientX, y: e.clientY, pointer: e.pointerId, slot, moved: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };
  const onMove = (e: PointerEvent): void => {
    const p = press;
    if (!p || e.pointerId !== p.pointer) return;
    if (!p.moved) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
      p.moved = true;
      const ghost = el('div', 'hf-drag-ghost', undefined, { 'aria-hidden': 'true' });
      const icon = el('span', 'hf-icon');
      paintIcon(icon, p.id);
      ghost.append(icon);
      document.body.append(ghost);
      p.ghost = ghost;
      ctx.events.emit('item-drag', { itemId: p.id, phase: 'start', ...point(e) });
    }
    if (p.ghost) Object.assign(p.ghost.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
    ctx.events.emit('item-drag', { itemId: p.id, phase: 'move', ...point(e) });
  };
  const onUp = (e: PointerEvent): void => {
    const p = press;
    if (!p || e.pointerId !== p.pointer) return;
    if (!p.moved) {
      endPress(null);
      setHeld(held === p.id ? null : p.id);
      return;
    }
    const over = document.elementFromPoint(e.clientX, e.clientY);
    endPress(over && row.contains(over) ? 'cancel' : 'drop', e);
  };
  const onCancel = (e: PointerEvent): void => endPress('cancel', e);

  function selectSlot(i: number): void {
    const id = slots[i] ?? null;
    if (!id || (counts()[id] ?? 0) <= 0 || held === id) setHeld(null);
    else setHeld(id);
  }

  sync(true);
  return {
    sync,
    held: () => held,
    hold: (id) => setHeld(id && (counts()[id] ?? 0) > 0 && id !== 'coin' ? id : null),
    selectSlot,
    slots: () => [...slots],
    dragging: () => (press?.moved ? press.id : null),
    cancelDrag: () => endPress('cancel'),
    reset: () => {
      slots = new Array(HOTBAR_SLOTS).fill(null);
      endPress('cancel');
      setHeld(null);
      sync(true);
    },
  };
}
