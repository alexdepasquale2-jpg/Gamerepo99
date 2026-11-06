/** Seeded doctrine selection by polity size + shape pressure. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { DoctrineRow, WorldShape } from './load-world-tables';
import type { SettlementGen } from './settlements-gen';

export type DoctrineGen = {
  id: string;
  name: string;
  townId: string;
  blurb?: string;
};

/**
 * Non-empty doctrines drawn from catalog for selected towns.
 * Shape doctrinePressure sets a floor; polity size still scales the ceiling.
 */
export function generateDoctrines(
  rng: Rng,
  settlements: SettlementGen[],
  catalog: DoctrineRow[],
  shape?: WorldShape,
): DoctrineGen[] {
  const ids = new Set(settlements.map((s) => s.id));
  const matching = catalog.filter((d) => ids.has(d.townId));

  const polityTotal = settlements.reduce((n, s) => n + s.politySize, 0);
  let target: number;
  if (polityTotal >= 900) target = matching.length;
  else if (polityTotal >= 500) target = Math.max(1, Math.min(matching.length, 2));
  else target = 1;

  const pressure = shape?.doctrinePressure ?? 1;
  target = Math.max(target, Math.min(matching.length, pressure));

  if (matching.length > 1 && rng.next() < 0.35) {
    target = Math.max(pressure > 1 ? Math.min(pressure, matching.length) : 1, target - 1);
  } else if (matching.length > target && rng.next() < 0.35) {
    target = Math.min(matching.length, target + 1);
  }
  target = Math.max(1, Math.min(matching.length || 1, target));

  if (matching.length === 0) {
    const hub = settlements[settlements.length - 1] ?? settlements[0]!;
    return [
      {
        id: `doctrine_${hub.id}_custom`,
        name: `${hub.name} Compact`,
        townId: hub.id,
        blurb: 'Seeded stand-in until Loom authors a doctrine for this polity.',
      },
    ];
  }

  const shuffled = matching.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  return shuffled.slice(0, target).map((d) => ({
    id: d.id,
    name: d.name,
    townId: d.townId,
    blurb: d.blurb,
  }));
}
