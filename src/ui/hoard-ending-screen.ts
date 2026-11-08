/**
 * Hoard ending overlay (DOM), like the succession screen: a quiet look back at what the hoard bought
 * and what the towns became. Copy comes from data (notoriety.json hoardLegacy.ui). Both choices share
 * one style: letting it rest is never demoted, and carrying on is never a scolding.
 */

import type { PlaySession } from '../sim';
import { chooseHoardEnding, hoardEndingView } from '../sim/hoard/ending';

export type HoardEndingScreen = { refresh: () => void; el: HTMLElement };

export function createHoardEndingScreen(session: PlaySession, host: HTMLElement = document.body): HoardEndingScreen {
  const el = document.createElement('div');
  el.id = 'hoard-ending-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'The hoard');
  el.hidden = true;
  Object.assign(el.style, {
    position: 'fixed', inset: '0', display: 'none', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '18px', padding: '24px', boxSizing: 'border-box', textAlign: 'center',
    background: 'rgba(11,13,18,0.9)', color: '#f2e9e4', fontFamily: 'Georgia, serif', zIndex: '50',
  });
  host.appendChild(el);
  /** After "Let it rest" the closing line stays up until dismissed; the world keeps turning behind it. */
  let resting = false;

  const close = (): void => {
    el.hidden = true;
    el.style.display = 'none';
    el.replaceChildren();
    resting = false;
  };

  const button = (label: string, choice: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.choice = choice;
    Object.assign(b.style, {
      font: '18px Georgia, serif', padding: '10px 28px', minWidth: '180px', color: '#f2e9e4',
      background: '#3a3228', border: '1px solid #8a7a68', borderRadius: '4px', cursor: 'pointer',
    });
    b.addEventListener('click', onClick);
    return b;
  };

  const para = (text: string, size: string): HTMLParagraphElement => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { fontSize: size, maxWidth: '640px', margin: '0', lineHeight: '1.45' });
    return p;
  };

  const show = (): void => {
    el.hidden = false;
    el.style.display = 'flex';
  };

  function choose(choice: 'continue' | 'quit'): void {
    const st = session.getState();
    if (!st) return close();
    const res = chooseHoardEnding(st, choice);
    if (!res.ok || choice === 'continue' || !res.restedLine) return close();
    el.replaceChildren(para(res.restedLine, '22px'), button('Close', 'close', close));
    resting = true;
    (el.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  function refresh(): void {
    if (resting) return;
    const st = session.getState();
    const view = st ? hoardEndingView(st) : null;
    if (!view) return close();
    if (!el.hidden) return;
    const title = document.createElement('h2');
    title.textContent = view.title;
    Object.assign(title.style, { fontSize: '28px', fontWeight: 'normal', margin: '0', letterSpacing: '0.04em' });
    const body = document.createElement('div');
    Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' });
    body.append(...view.lines.map((l) => para(l, '19px')));
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' });
    const carry = button(view.buttons.continue, 'continue', () => choose('continue'));
    row.append(carry, button(view.buttons.quit, 'quit', () => choose('quit')));
    el.append(title, body, row);
    show();
    carry.focus();
  }

  return { refresh, el };
}
