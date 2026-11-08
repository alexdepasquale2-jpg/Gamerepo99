/** The road's end: each way out with its destination and days, walk it or hire one of today's travellers. A side sheet: the world stays in view. */
import type { RoadView } from '../../sim/travel/journey';
import { openMenu, type MenuHandle, type MenuItem } from '../kit/menu';

const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;

export function openRoadMenu(
  townName: string,
  roads: RoadView[],
  io: { nameOf: (townId: string) => string; spark: number; coin: number; onPick: (routeId: string, tradeId?: string) => void; onClose: () => void },
): MenuHandle {
  const items: MenuItem[] = [];
  for (const r of roads) {
    const to = io.nameOf(r.toId);
    items.push({
      id: `walk-${r.routeId}`,
      label: `To ${to}: walk it, ${days(r.walkDays)}`,
      hint: 'On foot. The world goes on while you walk.',
      onPick: () => io.onPick(r.routeId),
    });
    for (const o of r.offers) {
      // Coin you don't have is paid in warmth, two spark a coin.
      const total = o.spark + Math.max(0, o.coin - io.coin) * 2;
      const short = io.spark - total < 1;
      items.push({
        id: `hire-${r.routeId}-${o.tradeId}`,
        label: `  ${o.name}, ${o.roleLabel}, to ${to}: ${days(o.days)} · ${o.spark} spark, ${o.coin} coin`,
        hint: short ? 'You haven’t the warmth to spare.' : o.tellLines.join(' '),
        disabled: short,
        onPick: () => io.onPick(r.routeId, o.tradeId),
      });
    }
  }
  items.push({ id: 'stay', label: 'Stay a while', onPick: io.onClose });
  return openMenu(`${townName}: the road out`, items, {
    id: 'hf-road-menu',
    placement: 'sheet',
    onEscape: io.onClose,
    note: roads.length ? 'Short of coin, they take two spark a coin. Watch their hands, not their words.' : 'No road leaves here.',
  });
}
