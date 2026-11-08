/**
 * Hoard ending overlay (DOM), like the succession screen: a quiet look back at what the hoard bought
 * and what the towns became. Copy comes from data (notoriety.json hoardLegacy.ui). Both choices share
 * one style: letting it rest is never demoted, and carrying on is never a scolding.
 */

import type { PlaySession } from '../sim';
import { chooseHoardEnding, hoardEndingView } from '../sim/hoard/ending';
import { choiceButton, createModal } from './kit/modal';

export type HoardEndingScreen = { refresh: () => void; el: HTMLElement };

export function createHoardEndingScreen(session: PlaySession, host: HTMLElement = document.body): HoardEndingScreen {
  const modal = createModal('hoard-ending-screen', 'The hoard', host);
  const el = modal.el;
  /** After "Let it rest" the closing line stays up until dismissed; the world keeps turning behind it. */
  let resting = false;

  const close = (): void => {
    resting = false;
    modal.hide();
  };

  const para = (text: string, size: string): HTMLParagraphElement => {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.fontSize = size;
    return p;
  };

  function choose(choice: 'continue' | 'quit'): void {
    const st = session.getState();
    if (!st) return close();
    const res = chooseHoardEnding(st, choice);
    if (!res.ok || choice === 'continue' || !res.restedLine) return close();
    el.replaceChildren(para(res.restedLine, '22px'), choiceButton('Close', 'close', close));
    resting = true;
    (el.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  function refresh(): void {
    if (resting) return;
    const st = session.getState();
    const view = st ? hoardEndingView(st) : null;
    if (!view) return close();
    if (modal.isOpen()) return;
    const title = document.createElement('h2');
    title.textContent = view.title;
    const body = document.createElement('div');
    Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' });
    body.append(...view.lines.map((l) => para(l, '19px')));
    const row = document.createElement('div');
    row.className = 'hf-row';
    const carry = choiceButton(view.buttons.continue, 'continue', () => choose('continue'));
    row.append(carry, choiceButton(view.buttons.quit, 'quit', () => choose('quit')));
    el.append(title, body, row);
    modal.show();
    carry.focus();
  }

  return { refresh, el };
}
