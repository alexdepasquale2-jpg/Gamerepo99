/** Letters: a kit side sheet (a small local-only writing desk); no network or runtime-generated dialogue. */
import type Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { ensureLetters, sendPlayerLetter } from '../../sim/letters-scale';
import { inboxEntries, markAllRead, markReplyRead, outgoingLines, unreadReplies } from '../../sim/letter-replies';
import templates from '../../data/dialogue/letters.json';
import { createSheet, kitButton, kitEl } from '../../ui/kit/sheet';

export function createCorrespondence(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void) {
  const sheet = createSheet({
    id: 'hf-letters',
    title: 'Letters from the road',
    // Typing a letter must not walk the player or fire hotkeys.
    onClose: () => { if (scene.input.keyboard) scene.input.keyboard.enabled = true; },
  });

  const summary = (state: SimState): string => {
    const ls = ensureLetters(state);
    const notes = outgoingLines(state);
    const flight = ls.flight.filter((f) => f.fromPersonId !== state.player.id).slice(-5).map((f) => {
      const tpl = templates.templates.find((t) => t.id === f.templateId);
      const vars: Record<string, string> = { fromName: state.people[f.fromPersonId]?.name ?? f.fromPersonId, toName: state.people[f.toPersonId]?.name ?? f.toPersonId, fromTown: f.fromTownId };
      const body = (f.body ?? tpl?.body ?? 'A rumour on the road.').replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? key);
      return `${state.people[f.toPersonId]?.name ?? f.toPersonId} · ${f.days} dawns away\n${body}`;
    });
    return [...notes, ...flight].join('\n') || 'No letters yet. A Letter in your satchel is a sheet of stationery.';
  };

  const open = (): void => {
    const state = getState();
    if (!state || sheet.isOpen()) return;
    ensureLetters(state);
    const body = sheet.body;
    body.replaceChildren();
    const inbox = kitEl('div');
    inbox.setAttribute('aria-label', 'Replies');
    const read = kitEl('div', 'hf-read');
    // Replies: unread ones carry a gold marker; opening one reads it.
    const render = (): void => {
      const unread = unreadReplies(state);
      sheet.setTitle(unread ? `Letters from the road (${unread} unread)` : 'Letters from the road');
      inbox.replaceChildren();
      for (const e of inboxEntries(state).slice(0, 6)) {
        const row = kitEl('button', `hf-list-btn${e.unread ? ' is-unread' : ''}`, `${e.unread ? '● ' : '✉ '}${e.from} · ${e.title} · day ${e.day}`);
        row.type = 'button';
        row.setAttribute('aria-label', `${e.unread ? 'Unread reply' : 'Reply'} from ${e.from}`);
        row.onclick = () => { markReplyRead(state, e.id); read.textContent = `${e.title}\n\n${e.body}`; render(); changed(); };
        inbox.append(row);
      }
    };
    render();
    read.textContent = summary(state);
    const label = kitEl('label', 'hf-label', 'Write to someone in another town');
    const select = kitEl('select', 'hf-field');
    select.setAttribute('aria-label', 'Recipient');
    Object.values(state.people).filter((p) => p.townId && p.townId !== state.player.townId).sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.name ?? p.id} — ${p.townId}`; select.append(option);
    });
    const text = kitEl('textarea', 'hf-field');
    text.maxLength = 500;
    text.setAttribute('aria-label', 'Letter text');
    text.placeholder = 'Tell them what happened. 500 characters maximum.';
    text.style.cssText = 'height:6em;margin-top:8px;resize:vertical';
    const result = kitEl('p', 'hf-note');
    body.append(inbox, read, label, select, text, result);
    sheet.foot.hidden = false;
    sheet.foot.replaceChildren(
      kitButton('Send by road', () => { result.textContent = sendPlayerLetter(state, select.value, text.value); read.textContent = summary(state); changed(); }),
      kitButton('Mark all read', () => { markAllRead(state); render(); changed(); }),
      kitButton('Close', () => sheet.close()),
    );
    sheet.open();
    if (scene.input.keyboard) scene.input.keyboard.enabled = false;
  };
  scene.events.once('shutdown', () => sheet.destroy());
  return { open, close: () => sheet.close(), isOpen: () => sheet.isOpen() };
}
