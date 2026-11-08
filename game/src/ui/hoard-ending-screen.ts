/**
 * The hoard ending, on the same modal as succession: a quiet look back at what the hoard bought and
 * what the towns became. Copy comes from data (notoriety.json hoardLegacy.ui). Both choices share one
 * look: letting it rest is never demoted, and carrying on is never a scolding. After "Let it rest" the
 * closing line stays until dismissed; the world keeps turning behind it.
 */
import type { GameContext } from '../app/contracts';
import { chooseHoardEnding, hoardEndingView } from '../sim/hoard/ending';
import { choiceButton, createModal } from './kit/modal';

export type HoardEndingScreen = { refresh: () => void; destroy: () => void };

const para = (text: string, size: string): HTMLParagraphElement => {
  const p = document.createElement('p');
  p.textContent = text;
  p.style.fontSize = size;
  return p;
};

export function createHoardEndingScreen(ctx: GameContext): HoardEndingScreen {
  const session = ctx.session;
  const modal = createModal('hoard-ending-screen', 'The hoard');
  const el = modal.el;
  let resting = false;

  const close = (): void => {
    resting = false;
    modal.hide();
    ctx.actors.player.setFrozen(false);
  };

  function choose(choice: 'continue' | 'quit'): void {
    const st = session.getState();
    if (!st) return close();
    const res = chooseHoardEnding(st, choice);
    ctx.events.emit('inventory', {});
    if (!res.ok || choice === 'continue' || !res.restedLine) return close();
    el.replaceChildren(para(res.restedLine, '22px'), choiceButton('Close', 'close', close));
    resting = true;
    el.querySelector('button')?.focus();
  }

  function refresh(): void {
    if (resting) return;
    const st = session.getState();
    const view = st ? hoardEndingView(st) : null;
    if (!view) {
      if (modal.isOpen()) close();
      return;
    }
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
    el.replaceChildren(title, body, row);
    ctx.interact.close();
    ctx.actors.player.setFrozen(true);
    modal.show();
    carry.focus();
  }

  return {
    refresh,
    destroy() {
      modal.hide();
      el.remove();
    },
  };
}
