/** A view of real stock and people, not a second quest currency or completion flag. */
import type { SimState } from '../types/runtime';
import { ITEMS } from './inventory';
export function townNeeds(state: SimState, townId: string) {
  const people = Object.values(state.people).filter((p) => p.townId === townId).sort((a, b) => a.flame - b.flame || a.id.localeCompare(b.id));
  const stock = state.towns?.[townId]?.stock ?? {};
  const resources = [...new Set(ITEMS.items.flatMap((i) => i.economyResourceId ? [i.economyResourceId] : []))];
  const shortages = resources.filter((r) => (stock[r] ?? 0) < ITEMS.deeds.shortageBelow).map((r) => ({
    resource: r,
    missing: Math.ceil(ITEMS.deeds.shortageBelow - (stock[r] ?? 0)),
    items: ITEMS.items.filter((i) => i.economyResourceId === r).map((i) => i.name),
    /** Roadside traders deal in this good, so a wagon can carry it there. */
    tradeable: ITEMS.items.some((i) => i.economyResourceId === r && ITEMS.market.goods.includes(i.id)),
  }));
  return { shortages, struggling: people.filter((p) => p.flame < 50).slice(0, 3), contact: people[0] };
}
