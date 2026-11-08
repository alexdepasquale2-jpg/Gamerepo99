/** Succession overlay: the kit's one modal. Copy comes from the sim's locked UI; quitting is never shamed. */

import type { PlaySession } from '../sim';
import { choiceButton, createModal } from './kit/modal';

export type SuccessionScreen = { refresh: () => void; el: HTMLElement };

export function createSuccessionScreen(session: PlaySession, host: HTMLElement = document.body): SuccessionScreen {
  const modal = createModal('succession-screen', 'Your fire went out', host);
  const el = modal.el;

  // Both buttons share one style: quitting is never visually demoted or warned about.
  const button = (label: string, choice: 'continue' | 'quit'): HTMLButtonElement =>
    choiceButton(label, choice, () => {
      session.chooseSuccession(choice);
      modal.hide();
    });

  function refresh(): void {
    const offer = session.successionOffer();
    if (!offer) return modal.hide();
    if (modal.isOpen()) return;
    const body = document.createElement('p');
    body.textContent = offer.ui.screenCopy;
    body.style.fontSize = '24px';
    const row = document.createElement('div');
    row.className = 'hf-row';
    const carry = offer.canContinue ? button(offer.ui.buttons.continue, 'continue') : null;
    const rest = button(offer.ui.buttons.quit, 'quit');
    if (carry) row.append(carry);
    row.append(rest);
    el.append(body, row);
    modal.show();
    (carry ?? rest).focus();
  }

  return { refresh, el };
}
