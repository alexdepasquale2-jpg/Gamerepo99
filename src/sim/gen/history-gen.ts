/** Seeded history beat selection from world/history tables. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { HistoryBeat, HistoryTables } from './load-history';
import type { HistoryEvent } from './world';
import type { PersonDraft } from './people';

function tagsFromBeat(beat: HistoryBeat): string[] {
  const tags = new Set<string>();
  if (beat.kind) tags.add(beat.kind);
  for (const fx of beat.effects ?? []) {
    if (fx.target === 'town.historyTags' && typeof fx.value === 'string') {
      tags.add(fx.value);
    }
  }
  return [...tags];
}

function collectHistoryTags(selected: HistoryBeat[]): Set<string> {
  const tags = new Set<string>();
  for (const b of selected) {
    for (const t of tagsFromBeat(b)) tags.add(t);
  }
  return tags;
}

function chainOk(beat: HistoryBeat, selectedIds: Set<string>): boolean {
  const from = beat.chainsFrom ?? [];
  if (from.length === 0) return true;
  return from.some((id) => selectedIds.has(id));
}

function preconditionsOk(beat: HistoryBeat, tags: Set<string>): boolean {
  for (const pre of beat.preconditions ?? []) {
    if (pre?.tag && !tags.has(pre.tag)) return false;
  }
  return true;
}

function eligible(
  pool: HistoryBeat[],
  selectedIds: Set<string>,
  tags: Set<string>,
): HistoryBeat[] {
  return pool.filter(
    (b) => !selectedIds.has(b.id) && chainOk(b, selectedIds) && preconditionsOk(b, tags),
  );
}

/**
 * Pick an ordered history chain for a seed.
 * Uses procedural (non-authored) beats first so Ashford anchors stay Task-E optional.
 */
export function generateHistoryEvents(
  rng: Rng,
  tables: HistoryTables,
  people: PersonDraft[],
): HistoryEvent[] {
  const procedural = tables.historyBeats.filter((b) => !b.authoredSeed);
  const pool = procedural.length >= 4 ? procedural : tables.historyBeats;
  if (pool.length === 0) {
    return [{ id: 'hb_empty', at: 1, tags: ['founding'], personIds: people.slice(0, 1).map((p) => p.id) }];
  }

  const targetCount = Math.min(pool.length, Math.max(3, rng.int(3, 7)));
  const selected: HistoryBeat[] = [];
  const selectedIds = new Set<string>();

  const roots = pool.filter((b) => (b.chainsFrom ?? []).length === 0);
  const rootPool = roots.length ? roots : pool;
  const first = rootPool[rng.int(0, rootPool.length)]!;
  selected.push(first);
  selectedIds.add(first.id);

  while (selected.length < targetCount) {
    const tags = collectHistoryTags(selected);
    const nextPool = eligible(pool, selectedIds, tags);
    if (nextPool.length === 0) break;
    const pick = nextPool[rng.int(0, nextPool.length)]!;
    selected.push(pick);
    selectedIds.add(pick.id);
  }

  const personIds = people.map((p) => p.id);
  return selected.map((beat, i) => {
    const sliceEnd = Math.min(personIds.length, 1 + rng.int(0, Math.max(1, personIds.length)));
    return {
      id: beat.id,
      at: i + 1,
      tags: tagsFromBeat(beat),
      personIds: personIds.slice(0, Math.max(1, sliceEnd)),
    };
  });
}

/** True when every beat with chainsFrom has a prior selected ancestor (order-safe). */
export function historyChainCoherent(events: HistoryEvent[], tables: HistoryTables): boolean {
  const byId = new Map(tables.historyBeats.map((b) => [b.id, b]));
  const seen = new Set<string>();
  for (const ev of events) {
    const beat = byId.get(ev.id);
    if (beat && !chainOk(beat, seen)) return false;
    seen.add(ev.id);
  }
  return true;
}
