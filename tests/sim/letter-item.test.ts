import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { addItem } from '../../src/sim/goods/inventory';
import { sealedLetters } from '../../src/sim/goods/instances';
import { lightLantern, lanternLit } from '../../src/sim/goods/item-use';
import { sendPlayerLetter, tickLetters } from '../../src/sim/letters-scale';
import { loadData } from '../../src/sim/load-data';
import { loadState, saveState } from '../../src/sim/save';

describe('letter object + lantern state', () => {
  it('a written letter is an instance with a recipient; delivery removes it', () => {
    const { state } = bootPlayState(7, 'marrow');
    const to = Object.values(state.people).filter((p) => p.townId && p.townId !== state.player.townId).sort((a, b) => a.id.localeCompare(b.id))[0]!;
    addItem(state, 'letter', 1);
    sendPlayerLetter(state, to.id, 'Hello far away');
    expect(sealedLetters(state)).toMatchObject([{ itemId: 'letter', to: to.id }]);
    for (let i = 0; i < 40 && sealedLetters(state).length; i++) { state.day++; tickLetters(state); }
    expect(sealedLetters(state)).toHaveLength(0);
  });
  it('lantern lit flag toggles and persists in save', () => {
    const { state } = bootPlayState(7, 'marrow');
    expect(lanternLit(state, 'b1')).toBe(false);
    expect(lightLantern(state, 'b1')).toMatch(/light/i);
    expect(lanternLit(state, 'b1')).toBe(true);
    const loaded = loadState(JSON.parse(JSON.stringify(saveState(state))), loadData(), 'marrow');
    expect(lanternLit(loaded, 'b1')).toBe(true);
  });
});
