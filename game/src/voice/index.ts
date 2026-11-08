/** VOICE area (stub). Owner: the voice agent. Replace everything in src/voice/ — keep attachVoice. See game/README.md. */
import type { GameContext, VoiceApi } from '../app/contracts';

export function attachVoice(_ctx: GameContext): VoiceApi {
  let last = '';
  return {
    say: (_id, line) => { last = line; },
    tell: (text) => { last = text; },
    tip: () => {},
    dawn: async (lines) => { last = lines[lines.length - 1] ?? last; },
    sfx: () => {},
    mood: () => {},
    last: () => last,
  };
}
