/**
 * Story: the storyteller's hand, in the open. Who tells the tale (swap them), the phase it is in, tension
 * and points, what is in force and the chain running; fire any incident or start any arc where you stand,
 * end a trouble well or badly, and read what it has told so far.
 */
import { deriveRng } from '../../sim/rng';
import { arcById, chooseStoryteller, fireIncident, incidentById, intensityOf, mercyNow, routPack, startArc, STORY, storyOf, tellerById, TELLERS, tidings } from '../../sim/storyteller';
import type { Tab } from './types';
import { btn, card, el, pill, row } from './ui';

export const storyTab: Tab = {
  id: 'story',
  label: 'Story',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const s = storyOf(st), teller = tellerById(s.teller);
    const here = st.player.townId ?? Object.keys(st.towns ?? {})[0] ?? '';
    const rng = () => deriveRng(st.seed, 'god-story', st.day, s.log.length);

    const tellers = row(...TELLERS.map((t) => btn(t.name, () => { chooseStoryteller(st, t.id); g.commit(`${t.name} tells the tale now`); }, t.id === s.teller ? 'hot' : '')));
    const vitals = card(`${teller.name}, ${teller.title}`,
      el('div', 'dim', teller.blurb), tellers,
      row(el('span', 'dim', 'Phase'), pill(s.phase, 'gold'), el('span', 'dim', `until day ${s.phaseEnds}`), el('span', 'dim', 'Tension'), el('b', '', Math.round(s.tension)), el('span', 'dim', `/ cap ${teller.tensionCap}`)),
      row(el('span', 'dim', 'Points'), el('b', '', s.points.toFixed(1)), el('span', 'dim', 'Intensity'), el('b', '', intensityOf(st).toFixed(2)), mercyNow(st, teller) ? pill('holding back (mercy)', 'ok') : ''),
      row(btn('Tension 0', () => { s.tension = 0; g.commit('Tension cleared'); }), btn('Points max', () => { s.points = STORY.tuning.pointsCap; g.commit('Points filled'); }), btn('Next phase', () => { s.phaseEnds = st.day; g.commit('The phase turns at dawn'); })),
    );

    const afoot = card('In force', ...(s.active.length ? s.active.map((a) => row(
      el('b', '', incidentById(a.id)?.name ?? a.id), el('span', 'dim', `${a.townId} · ends day ${a.ends}${a.family ? ` · ${a.routed ?? 0}/${a.need} ${a.family} packs routed` : ''}`),
      a.family ? btn('Rout one', () => { routPack(st, a.family!, a.townId); g.commit('A pack routed'); }) : '',
      btn('End at dawn', () => { a.ends = st.day; g.commit('Decided at the next dawn'); }),
    )) : [el('div', 'dim', 'Nothing.')]),
      s.arc ? row(pill('arc', 'gold'), el('b', '', arcById(s.arc.id)?.name ?? s.arc.id), el('span', 'dim', `step ${s.arc.step + 1} due day ${s.arc.due} at ${s.arc.townId}`)) : '',
    );

    const fire = card(`Fire at ${here || 'nowhere'}`);
    for (const kind of ['threat', 'twist', 'omen', 'boon'] as const) {
      fire.append(row(el('span', 'dim', kind), ...STORY.incidents.filter((i) => i.kind === kind).map((i) => btn(i.name, () => { fireIncident(st, i, here, rng()); g.commit(`${i.name} at ${here}`); }, kind === 'threat' ? 'danger' : ''))));
    }
    fire.append(row(el('span', 'dim', 'arc'), ...STORY.arcs.map((a) => btn(a.name, () => { g.commit(startArc(st, a, here, rng()) ? `${a.name} begins` : 'An arc is already running'); }, 'hot'))));

    const told = card('Told so far', ...s.log.slice(-14).reverse().map((l) => el('div', '', `d${l.day} · ${l.kind} · ${l.id} · ${l.townId}${l.outcome ? ` · ${l.outcome}` : ''}`)));
    const board = card('The board reads', ...tidings(st, here).map((l) => el('div', '', l)));

    const split = el('div', 'g-split');
    const left = el('div'), right = el('div');
    left.append(vitals, afoot, fire);
    right.append(board, told);
    split.append(left, right);
    body.append(split);
  },
};
