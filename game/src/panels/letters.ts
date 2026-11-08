/**
 * Letters: the inbox of replies (unread ones marked; opening one reads it), where your own letters are on
 * the road, the rumours in flight, and a desk to write to someone in another town. All local: the sim's
 * letter machinery carries the mail (sim/letters-scale, sim/letter-replies).
 */
import type { GameContext, SheetDef } from '../app/contracts';
import type { SimState } from '../sim/types/runtime';
import { ensureLetters, sendPlayerLetter } from '../sim/letters-scale';
import { inboxEntries, markAllRead, markReplyRead, outgoingLines, unreadReplies } from '../sim/letter-replies';
import { inventoryOf } from '../sim/goods/inventory';
import templates from '../data/dialogue/letters.json';
import { button, el, shieldTyping, townNamer } from './dom';

export const LETTERS_ID = 'letters';

type Template = { id: string; body?: string };

function inFlight(state: SimState, nameOf: (t: string) => string): string[] {
  const ls = ensureLetters(state);
  return ls.flight.filter((f) => f.fromPersonId !== state.player.id).slice(-5).map((f) => {
    const tpl = (templates as { templates: Template[] }).templates.find((t) => t.id === f.templateId);
    const vars: Record<string, string> = {
      fromName: state.people[f.fromPersonId]?.name ?? f.fromPersonId,
      toName: state.people[f.toPersonId]?.name ?? f.toPersonId,
      fromTown: nameOf(f.fromTownId),
    };
    const body = (f.body ?? tpl?.body ?? 'A rumour on the road.').replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? key);
    return `${vars.toName} · ${f.days} dawn${f.days === 1 ? '' : 's'} away\n${body}`;
  });
}

export function lettersSheet(ctx: GameContext): SheetDef {
  const nameOf = townNamer(ctx);
  // Kept across re-renders so a refresh never eats what you were writing.
  let reading: { title: string; body: string } | null = null;
  let to = '';
  let draft = '';
  let result = '';
  const changed = (): void => {
    const st = ctx.session.getState();
    if (st) ctx.ui.hud.letters(unreadReplies(st));
    ctx.events.emit('inventory', {});
  };

  const def: SheetDef = {
    id: LETTERS_ID,
    title: 'Letters',
    render(body) {
      body.replaceChildren();
      shieldTyping(body);
      const st = ctx.session.getState();
      if (!st) return;
      ensureLetters(st);
      const unread = unreadReplies(st);
      const rerender = (): void => def.render(body);

      body.append(el('h3', 'hf-subhead', unread ? `Replies (${unread} unread)` : 'Replies'));
      const inbox = el('div', 'hf-inbox', undefined, { role: 'list', 'aria-label': 'Replies' });
      for (const e of inboxEntries(st).slice(0, 8)) {
        const b = button(`${e.unread ? '● ' : '✉ '}${e.from} · ${e.title} · day ${e.day}`, () => {
          markReplyRead(st, e.id);
          reading = { title: `${e.title}, from ${e.from}`, body: e.body + (e.blessing ? `\n\n(It carries a ${e.blessing}.)` : '') };
          changed();
          rerender();
        }, { cls: e.unread ? 'is-unread' : '', id: `reply-${e.id}` });
        b.setAttribute('role', 'listitem');
        b.setAttribute('aria-label', `${e.unread ? 'Unread reply' : 'Reply'} from ${e.from}`);
        inbox.append(b);
      }
      if (!inbox.childElementCount) inbox.append(el('p', 'hf-muted hf-small', 'No replies yet.'));
      body.append(inbox);
      if (reading) {
        const r = el('div', 'hf-letter-read', undefined, { 'aria-live': 'polite' });
        r.append(el('strong', '', reading.title), el('div', '', reading.body));
        body.append(r);
      }

      const road = [...outgoingLines(st), ...inFlight(st, nameOf)];
      body.append(el('h3', 'hf-subhead', 'On the road'));
      body.append(el('pre', 'hf-pre hf-small', road.join('\n') || 'Nothing on the road.'));

      // The writing desk: someone in another town, a few words, one sheet of stationery.
      body.append(el('h3', 'hf-subhead', 'Write to someone in another town'));
      const select = el('select', 'hf-field', undefined, { 'aria-label': 'Recipient' });
      const people = Object.values(st.people)
        .filter((p) => p.townId && p.townId !== st.player.townId)
        .sort((a, b) => nameOf(a.townId!).localeCompare(nameOf(b.townId!)) || (a.name ?? a.id).localeCompare(b.name ?? b.id));
      for (const p of people) {
        const o = el('option', '', `${p.name ?? p.id} · ${nameOf(p.townId!)}`, { value: p.id });
        select.append(o);
      }
      if (to && people.some((p) => p.id === to)) select.value = to;
      to = select.value;
      select.addEventListener('change', () => { to = select.value; });
      const text = el('textarea', 'hf-field', undefined, { 'aria-label': 'Letter text', maxlength: 500, rows: 5, placeholder: 'Tell them what happened. 500 characters at most.' });
      text.value = draft;
      text.addEventListener('input', () => { draft = text.value; });
      const sheets = inventoryOf(st).letter ?? 0;
      const actions = el('div', 'hf-sheet-actions');
      actions.append(
        button('Send by road', () => {
          result = sendPlayerLetter(st, to, draft);
          if (result.startsWith('Sent')) { draft = ''; ctx.voice?.sfx?.('letter'); }
          changed();
          rerender();
        }, { id: 'letters-send', disabled: !people.length, title: sheets ? `${sheets} sheet(s) of stationery` : 'You need a Letter in your satchel' }),
        button('Mark all read', () => { markAllRead(st); changed(); rerender(); }, { id: 'letters-read-all', disabled: !unread }),
      );
      body.append(select, text, actions, el('p', 'hf-note hf-small', result || `Stationery: ${sheets} sheet${sheets === 1 ? '' : 's'}. Long roads can lose letters; a reply may find its way back.`));
    },
  };
  return def;
}
