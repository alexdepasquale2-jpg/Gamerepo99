/** A small local-only writing desk; no network or runtime-generated dialogue. */
import type Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { ensureLetters, sendPlayerLetter } from '../../sim/letters-scale';
import templates from '../../data/dialogue/letters.json';
export function createCorrespondence(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void) {
  let dialog: HTMLDialogElement | undefined;
  const close = () => { dialog?.remove(); dialog = undefined; if (scene.input.keyboard) scene.input.keyboard.enabled = true; };
  const open = () => {
    const state = getState(); if (!state || dialog) return;
    const ls = ensureLetters(state);
    dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(520px,85vw);max-height:80vh;overflow:auto;background:#292017;color:#f4e6c8;border:3px solid #b28b56;padding:22px;font:14px Georgia;';
    const title = document.createElement('h2'); title.textContent = 'Letters from the road'; dialog.append(title);
    const read = document.createElement('div');
    const notes = ls.correspondence ?? [];
    read.style.cssText = 'max-height:160px;overflow:auto;white-space:pre-wrap;padding:10px;background:#17130f;';
    const flight = ls.flight.slice(-5).map((f) => {
      const tpl = templates.templates.find((t) => t.id === f.templateId);
      const vars: Record<string, string> = { fromName: state.people[f.fromPersonId]?.name ?? f.fromPersonId, toName: state.people[f.toPersonId]?.name ?? f.toPersonId, fromTown: f.fromTownId };
      const body = (f.body ?? tpl?.body ?? 'A rumour on the road.').replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? key);
      return `${state.people[f.toPersonId]?.name ?? f.toPersonId} · ${f.days} dawns away\n${body}`;
    });
    read.textContent = [...notes.slice(-8).map((n) => `To ${state.people[n.toPersonId]?.name ?? n.toPersonId} · ${n.status}\n${n.body}`), ...flight].join('\n\n') || 'No letters yet. A Letter in your satchel is a sheet of stationery.';
    dialog.append(read);
    const label = document.createElement('label'); label.textContent = 'Write to someone in another town'; label.style.cssText = 'display:block;margin:14px 0 6px;'; dialog.append(label);
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Recipient'); select.style.cssText = 'width:100%;padding:7px;';
    Object.values(state.people).filter((p) => p.townId && p.townId !== state.player.townId).sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.name ?? p.id} — ${p.townId}`; select.append(option);
    }); dialog.append(select);
    const text = document.createElement('textarea'); text.maxLength = 500; text.setAttribute('aria-label', 'Letter text'); text.placeholder = 'Tell them what happened. 500 characters maximum.'; text.style.cssText = 'box-sizing:border-box;width:100%;height:90px;margin-top:10px;padding:8px;'; dialog.append(text);
    const result = document.createElement('p'); dialog.append(result);
    const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:8px 14px;margin-right:8px;'; b.onclick = action; dialog!.append(b); };
    button('Send by road', () => { result.textContent = sendPlayerLetter(state, select.value, text.value); changed(); });
    button('Close', close);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    document.body.append(dialog); if (scene.input.keyboard) scene.input.keyboard.enabled = false; dialog.showModal();
  };
  scene.events.once('shutdown', close);
  return { open, close, isOpen: () => !!dialog };
}
