import { describe, expect, it } from 'vitest';
import { allEnds, emptyBook, endKey, parseBook, recordEnd, serializeBook } from '../../src/home/book';
import { TITLE, TAGLINES } from '../../src/home/copy';
import { playableKinds, rallyTargets, stubKinds } from '../../src/home/roster';

describe('Book of Ends', () => {
  it('uses the stylized title and the three taglines', () => {
    expect(TITLE).toBe('WelCum HoMe');
    expect([...TAGLINES]).toEqual(['DON QUIXOTE WAS RIGHT', 'THEY WANT YOU INSIDE', 'THEY COME WHILE YOU SLEEP']);
  });

  it('records a unique end once, then counts repeats', () => {
    const once = recordEnd(emptyBook(), { kind: 'outhouse', attackId: 'door_jaw', atMs: 10 });
    expect(once.entries).toHaveLength(1);
    expect(once.entries[0]).toMatchObject({ key: 'outhouse:door_jaw', count: 1, firstAtMs: 10 });
    expect(once.totalDeaths).toBe(1);
    const twice = recordEnd(once, { kind: 'outhouse', attackId: 'door_jaw', atMs: 40 });
    expect(twice.entries).toHaveLength(1);
    expect(twice.entries[0]?.count).toBe(2);
    expect(twice.entries[0]?.firstAtMs).toBe(10);
    expect(twice.totalDeaths).toBe(2);
    expect(once.entries[0]?.count).toBe(1);
  });

  it('keeps a second method as its own entry', () => {
    const book = recordEnd(recordEnd(emptyBook(), { kind: 'well', attackId: 'bucket_dunk', atMs: 1 }), {
      kind: 'windmill',
      attackId: 'blade_flail',
      atMs: 2,
    });
    expect(book.entries.map((e) => e.key)).toEqual(['well:bucket_dunk', 'windmill:blade_flail']);
    expect(book.totalDeaths).toBe(2);
  });

  it('accepts a stubbed ending the same way', () => {
    const book = recordEnd(emptyBook(), { kind: 'castle', attackId: 'drawbridge', atMs: 5 });
    expect(book.entries[0]?.epitaph).toContain('drawbridge');
    expect(book.entries[0]?.key).toBe(endKey('castle', 'drawbridge'));
  });

  it('round-trips and refuses garbage', () => {
    const book = recordEnd(emptyBook(), { kind: 'farmhouse', attackId: 'stomp', atMs: 3 });
    expect(parseBook(serializeBook(book))).toEqual(book);
    expect(parseBook(null).entries).toEqual([]);
    expect(parseBook('nope').entries).toEqual([]);
    expect(parseBook('{"entries":[{"kind":"nope"}]}').entries).toEqual([]);
  });

  it('catalogues every building, including the ones still dreaming', () => {
    const keys = allEnds().map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('outhouse:door_jaw');
    expect(keys).toContain('castle:catapult');
    expect(keys).toContain('church:swallow');
    expect(playableKinds()).toEqual(['outhouse', 'well', 'market_stall', 'farmhouse', 'bakery', 'tavern', 'blacksmith', 'windmill']);
    expect(stubKinds().map((d) => d.id)).toEqual(['church', 'bullring', 'aqueduct', 'castle']);
    expect(rallyTargets('church')).toEqual(['market_stall', 'farmhouse']);
  });
});
