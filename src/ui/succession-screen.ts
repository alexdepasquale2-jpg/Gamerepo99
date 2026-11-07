/** Succession overlay (DOM). Copy comes from the sim's locked UI; quitting is never shamed. */

import type { PlaySession } from '../sim';

export type SuccessionScreen = { refresh: () => void; el: HTMLElement };

export function createSuccessionScreen(session: PlaySession, host: HTMLElement = document.body): SuccessionScreen {
  const el = document.createElement('div');
  el.id = 'succession-screen';
  el.setAttribute('role', 'dialog');
  el.hidden = true;
  Object.assign(el.style, {
    position: 'fixed', inset: '0', display: 'none', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '20px', background: 'rgba(11,13,18,0.88)', color: '#f2e9e4',
    fontFamily: 'Georgia, serif', zIndex: '50',
  });
  host.appendChild(el);

  const close = (): void => {
    el.hidden = true;
    el.style.display = 'none';
    el.replaceChildren();
  };

  // Both buttons share one style: quitting is never visually demoted or warned about.
  const button = (label: string, choice: 'continue' | 'quit'): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.choice = choice;
    Object.assign(b.style, {
      font: '18px Georgia, serif', padding: '10px 28px', minWidth: '180px', color: '#f2e9e4',
      background: '#3a3228', border: '1px solid #8a7a68', borderRadius: '4px', cursor: 'pointer',
    });
    b.addEventListener('click', () => {
      session.chooseSuccession(choice);
      close();
    });
    return b;
  };

  function refresh(): void {
    const offer = session.successionOffer();
    if (!offer) return close();
    if (!el.hidden) return;
    const body = document.createElement('p');
    body.textContent = offer.ui.screenCopy;
    body.style.fontSize = '24px';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '16px';
    const carry = offer.canContinue ? button(offer.ui.buttons.continue, 'continue') : null;
    const rest = button(offer.ui.buttons.quit, 'quit');
    if (carry) row.append(carry);
    row.append(rest);
    el.append(body, row);
    el.hidden = false;
    el.style.display = 'flex';
    (carry ?? rest).focus();
  }

  return { refresh, el };
}
