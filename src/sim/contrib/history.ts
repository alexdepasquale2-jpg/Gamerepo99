/**
 * The past, spoken: "Ask about the old days" in the ring of anyone with a beat left to tell, and now
 * and then an old story overheard at dawn. The retelling surfaces as the teller's bubble (history.told).
 * Asking costs no spark; being listened to warms them a touch (askTrustDelta, gentler than a gentle talk).
 */
import { registerDawnLines } from '../dawn-lines';
import { firstTrust } from '../embodiment';
import { VOICE, dawnHistoryLine, hasUntoldBeat, tellNextBeat } from '../history-voice';
import { pushJuice } from '../packets';
import { registerActionProvider } from '../play-session/action-providers';

export const ASK_PAST = 'ask_past';
const PREFIX = `${ASK_PAST}@`;

registerActionProvider({
  id: 'history',
  list: (state, personId) =>
    hasUntoldBeat(state, personId) ? [{ id: PREFIX + personId, label: VOICE.askLabel, family: 'deed' }] : [],
  act: (state, actionId, eventLog, rt) => {
    if (!actionId.startsWith(PREFIX)) return false;
    const personId = actionId.slice(PREFIX.length);
    const told = tellNextBeat(state, personId);
    if (!told) {
      eventLog.push({ type: 'act', methodId: actionId });
      return true;
    }
    const person = state.people[personId]!;
    const ip = rt?.people.get(personId);
    const trust = Math.min(1, Math.max(0, (ip?.trust ?? person.trust ?? firstTrust(state, personId)) + VOICE.askTrustDelta));
    person.trust = trust;
    if (ip) ip.trust = trust;
    pushJuice(state, 'history.told', { personId, line: told.line, beatId: told.beatId });
    eventLog.push({ type: 'history.told', methodId: actionId });
    return true;
  },
});

registerDawnLines('history-retold', (state) => {
  const line = dawnHistoryLine(state);
  return line ? [line] : [];
});
