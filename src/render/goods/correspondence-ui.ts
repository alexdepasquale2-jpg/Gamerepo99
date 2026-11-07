/** A small local-only writing desk; no network or runtime-generated dialogue. */
import type Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { ensureLetters, sendPlayerLetter } from '../../sim/letters-scale';
import { inboxEntries, markAllRead, markReplyRead, outgoingLines, unreadReplies } from '../../sim/letter-replies';
import templates from '../../data/dialogue/letters.json';
export function createCorrespondence(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void) {
  let dialog: HTMLDialogElement | undefined;
  const close = () => { dialog?.remove(); dialog = undefined; if (scene.input.keyboard) scene.input.keyboard.enabled = true; };
  const open = () => {
    const state = getState(); if (!state || dialog) return;
    const ls = ensureLetters(state);
    dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(520px,85vw);max-height:80vh;overflow:auto;background:#292017;color:#f4e6c8;border:3px solid #b28b56;padding:22px;font:14px Georgia;';
    const title = document.createElement('h2'); dialog.append(title);
    const inbox = document.createElement('div'); inbox.setAttribute('aria-label', 'Replies'); inbox.style.cssText = 'margin-bottom:8px;';
    dialog.append(inbox);
    const read = document.createElement('div');
    read.style.cssText = 'max-height:160px;overflow:auto;white-space:pre-wrap;padding:10px;background:#17130f;';
    const summary = () => {
      const notes = outgoingLines(state);
      const flight = ls.flight.filter((f) => f.fromPersonId !== state.player.id).slice(-5).map((f) => {
        const tpl = templates.templates.find((t) => t.id === f.templateId);
        const vars: Record<string, string> = { fromName: state.people[f.fromPersonId]?.name ?? f.fromPersonId, toName: state.people[f.toPersonId]?.name ?? f.toPersonId, fromTown: f.fromTownId };
        const body = (f.body ?? tpl?.body ?? 'A rumour on the road.').replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? key);
        return `${state.people[f.toPersonId]?.name ?? f.toPersonId} · ${f.days} dawns away\n${body}`;
      });
      return [...notes, ...flight].join('\n') || 'No letters yet. A Letter in your satchel is a sheet of stationery.';
    };
    // Replies: unread ones carry a gold marker; opening one reads it.
    const render = () => {
      const unread = unreadReplies(state);
      title.textContent = unread ? `Letters from the road (${unread} unread)` : 'Letters from the road';
      inbox.replaceChildren();
      for (const e of inboxEntries(state).slice(0, 6)) {
        const row = document.createElement('button');
        row.textContent = `${e.unread ? '● ' : '✉ '}${e.from} · ${e.title} · day ${e.day}`;
        row.setAttribute('aria-label', `${e.unread ? 'Unread reply' : 'Reply'} from ${e.from}`);
        row.style.cssText = `display:block;width:100%;text-align:left;padding:6px 8px;margin-bottom:4px;cursor:pointer;background:${e.unread ? '#4a3a1c' : '#211a12'};color:${e.unread ? '#ffd877' : '#bba98a'};border:1px solid #b28b56;font:${e.unread ? 'bold ' : ''}13px Georgia;`;
        row.onclick = () => { markReplyRead(state, e.id); read.textContent = `${e.title}\n\n${e.body}`; render(); changed(); };
        inbox.append(row);
      }
    };
    render();
    read.textContent = summary();
    dialog.append(read);
    const label = document.createElement('label'); label.textContent = 'Write to someone in another town'; label.style.cssText = 'display:block;margin:14px 0 6px;'; dialog.append(label);
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Recipient'); select.style.cssText = 'width:100%;padding:7px;';
    Object.values(state.people).filter((p) => p.townId && p.townId !== state.player.townId).sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.name ?? p.id} — ${p.townId}`; select.append(option);
    }); dialog.append(select);
    const text = document.createElement('textarea'); text.maxLength = 500; text.setAttribute('aria-label', 'Letter text'); text.placeholder = 'Tell them what happened. 500 characters maximum.'; text.style.cssText = 'box-sizing:border-box;width:100%;height:90px;margin-top:10px;padding:8px;'; dialog.append(text);
    const result = document.createElement('p'); dialog.append(result);
    const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:8px 14px;margin-right:8px;'; b.onclick = action; dialog!.append(b); };
    button('Send by road', () => { result.textContent = sendPlayerLetter(state, select.value, text.value); read.textContent = summary(); changed(); });
    button('Mark all read', () => { markAllRead(state); render(); changed(); });
    button('Close', close);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    document.body.append(dialog); if (scene.input.keyboard) scene.input.keyboard.enabled = false; dialog.showModal();
  };
  scene.events.once('shutdown', close);
  return { open, close, isOpen: () => !!dialog };
}
