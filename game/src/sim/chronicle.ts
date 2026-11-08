/**
 * The living chronicle: what happens in play becomes history. pushJuice hands every juice id here;
 * notable ones (a person reignited, a death, a doctrine falling or taken over, a succession, a
 * happening, a stolen hoard, a patron's betrayal) append a HistoryEvent to state.history carrying its
 * own summary, town, kind and gist, so history-voice retells it like the old beats: townsfolk and the
 * named know it, the old know everything, each person tells it once. Each kind keeps its newest `keep`.
 * Templates in data/dialogue/chronicle.json. Pure, deterministic (seeded by seed/kind/day/key).
 */
import { trackedTable } from './data-use-people';
import table from '../data/dialogue/chronicle.json';
import { doctrineRow } from './doctrine-tick';
import { prettyTownId } from './map/districts';
import type { HistoryEvent } from './gen/world-types';
import { deriveRng } from './rng';
import type { SimState } from './types/runtime';

type KindRow = { gist: string; summaries: string[] };
type Table = { keep: number; keepByKind?: Record<string, number>; onlyFirstPerPerson: string[]; kinds: Record<string, KindRow>; codas: Record<string, string[]>; events: Record<string, string> };
export const CHRONICLE = trackedTable('dialogue/chronicle', table as unknown as Table, ['kinds', 'codas', 'events', 'keepByKind']);
export const CHRONICLE_TAG = 'chronicle';

type P = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

const title = (id: string): string => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function townName(state: SimState, id: string | undefined): string {
  if (!id) return 'the next town';
  const row = ((state.data as { towns?: { id: string; name?: string }[] } | undefined)?.towns ?? []).find((t) => t.id === id);
  return (row?.name ?? prettyTownId(id)).replace(/\s*\(.*\)\s*$/, '');
}
function personName(state: SimState, id: string | undefined, fallback = 'someone'): string {
  const p = id ? state.people[id] : undefined;
  return (p?.name ?? (id ? title(id) : fallback)).split(' ')[0] ?? fallback;
}
function doctrineName(state: SimState, id: string | undefined): string {
  return (id && doctrineRow(state, id)?.name) || (id ? title(id.replace(/^doctrine_/, '')) : 'old creed');
}
function eventName(state: SimState, id: string | undefined): string {
  if (id && CHRONICLE.events[id]) return CHRONICLE.events[id]!;
  const rows = ((state.data as { events?: { id: string; name?: string }[] } | undefined)?.events) ?? [];
  return `the ${(rows.find((e) => e.id === id)?.name ?? (id ? title(id) : 'strange days')).replace(/^(A|The)\s+/i, '').toLowerCase()}`;
}

type Note = { kind: string; key: string; townId?: string; personIds: string[]; slots: Record<string, string> };

/** What a juice event means for the chronicle (null when it is not history). */
function noteOf(state: SimState, id: string, p: P): Note | null {
  switch (id) {
    case 'person.reignite': {
      const who = str(p.personId);
      if (!who) return null;
      const t = state.people[who]?.townId;
      return { kind: 'reignite', key: who, townId: t, personIds: [who], slots: { name: personName(state, who), town: townName(state, t) } };
    }
    case 'kin.death': {
      const dead = str(p.deadId), teller = str(p.personId), t = str(p.townId);
      if (!dead) return null;
      const name = (str(p.name) ?? title(dead)).split(' ')[0]!;
      return { kind: 'death', key: dead, townId: t, personIds: teller ? [teller] : [], slots: { name, town: townName(state, t), age: 'a good age' } };
    }
    case 'doctrine.collapse': {
      const t = str(p.townId);
      return { kind: 'collapse', key: str(p.doctrineId) ?? 'x', townId: t, personIds: [], slots: { doctrine: doctrineName(state, str(p.doctrineId)), town: townName(state, t) } };
    }
    case 'doctrine.swap': {
      const t = str(p.townId);
      return { kind: 'swap', key: `${str(p.challengerId)}>${str(p.incumbentId)}`, townId: t, personIds: [], slots: { challenger: doctrineName(state, str(p.challengerId)), incumbent: doctrineName(state, str(p.incumbentId)), town: townName(state, t) } };
    }
    case 'succession.carried': {
      const heir = str(p.heirPersonId);
      return { kind: 'succession', key: heir ?? 'heir', townId: heir ? state.people[heir]?.townId : undefined, personIds: heir ? [heir] : [], slots: { heir: personName(state, heir, 'the heir') } };
    }
    case 'happening.start': {
      if (p.source === 'legitimacy' || !str(p.eventId)) return null;
      const t = str(p.townId);
      return { kind: 'happening', key: `${str(p.eventId)}@${t ?? ''}`, townId: t, personIds: [str(p.personId)].filter((x): x is string => !!x), slots: { event: eventName(state, str(p.eventId)), town: townName(state, t) } };
    }
    case 'stash.theft': {
      const t = str(p.townId);
      return { kind: 'theft', key: str(p.siteId) ?? 'stash', townId: t, personIds: [str(p.personId)].filter((x): x is string => !!x), slots: { town: townName(state, t) } };
    }
    case 'patron.betrayed': {
      const t = str(p.townId);
      return { kind: 'betrayal', key: str(p.patronId) ?? 'patron', townId: t, personIds: [], slots: { town: townName(state, t ?? state.player?.townId) } };
    }
    default:
      return null;
  }
}

const fill = (tpl: string, slots: Record<string, string>): string => {
  const out = tpl.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
  return out.charAt(0).toUpperCase() + out.slice(1);
};

/** Juice hook: write notable events into the chronicle. */
export function chronicleJuice(state: SimState, id: string, payload: unknown): void {
  if (typeof state.seed !== 'number' || !state.flags) return;
  const note = noteOf(state, id, (payload ?? {}) as P);
  const row = note ? CHRONICLE.kinds[note.kind] : undefined;
  if (!note || !row?.summaries.length) return;
  const seen = (state.flags.chronicled ??= {}) as Record<string, number>;
  const once = CHRONICLE.onlyFirstPerPerson.includes(note.kind);
  const seenKey = once ? `${note.kind}:${note.key}` : `${note.kind}:${note.key}:${state.day}`;
  if (seen[seenKey] !== undefined) return;
  seen[seenKey] = state.day;
  appendEntry(state, note, row, state.day);
}

/** Write one entry and trim its kind to its newest `keep`. */
function appendEntry(state: SimState, note: Note, row: KindRow, day: number): void {
  const rng = deriveRng(state.seed, 'chronicle', note.kind, note.key, day);
  const at = Math.max(0, ...(state.history ?? []).map((h) => h.at ?? 0)) + 1;
  const entry: HistoryEvent = {
    id: `chr_${note.kind}_${day}_${note.key}`.replace(/[^\w>-]/g, '_'),
    at,
    tags: [CHRONICLE_TAG, note.kind],
    personIds: note.personIds,
    summary: fill(row.summaries[rng.int(0, row.summaries.length)]!, note.slots),
    gist: row.gist.replace(/\{(\w+)\}/g, (m, k: string) => note.slots[k] ?? m),
    kind: note.kind,
    day,
    ...(note.townId ? { townId: note.townId } : {}),
  };
  (state.history ??= []).push(entry);
  // Each kind keeps its own newest few, so common events cannot crowd out rare ones.
  const mine = state.history!.filter((h) => h.tags?.includes(CHRONICLE_TAG) && h.kind === note.kind);
  const keep = CHRONICLE.keepByKind?.[note.kind] ?? CHRONICLE.keep;
  if (mine.length > keep) {
    const drop = new Set(mine.slice(0, mine.length - keep).map((h) => h.id));
    state.history = state.history!.filter((h) => !drop.has(h.id));
  }
}

/**
 * Civic history (civic/founding, the civic dawn tick): a building that went up or a town that grew a tier.
 * Called directly, not through juice, because a generated town's backstory is written at founding with
 * days before the game began. Once per kind and key, like reignites.
 */
export function chronicleCivic(state: SimState, kind: 'raised' | 'tier', key: string, townId: string, slots: Record<string, string>, day = state.day, personIds: string[] = []): void {
  const row = CHRONICLE.kinds[kind];
  if (!row?.summaries.length || typeof state.seed !== 'number') return;
  const seen = ((state.flags ??= {}).chronicled ??= {}) as Record<string, number>;
  const seenKey = `${kind}:${townId}:${key}`;
  if (seen[seenKey] !== undefined) return;
  seen[seenKey] = day;
  appendEntry(state, { kind, key: `${townId}_${key}`, townId, personIds, slots: { town: townName(state, townId), ...slots } }, row, day);
}

/** The coda lines for a chronicle kind (history-voice uses them like the old kinds). */
export const chronicleCodas = (kind: string): string[] => CHRONICLE.codas[kind] ?? [];
