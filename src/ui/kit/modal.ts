/**
 * The one modal: a full-window screen on the overlay stack (succession and the hoard ending only;
 * news never pops up). It traps focus, swallows Esc (an answer is needed) and leaves the game running.
 */
import { overlays } from './overlay-stack';
import { ensureKitStyle } from './style';

export type Modal = { el: HTMLElement; show: () => void; hide: () => void; isOpen: () => boolean };

export function createModal(id: string, label: string, host: HTMLElement = document.body): Modal {
  ensureKitStyle();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'hf-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.hidden = true;
  el.style.display = 'none';
  host.appendChild(el);
  const hide = (): void => {
    el.hidden = true;
    el.style.display = 'none';
    el.replaceChildren();
  };
  return {
    el,
    show() {
      el.hidden = false;
      el.style.display = 'flex';
      overlays.open({ id, kind: 'modal', el, onEscape: () => undefined, onClose: hide });
    },
    hide: () => (overlays.has(id) ? overlays.close(id) : hide()),
    isOpen: () => !el.hidden,
  };
}

/** A choice button; both choices share one look (quitting is never demoted). */
export function choiceButton(label: string, choice: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hf-choice';
  b.textContent = label;
  b.dataset.choice = choice;
  b.addEventListener('click', onClick);
  return b;
}
