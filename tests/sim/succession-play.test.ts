import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim';
import { forceSpark, getSuccessionUi } from '../../src/sim/succession';

describe('succession stub on burnout', () => {
  it('burnout opens succession with locked copy', () => {
    const s = createPlaySession({ mode: 'play', seed: 3, archetypeId: 'ivy_quill' });
    expect(s).not.toBeNull();
    if (!s || !('listActions' in s)) throw new Error('expected play session');
    const play = s as PlaySession;
    play.start();
    forceSpark(play, 0);
    // tick() is a real dawn that recovers spark; a spark-neutral act re-checks succession instead.
    play.act(`approach@${play.listPeople()[0]!.id}`);
    expect(play.snapshot().burnedOut).toBe(true);
    expect(play.events().some((e) => e.type === 'succession.open')).toBe(true);
    const ui = getSuccessionUi(play);
    expect(ui.screenCopy).toBe('Your fire went out. Someone remembers it.');
    expect(ui.buttons.continue).toBe('Carry it on');
    expect(ui.buttons.quit).toBe('Let it rest');
  });

  it('quit copy is never shaming', () => {
    const s = createPlaySession({ mode: 'play', seed: 3, archetypeId: 'ivy_quill' });
    if (!s || !('listActions' in s)) throw new Error('expected play session');
    const play = s as PlaySession;
    play.start();
    forceSpark(play, 0);
    play.tick();
    const ui = getSuccessionUi(play);
    expect(ui.buttons.quit).toBe('Let it rest');
    expect(ui.quitNeverShamed).toBe(true);
    const shameWords = /fail|shame|coward|give up|loser|quitter/i;
    expect(ui.screenCopy).not.toMatch(shameWords);
    expect(ui.buttons.quit).not.toMatch(shameWords);
  });
});
