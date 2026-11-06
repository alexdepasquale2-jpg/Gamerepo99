/**
 * Read-only centrality table access (01 §Centrality). Values are prebaked offline
 * (src/sim/social/bake/); runtime never computes betweenness/eigenvector.
 */

import type { SocialGraph } from './social-graph';
import type { CentralityRow, CentralityTable } from './social-types';

const INDEX = new WeakMap<CentralityTable, Map<string, CentralityRow>>();

function index(table: CentralityTable): Map<string, CentralityRow> {
  let m = INDEX.get(table);
  if (!m) {
    m = new Map(table.rows.map((r) => [r.personId, r]));
    INDEX.set(table, m);
  }
  return m;
}

export function getCentrality(table: CentralityTable, personId: string): CentralityRow | undefined {
  return index(table).get(personId);
}

export function isInfluential(table: CentralityTable, personId: string): boolean {
  return getCentrality(table, personId)?.influential === true;
}

/** influential desc → betweenness desc → id asc. Unknown ids rank as plain, betweenness 0. */
function rank(table: CentralityTable, x: string, y: string): number {
  const rx = getCentrality(table, x);
  const ry = getCentrality(table, y);
  const ix = rx?.influential ? 1 : 0;
  const iy = ry?.influential ? 1 : 0;
  if (ix !== iy) return iy - ix;
  const bx = rx?.betweenness ?? 0;
  const by = ry?.betweenness ?? 0;
  if (bx !== by) return by - bx;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Pick a seed target for letters/doctrine/rumor, preferring influential people. */
export function preferInfluential(
  table: CentralityTable,
  candidates: readonly string[],
): string | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((x, y) => rank(table, x, y))[0];
}

/**
 * Next rumor hop (02 §Rumors): unused neighbor, influential sinks first, then
 * highest edge weight, then betweenness, then id (deterministic tie-break).
 */
export function pickRumorNext(
  g: SocialGraph,
  table: CentralityTable,
  from: string,
  used: ReadonlySet<string>,
): string | undefined {
  const bestW = new Map<string, number>();
  for (const n of g.neighbors(from)) {
    if (n.id === from || used.has(n.id)) continue;
    bestW.set(n.id, Math.max(bestW.get(n.id) ?? 0, n.edge.weight));
  }
  let pick: string | undefined;
  for (const [id, w] of bestW) {
    if (pick === undefined) {
      pick = id;
      continue;
    }
    const ip = isInfluential(table, pick) ? 1 : 0;
    const ii = isInfluential(table, id) ? 1 : 0;
    if (ii !== ip) {
      if (ii > ip) pick = id;
      continue;
    }
    const wp = bestW.get(pick)!;
    if (w !== wp) {
      if (w > wp) pick = id;
      continue;
    }
    if (rank(table, id, pick) < 0) pick = id;
  }
  return pick;
}
