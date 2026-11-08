/** Built-in contributions: the first two noticeboard pages and the brood's overheard lines at dawn. */
import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { economyLines, townEconomyView } from '../economy/economy-view';
import { eavesdropReports } from '../embodiment';
import { townNeeds } from '../goods/town-needs';

registerBoardPage({
  id: 'needs',
  title: 'People',
  render: (s, townId) => {
    const needs = townNeeds(s, townId);
    const lines: string[] = ['What our neighbours need', ''];
    if (!needs.shortages.length) lines.push('The stores are holding. No supply shortage today.');
    for (const n of needs.shortages) lines.push(`• ${n.missing} more: ${n.items.join(' / ')}.${n.tradeable ? ' Sell it to a roadside trader bound here.' : ''}`);
    lines.push('', 'People who could use a hand');
    if (!needs.struggling.length) lines.push('No urgent personal appeals today.');
    for (const p of needs.struggling) lines.push(`• ${p.name ?? p.id}: ${(p.woundId ?? 'spirits low').replace(/_/g, ' ')}. Pitch in at their work, or listen.`);
    lines.push('', 'Bring supplies to a resident: select an item in your satchel, then give, trade or deliver it. The board changes when real stock and people change.');
    return { lines };
  },
});

registerBoardPage({
  id: 'economy',
  title: 'Town economy',
  render: (s, townId, nameOf) => {
    const eco = economyLines(townEconomyView(s, townId), nameOf);
    if (!eco.length) return { lines: ['Nothing is being built or hauled here yet.'] };
    // Two columns, split at a section break near the middle.
    const cut = eco.findIndex((l, i) => i >= eco.length / 2 - 1 && l === '');
    return cut < 0 ? { columns: [eco, []] } : { columns: [eco.slice(0, cut), eco.slice(cut + 1)] };
  },
});

registerDawnLines('brood-eavesdrop', eavesdropReports);
