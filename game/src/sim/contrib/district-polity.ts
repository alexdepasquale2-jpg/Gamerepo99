/**
 * Districts as polities, on the shared surfaces:
 *  - Dawn tick (late): every neighbouring pair of districts steps (civic/district-relations), leaders'
 *    letters set out and land (civic/district-letters), and a war weighs on the live district (civic/district-war).
 *  - Dawn lines: what came of it for the district you stand in, told by its leader or a resident.
 *  - Ring, on the live district's leader: ask after the neighbours, or spend spark to have them broker
 *    peace in a war, or a trade pact with the warmest neighbour (trust decides whether the far leader agrees).
 */
import { DL, fillIn, LETTER_HOOKS, pickFrom } from '../civic/district-letters';
import { broker, brokerOffer, districtName, DPOL, leaderOfDistrict, liveId, liveLeaderId, liveRelations, otherOf, polityIfAny, registerPolityHooks, tickDistrictRelations } from '../civic/district-relations';
import { tickLiveWar } from '../civic/district-war';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import type { SimState } from '../types/runtime';
import { carrierIn } from '../visitors';

registerPolityHooks(LETTER_HOOKS);
registerDawnTick('late', 'district-polity', (state) => {
  tickDistrictRelations(state);
  tickLiveWar(state);
});

/** Which news is told first when there is more than the dawn has room for. */
const ORDER = ['war', 'truce', 'levy', 'levy_home', 'pact', 'pact_broken', 'letter_in', 'war_food', 'far_war', 'far_truce'];

function districtDawnLines(state: SimState): string[] {
  const news = (polityIfAny(state)?.news ?? []).filter((n) => n.day === state.day);
  if (!news.length) return [];
  const town = state.player.townId;
  const lead = leaderOfDistrict(state, liveId(state));
  const ranked = news.map((n, i) => ({ n, i })).sort((x, y) => ORDER.indexOf(x.n.key) - ORDER.indexOf(y.n.key) || x.i - y.i).slice(0, DPOL.linesPerDawn);
  const out: string[] = [];
  for (const { n, i } of ranked) {
    const key = `${state.day}:${n.key}:${i}`;
    const who = carrierIn(state, town, `dpol:${key}`, lead.personId ? [lead.personId] : []);
    const v: Record<string, string> = { leader: lead.name, ...n.vars, speaker: (who && state.people[who]?.name) || 'A neighbour' };
    if (n.vars.held) v.held = fillIn(pickFrom(state, DL.held[n.vars.held], 'held', key), v);
    if (n.vars.fallen) v.fallen = fillIn(pickFrom(state, DL.fallen[n.vars.fallen], 'fallen', key), v);
    // A filled-in clause may open a sentence ("... with them. we held the field"): capitalise sentence starts.
    const s = fillIn(pickFrom(state, DL.dawn[n.key], 'dawn', key), v).replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
    if (s) out.push(s);
  }
  return out;
}
registerDawnLines('district-polity', districtDawnLines);

// ---------- the ring ----------

/** Only once the realm has had a dawn of polity (reading the ring must not create it). */
const isLiveLeader = (state: SimState, id: string): boolean => !!polityIfAny(state) && liveLeaderId(state) === id;

registerTargetProvider({
  id: 'district-polity',
  kinds: ['person'],
  list(state, target): ProvidedAction[] {
    if (!isLiveLeader(state, target.id)) return [];
    const id = target.id;
    const out: ProvidedAction[] = [{ id: `dpol_ask@${id}`, label: 'Ask after the neighbouring districts', short: 'Envoys', family: 'ask' }];
    const offer = brokerOffer(state);
    if (offer) {
      const other = districtName(state, otherOf(offer.r, liveId(state)));
      const cost = DPOL.broker[offer.kind].spark;
      out.push(offer.kind === 'peace'
        ? { id: `dpol_peace@${id}`, label: `Urge them to make peace with ${other} (${cost} spark)`, short: 'Broker', family: 'deal' }
        : { id: `dpol_pact@${id}`, label: `Urge a trade pact with ${other} (${cost} spark)`, short: 'Broker', family: 'deal' });
    }
    return out;
  },
  act(state, actionId, target): ActOutcome | false {
    const at = actionId.indexOf('@');
    if (at < 0 || !actionId.startsWith('dpol_') || !isLiveLeader(state, target.id)) return false;
    const verb = actionId.slice(0, at), live = liveId(state);
    const lead = leaderOfDistrict(state, live).name;
    if (verb === 'dpol_ask') {
      const relations = liveRelations(state).map((r) => fillIn(DL.relation[r.state] ?? '', { other: districtName(state, otherOf(r, live)) })).join('; ');
      return { ok: true, line: fillIn(pickFrom(state, DL.broker.ask, 'ask', state.day), { leader: lead, relations: `${relations}.` }) };
    }
    const want = verb === 'dpol_peace' ? 'peace' : verb === 'dpol_pact' ? 'pact' : undefined;
    if (!want || brokerOffer(state)?.kind !== want) return { ok: false, line: `${lead} has nothing like that to put their name to now.` };
    const res = broker(state);
    if (!res) return false;
    const v = { leader: lead, other: districtName(state, res.other), otherLeader: leaderOfDistrict(state, res.other).name, cost: res.cost };
    const group = res.refused ?? `${res.kind}_${res.ok ? 'ok' : 'no'}`;
    return { ok: !res.refused, line: fillIn(pickFrom(state, DL.broker[group], 'broker', state.day, group), v), hours: res.refused ? 0 : 1 };
  },
});
