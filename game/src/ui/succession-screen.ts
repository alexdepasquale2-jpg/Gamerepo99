/**
 * Succession: the only modal in play (README rule 1). Copy comes from the sim's locked UI; it names
 * the heir when the offer has one. "Carry it on" hands the fire to the heir and the world rebuilds
 * around them; "Let it rest" ends the run, never shamed (both buttons share one look).
 */
import type { GameContext } from '../app/contracts';
import { choiceButton, createModal } from './kit/modal';

export type SuccessionScreen = { refresh: () => void; destroy: () => void };

const para = (text: string, size: string): HTMLParagraphElement => {
  const p = document.createElement('p');
  p.textContent = text;
  p.style.fontSize = size;
  return p;
};

export function createSuccessionScreen(ctx: GameContext, io: { onRested: () => void }): SuccessionScreen {
  const session = ctx.session;
  const modal = createModal('succession-screen', 'Your fire went out');
  const el = modal.el;
  let resting = false;

  const close = (): void => {
    modal.hide();
    ctx.actors.player.setFrozen(false);
  };

  function carry(): void {
    const res = session.chooseSuccession('continue');
    close();
    if (!res.ok) return;
    const st = session.getState();
    ctx.events.emit('state-replaced', {});
    ctx.events.emit('inventory', {});
    if (st?.player.townId) ctx.arriveAt(st.player.townId);
    ctx.autosave();
  }

  function rest(): void {
    const res = session.chooseSuccession('quit');
    if (!res.ok) return close();
    resting = true;
    el.replaceChildren(para('The fire rests. The towns go on without it.', '22px'), choiceButton('Back to the title', 'title', () => {
      resting = false;
      close();
      io.onRested();
    }));
    el.querySelector('button')?.focus();
  }

  function refresh(): void {
    if (resting) return;
    const offer = session.successionOffer();
    if (!offer) {
      if (modal.isOpen()) close();
      return;
    }
    if (modal.isOpen()) return;
    const st = session.getState();
    const heirName = offer.heir ? st?.people[offer.heir.personId]?.name : undefined;
    el.replaceChildren();
    el.append(para(offer.ui.screenCopy, '24px'));
    if (offer.canContinue && offer.heir) {
      const heirLine = para(heirName ? `${heirName} could carry it on.` : 'Someone could carry it on.', '19px');
      heirLine.dataset.heir = offer.heir.personId;
      el.append(heirLine);
    } else if (offer.note) {
      el.append(para(offer.note, '18px'));
    }
    const row = document.createElement('div');
    row.className = 'hf-row';
    const carryBtn = offer.canContinue ? choiceButton(offer.ui.buttons.continue, 'continue', carry) : null;
    const restBtn = choiceButton(offer.ui.buttons.quit, 'quit', rest);
    if (carryBtn) row.append(carryBtn);
    row.append(restBtn);
    el.append(row);
    ctx.interact.close();
    ctx.actors.player.setFrozen(true);
    modal.show();
    (offer.ui.defaultButton === 'quit' ? restBtn : (carryBtn ?? restBtn)).focus();
  }

  return {
    refresh,
    destroy() {
      modal.hide();
      el.remove();
    },
  };
}
