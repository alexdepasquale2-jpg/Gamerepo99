import { ROSTER, attackOf, defOf } from './roster';
import type { BookEntry, BookOfEnds, BuildingKind } from './types';

export function emptyBook(): BookOfEnds {
  return { entries: [], totalDeaths: 0 };
}

export type EndCatalogItem = {
  key: string;
  kind: BuildingKind;
  attackId: string;
  name: string;
  epitaph: string;
  playable: boolean;
};

/** Every unique end the book can hold, including stubbed buildings and swallows. */
export function allEnds(): EndCatalogItem[] {
  const out: EndCatalogItem[] = [];
  for (const def of ROSTER) {
    for (const attack of def.attacks) {
      out.push({
        key: endKey(def.id, attack.id),
        kind: def.id,
        attackId: attack.id,
        name: attack.name,
        epitaph: attack.epitaph,
        playable: def.playable,
      });
    }
    out.push({
      key: endKey(def.id, 'swallow'),
      kind: def.id,
      attackId: 'swallow',
      name: 'Swallowed',
      epitaph: def.swallowEpitaph,
      playable: def.playable,
    });
  }
  return out;
}

export function endKey(kind: BuildingKind, attackId: string): string {
  return `${kind}:${attackId}`;
}

export function describeEnd(kind: BuildingKind, attackId: string): { name: string; epitaph: string } {
  if (attackId === 'swallow') {
    const def = defOf(kind);
    return { name: 'Swallowed', epitaph: def.swallowEpitaph };
  }
  const attack = attackOf(kind, attackId);
  if (!attack) return { name: attackId, epitaph: 'An ending with no name.' };
  return { name: attack.name, epitaph: attack.epitaph };
}

/** Immutable record. The same key increments; a new key is appended. */
export function recordEnd(
  book: BookOfEnds,
  end: { kind: BuildingKind; attackId: string; atMs: number },
): BookOfEnds {
  const described = describeEnd(end.kind, end.attackId);
  const key = endKey(end.kind, end.attackId);
  const entries = book.entries.map((e) => ({ ...e }));
  const idx = entries.findIndex((e) => e.key === key);
  if (idx >= 0) {
    const prev = entries[idx]!;
    entries[idx] = { ...prev, count: prev.count + 1 };
  } else {
    const fresh: BookEntry = {
      key,
      kind: end.kind,
      attackId: end.attackId,
      name: described.name,
      epitaph: described.epitaph,
      count: 1,
      firstAtMs: end.atMs,
    };
    entries.push(fresh);
  }
  return { entries, totalDeaths: book.totalDeaths + 1 };
}

export function serializeBook(book: BookOfEnds): string {
  return JSON.stringify(book);
}

function isKind(value: unknown): value is BuildingKind {
  return typeof value === 'string' && ROSTER.some((d) => d.id === value);
}

export function parseBook(raw: string | null | undefined): BookOfEnds {
  if (!raw) return emptyBook();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyBook();
    const rec = parsed as { entries?: unknown; totalDeaths?: unknown };
    if (!Array.isArray(rec.entries)) return emptyBook();
    const entries: BookEntry[] = [];
    for (const item of rec.entries) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Partial<BookEntry>;
      if (!isKind(e.kind) || typeof e.attackId !== 'string' || typeof e.key !== 'string') continue;
      if (typeof e.epitaph !== 'string' || typeof e.name !== 'string') continue;
      entries.push({
        key: e.key,
        kind: e.kind,
        attackId: e.attackId,
        name: e.name,
        epitaph: e.epitaph,
        count: typeof e.count === 'number' && e.count > 0 ? Math.floor(e.count) : 1,
        firstAtMs: typeof e.firstAtMs === 'number' ? e.firstAtMs : 0,
      });
    }
    const totalDeaths = typeof rec.totalDeaths === 'number' && rec.totalDeaths >= 0 ? Math.floor(rec.totalDeaths) : entries.reduce((s, e) => s + e.count, 0);
    return { entries, totalDeaths };
  } catch {
    return emptyBook();
  }
}
