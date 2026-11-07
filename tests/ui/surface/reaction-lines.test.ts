import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { SILENT, SURFACED, createBubbleQueue, presentJuice } from '../../../src/ui/surface';

describe('juice coverage', () => {
  it('every pushJuice id in src/sim is surfaced or listed silent', () => {
    const out = execSync(`grep -rhoE "pushJuice\\([a-z]+, '[a-z_.]+'" src/sim || true`, { encoding: 'utf8' });
    const ids = new Set([...out.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]!));
    ids.add('stock.deliver').add('stock.starve').add('route.break');
    const missing = [...ids].filter((id) => !(id in SURFACED) && !SILENT.includes(id));
    expect(missing).toEqual([]);
  });
});

describe('presentJuice', () => {
  it('unspoken reaction -> that person only, with ember tell', () => {
    const p = presentJuice('person.reaction', { personId: 'a', line: 'hm', source: 'unspoken' });
    expect(p).toMatchObject({ personId: 'a', line: 'hm', tell: 'ember', kind: 'line' });
  });
  it('letters and rumors are the recipient line, not a toast', () => {
    expect(presentJuice('letter.deliver', { toPersonId: 'b', body: 'Dear b' })).toMatchObject({ personId: 'b', line: 'Dear b' });
    expect(presentJuice('rumor.spread', { toPersonId: 'c' })?.line).toBeTruthy();
  });
  it('doctrine uses personId; notoriety/theft use a nearby person with a glance', () => {
    expect(presentJuice('doctrine.voice', { personId: 'd', townId: 't' })?.personId).toBe('d');
    const ctx = { nearbyPersonId: () => 'n' };
    for (const id of ['notoriety.rise', 'stash.theft', 'doctrine.collapse']) {
      expect(presentJuice(id, { townId: 't' }, ctx)?.personId).toBe('n');
    }
    expect(presentJuice('stash.theft', {}, ctx)?.tell).toBe('glance');
  });
  it('reignite/kindle are tint events; silent ids present nothing', () => {
    expect(presentJuice('person.reignite', { personId: 'a' })?.kind).toBe('tint');
    expect(presentJuice('packet.emit', {})).toBeNull();
  });
});

describe('bubble queue', () => {
  it('max one bubble per person, queued in order', () => {
    const q = createBubbleQueue(100);
    const mk = (line: string) => ({ kind: 'line' as const, personId: 'a', line, tell: 'none' as const, cue: 'x' });
    q.push(mk('one'));
    q.push(mk('two'));
    expect(q.active().map((b) => b.line)).toEqual(['one']);
    q.tick(101);
    expect(q.active().map((b) => b.line)).toEqual(['two']);
    q.tick(101);
    expect(q.active()).toEqual([]);
  });
});
