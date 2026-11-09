/** Powers: diplomacy between towns (trust, feud, treaties), wars, crafts and creeds. */
import { CREEDS, TECHS, pairKey, strength } from '../../sim/economy/polity';
import type { Treaty } from '../../sim/economy/polity';
import type { Tab } from './types';
import { bar, btn, card, el, num, pill, row, table } from './ui';

export const powersTab: Tab = {
  id: 'powers',
  label: 'Powers',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const p = (st.polity ??= { relations: {}, wars: [], knowledge: {}, tech: {}, faiths: {}, next: 1 });
    const towns = Object.keys(st.towns ?? {}).sort();

    // Relations
    const rels = Object.values(p.relations).sort((a, b) => b.feud - a.feud);
    body.append(card(`Relations · ${rels.length}`, rels.length ? table(rels, [
      { key: 'pair', label: 'Towns', get: (r) => `${r.a} ↔ ${r.b}` },
      { key: 'trust', label: 'Trust', get: (r) => num(r.trust, (n) => { r.trust = n; g.commit('Trust set'); }), sort: (r) => r.trust },
      { key: 'feud', label: 'Feud', get: (r) => num(r.feud, (n) => { r.feud = n; g.commit('Feud set'); }), sort: (r) => r.feud },
      { key: 'fbar', label: '', get: (r) => bar(r.feud / 100, '#d0654f'), sort: (r) => r.feud },
      { key: 'treaty', label: 'Treaty', get: (r) => {
        const s = el('select');
        for (const t of ['none', 'trade', 'alliance']) s.append(new Option(t, t));
        s.value = r.treaty;
        s.addEventListener('change', () => { r.treaty = s.value as Treaty; r.since = st.day; g.commit(`${r.a}–${r.b}: ${s.value}`); });
        return s;
      } },
      { key: 'war', label: '', get: (r) => {
        const live = p.wars.find((w) => w.status === 'active' && pairKey(w.aggressor, w.defender) === pairKey(r.a, r.b));
        return live ? btn('Make peace', () => { live.status = 'ended'; live.winner = live.defender; r.feud = 0; r.lastWar = st.day; g.commit('Peace signed'); })
          : btn('Declare war', () => {
            const [agg, def] = strength(st, r.a) >= strength(st, r.b) ? [r.a, r.b] : [r.b, r.a];
            p.wars.push({ id: `war${p.next++}`, aggressor: agg, defender: def, started: st.day, duration: 20, raids: 0, status: 'active' });
            r.treaty = 'none'; r.lastWar = st.day; g.commit(`${agg} marches on ${def}`);
          }, 'danger');
      } },
    ]) : el('p', 'dim', 'No towns are linked yet. Relations start once roads or borders join them.')));

    // Wars
    const wars = [...p.wars].reverse();
    body.append(card(`Wars · ${wars.filter((w) => w.status === 'active').length} active`, ...(wars.length ? wars.map((w) => row(
      pill(w.status, w.status === 'active' ? 'bad' : ''), el('b', '', `${w.aggressor} → ${w.defender}`),
      el('span', 'dim', `day ${w.started}, ${w.raids} raids${w.winner ? `, ${w.winner} won` : ''}${w.lostTech ? `, lost ${w.lostTech}` : ''}`),
      w.status === 'active' ? el('span', 'dim', 'days left') : '', w.status === 'active' ? num(Math.max(0, w.started + w.duration - st.day), (n) => { w.duration = st.day - w.started + n; g.commit('War length set'); }) : '',
    )) : [el('p', 'dim', 'No wars, ever.')])));

    // Crafts and creeds per town
    const grid = el('div', 'g-grid');
    grid.style.marginTop = '10px';
    for (const id of towns) {
      const known = (p.tech[id] ??= []);
      const techRow = el('div', 'g-row');
      for (const t of TECHS) {
        const has = known.includes(t.id);
        techRow.append(btn(`${has ? '✓ ' : ''}${t.name}`, () => {
          if (has) p.tech[id] = known.filter((x) => x !== t.id); else known.push(t.id);
          g.commit(`${id}: ${has ? 'forgot' : 'learned'} ${t.name}`);
        }, has ? 'hot' : ''));
      }
      const creed = el('select');
      creed.append(new Option('No creed', ''), ...CREEDS.map((c) => new Option(c.name, c.id)));
      creed.value = p.faiths[id]?.creed ?? '';
      creed.addEventListener('change', () => {
        if (!creed.value) delete p.faiths[id]; else p.faiths[id] = { creed: creed.value, founded: st.day, shrine: p.faiths[id]?.shrine ?? 'god' };
        g.commit(`${id} faith: ${creed.value || 'none'}`);
      });
      grid.append(card(id.replace(/_/g, ' '),
        row(el('span', 'dim', 'Strength'), el('b', '', strength(st, id)), el('span', 'dim', 'Knowledge'), num(p.knowledge[id] ?? 0, (n) => { p.knowledge[id] = n; g.commit('Knowledge set'); })),
        row(el('span', 'dim', 'Faith'), creed), el('div', 'dim', 'Crafts (tap to grant or take away)'), techRow));
    }
    body.append(grid);
  },
};
