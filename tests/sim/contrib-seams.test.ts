import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { registerActionProvider } from '../../src/sim/play-session/action-providers';
import { collectDawnLines, registerDawnLines } from '../../src/sim/dawn-lines';
import { boardPages, registerBoardPage } from '../../src/sim/board-pages';
import { pageOf, RING_PAGE } from '../../src/render/action-ring';

function session(): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: 42, archetypeId: 'marrow' });
  return s;
}

describe('shared seams', () => {
  it('action providers add labelled chips and handle their own acts', () => {
    const seen: string[] = [];
    registerActionProvider({
      id: 'test-provider',
      list: (_s, personId) => (personId === 'marta_ellison' ? [{ id: `test_wave@${personId}`, label: 'Wave' }] : []),
      act: (_s, actionId, log) => {
        if (!actionId.startsWith('test_wave@')) return false;
        seen.push(actionId);
        log.push({ type: 'test.wave' });
        return true;
      },
    });
    const s = session();
    expect(s.listActions()).toContainEqual({ id: 'test_wave@marta_ellison', family: 'deed', label: 'Wave' });
    s.act('test_wave@marta_ellison');
    expect(seen).toEqual(['test_wave@marta_ellison']);
    expect(s.events()).toContainEqual({ type: 'test.wave' });
    registerActionProvider({ id: 'test-provider', list: () => [] });
  });

  it('dawn lines collect from every contributor (the brood overhearing is one)', () => {
    registerDawnLines('test-dawn', () => ['A rooster, late.']);
    expect(collectDawnLines(session().getState()!)).toContain('A rooster, late.');
    registerDawnLines('test-dawn', () => []);
  });

  it('the noticeboard starts with the people and economy pages; new pages append', () => {
    expect(boardPages().slice(0, 2).map((p) => p.id)).toEqual(['needs', 'economy']);
    registerBoardPage({ id: 'test-page', title: 'Test', render: () => ({ lines: ['hello'] }) });
    expect(boardPages().at(-1)!.render(session().getState()!, 'x', (t) => t).lines).toEqual(['hello']);
  });

  it('the ring pages long chip lists with a More… chip', () => {
    const chips = Array.from({ length: 17 }, (_, i) => ({ id: `c${i}@p`, label: `c${i}`, savage: false }));
    const first = pageOf(chips, 0);
    expect(first.chips).toHaveLength(RING_PAGE);
    expect(first.chips.at(-1)!.label).toBe('More… 1/3');
    const last = pageOf(chips, 2);
    expect(last.chips.slice(0, -1).map((c) => c.id)).toEqual(['c14@p', 'c15@p', 'c16@p']);
    expect(last.next).toBe(0);
    expect(pageOf(chips.slice(0, RING_PAGE), 0).chips).toHaveLength(RING_PAGE);
  });
});
