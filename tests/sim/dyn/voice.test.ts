import { describe, expect, it } from 'vitest';
import { assertVoice, interpolateLine, runFabricAssertions } from '../../../src/sim/dyn/voice';

describe('dyn voice', () => {
  it('interpolateLine is deterministic for same opts', () => {
    const a = interpolateLine({ seed: 3, id: 'x', text: 'hello' });
    const b = interpolateLine({ seed: 3, id: 'x', text: 'hello' });
    expect(a).toEqual(b);
  });

  it('assertVoice rejects empty text', () => {
    const r = assertVoice({ text: '  ' });
    expect(r.ok).toBe(false);
    expect(r.violationId).toBe('empty_line');
  });

  it('assertVoice rejects scaffold stub-voice markers', () => {
    const r = assertVoice({ text: 'stub-voice-7-0' });
    expect(r.ok).toBe(false);
    expect(r.violationId).toBe('scaffold_line');
  });

  it('assertVoice accepts a real-looking line', () => {
    expect(assertVoice({ text: 'The loaf is warm.' }).ok).toBe(true);
  });

  it('runFabricAssertions maps list through assertVoice', () => {
    const rs = runFabricAssertions([{ text: 'ok line' }, { text: '' }]);
    expect(rs[0]?.ok).toBe(true);
    expect(rs[1]?.ok).toBe(false);
  });
});
