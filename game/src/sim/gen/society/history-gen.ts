/** Seeded history beat selection with branching arcs. Pure; no dyn/. */

import type { Rng } from '../../rng';
import type { WorldShape } from '../load/load-world-tables';
import type { HistoryBeat, HistoryTables } from '../load/load-history';
import type { HistoryEvent } from '../world-types';
import type { PersonDraft } from './people';
import { noteUse } from '../../data-use-civic';

function tagsFromBeat(beat: HistoryBeat): string[] {
  const tags = new Set<string>();
  if (beat.kind) tags.add(beat.kind);
  if (beat.arc) tags.add(`arc:${beat.arc}`);
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

/** Weight ×3 when chainsFrom intersects selected ids (branching preference). */
function pickWeighted(
  rng: Rng,
  pool: HistoryBeat[],
  selectedIds: Set<string>,
): HistoryBeat {
  const weights = pool.map((b) => {
    const from = b.chainsFrom ?? [];
    const chained = from.some((id) => selectedIds.has(id));
    return chained ? 3 : 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let ticket = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    ticket -= weights[i]!;
    if (ticket < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/**
 * Pick an ordered history chain for a seed.
 * Root arc + optional rival arc; prefer chainsFrom continuations.
 */
export function generateHistoryEvents(
  rng: Rng,
  tables: HistoryTables,
  people: PersonDraft[],
  shape?: WorldShape,
): HistoryEvent[] {
  const procedural = tables.historyBeats.filter((b) => !b.authoredSeed);
  const pool = procedural.length >= 4 ? procedural : tables.historyBeats;
  if (pool.length === 0) {
    return [
      {
        id: 'hb_empty',
        at: 1,
        tags: ['founding'],
        personIds: people.slice(0, 1).map((p) => p.id),
      },
    ];
  }

  const targetCount = Math.min(pool.length, Math.max(3, rng.int(3, 7)));
  const selected: HistoryBeat[] = [];
  const selectedIds = new Set<string>();

  const roots = pool.filter((b) => (b.chainsFrom ?? []).length === 0);
  const rootPool = roots.length ? roots : pool;
  const first = rootPool[rng.int(0, rootPool.length)]!;
  selected.push(first);
  selectedIds.add(first.id);
  const primaryArc = first.arc;

  const rivalChance = shape?.rivalArcChance ?? 0.35;
  if (rng.next() < rivalChance) {
    const rivals = rootPool.filter(
      (b) => !selectedIds.has(b.id) && (!primaryArc || b.arc !== primaryArc),
    );
    if (rivals.length > 0 && selected.length < targetCount) {
      const second = rivals[rng.int(0, rivals.length)]!;
      selected.push(second);
      selectedIds.add(second.id);
    }
  }

  while (selected.length < targetCount) {
    const tags = collectHistoryTags(selected);
    const nextPool = eligible(pool, selectedIds, tags);
    if (nextPool.length === 0) break;
    const pick = pickWeighted(rng, nextPool, selectedIds);
    selected.push(pick);
    selectedIds.add(pick.id);
  }

  const personIds = people.map((p) => p.id);
  for (const b of selected) noteUse('world/history/historyBeats', b.id);
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

/**
 * The authored cast's own past (beats marked authoredSeed): the home district carries them after the
 * seeded chain, each once its chainsFrom ancestor is in the history (or it has none), so Marta's cold
 * oven or Jonah's chalk map are there to be retold by the people named in them. No rng is drawn.
 */
export function authoredSeedEvents(tables: HistoryTables, events: HistoryEvent[], people: PersonDraft[]): HistoryEvent[] {
  const ids = new Set(events.map((e) => e.id));
  const out: HistoryEvent[] = [];
  const authored = new Set(tables.historyBeats.filter((b) => b.authoredSeed).map((b) => b.id));
  // The cast's beats, and the ones that can only follow theirs (every chainsFrom an authored beat).
  const seeds = tables.historyBeats.filter((b) => !ids.has(b.id) && (b.authoredSeed || (!!b.chainsFrom?.length && b.chainsFrom.every((c) => authored.has(c)))));
  let grew = true;
  while (grew) {
    grew = false;
    for (const beat of seeds) {
      if (ids.has(beat.id) || !chainOk(beat, ids)) continue;
      // Who is in it: anchors whose first name the summary speaks (people.json ids are first_last).
      const named = people.filter((p) => p.anchor && new RegExp(`\\b${p.id.split('_')[0]}\\b`, 'i').test(beat.summary)).map((p) => p.id);
      ids.add(beat.id);
      noteUse('world/history/historyBeats', beat.id);
      out.push({ id: beat.id, at: events.length + out.length + 1, tags: tagsFromBeat(beat), personIds: named });
      grew = true;
    }
  }
  return out;
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
