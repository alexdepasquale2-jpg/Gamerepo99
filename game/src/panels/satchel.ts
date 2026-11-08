/**
 * The satchel sheet: every stack you carry as a grid with counts; tap one to hold it (tap again to put it
 * away). Each stack's tip tells where its pieces came from (sim/goods/instances: who made it, in which
 * town, on which dawn) and which letters are sealed in the post. Coin shows as the purse line.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { ITEM_BY_ID, listStacks } from '../sim/goods/inventory';
import { playerInstances, sealedLetters } from '../sim/goods/instances';
import { el, personName, townNamer } from './dom';
import { itemIcon } from './icons';

export const SATCHEL_ID = 'satchel';

type Io = { held(): string | null; hold(id: string | null): void };

/** Provenance lines for one held stack. */
export function provenance(ctx: GameContext, itemId: string): string[] {
  const st = ctx.session.getState();
  if (!st) return [];
  const town = townNamer(ctx);
  const lines: string[] = [];
  const made = playerInstances(st, itemId);
  const groups = new Map<string, number>();
  for (const i of made) {
    const key = `${personName(ctx, i.madeBy) === 'you' ? 'Made by you' : `Made by ${personName(ctx, i.madeBy)}`} in ${town(i.townId)}, dawn ${i.dawn}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...groups].slice(0, 5)) lines.push(n > 1 ? `${k} (×${n})` : k);
  if (groups.size > 5) lines.push(`…and ${groups.size - 5} more`);
  if (itemId === 'letter') {
    for (const l of sealedLetters(st)) lines.push(`Sealed to ${personName(ctx, l.to)}: in the post since dawn ${l.dawn}`);
  }
  return lines;
}

const usesOf = (itemId: string): string => {
  const it = ITEM_BY_ID.get(itemId);
  if (!it) return '';
  const u: string[] = [];
  if (it.use?.spark) u.push(`warms you (+${it.use.spark} spark)`);
  if (it.use?.hearthMemory) u.push('a memory to set by a hearth');
  if (it.use?.correspondence) u.push('stationery for a letter');
  if (it.tags.length) u.push(it.tags.join(', '));
  return u.join(' · ');
};

export function satchelSheet(ctx: GameContext, io: Io): SheetDef {
  return {
    id: SATCHEL_ID,
    title: 'Satchel',
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      if (!st) return;
      const stacks = listStacks(st);
      const coin = stacks.find((s) => s.item.id === 'coin')?.qty ?? 0;
      body.append(el('p', 'hf-muted hf-small', `Purse: ${coin} coin`));
      const grid = el('div', 'hf-slots', undefined, { role: 'list', 'aria-label': 'What you carry' });
      const held = io.held();
      for (const s of stacks) {
        if (s.item.id === 'coin') continue;
        const tip = provenance(ctx, s.item.id);
        const b = el('button', 'hf-slot', undefined, {
          type: 'button',
          role: 'listitem',
          'data-item': s.item.id,
          'aria-pressed': String(held === s.item.id),
          title: [`${s.item.name} ×${s.qty}`, ...tip].join('\n'),
        });
        b.append(itemIcon(s.item.id), el('span', 'hf-slot__name', s.item.name), el('span', 'hf-qty', String(s.qty)));
        b.addEventListener('click', () => io.hold(held === s.item.id ? null : s.item.id));
        grid.append(b);
      }
      if (!grid.childElementCount) grid.append(el('span', 'hf-muted', 'Your satchel is empty.'));
      body.append(grid);

      if (held) {
        const it = ITEM_BY_ID.get(held);
        const info = el('div', 'hf-satchel-tip');
        info.append(el('strong', 'hf-glow', `Holding: ${it?.name ?? held}`));
        const uses = usesOf(held);
        if (uses) info.append(el('div', 'hf-small', uses));
        const prov = provenance(ctx, held);
        info.append(el('div', 'hf-small hf-muted', prov.length ? prov.join('\n') : 'Bought or found: no one has put their name to it.'));
        body.append(info);
      }
      const cargo = st.cargo ?? [];
      const town = townNamer(ctx);
      body.append(el('p', 'hf-note hf-small', cargo.length
        ? `Carrying for others: ${cargo.map((c) => `${c.qty} ${ITEM_BY_ID.get(c.itemId)?.name ?? c.itemId} to ${town(c.toTownId)}`).join('; ')}`
        : 'Tap an item to hold it: what you hold adds its uses to anything you act on. Drag one from the hotbar onto a person to give it.'));
    },
  };
}
