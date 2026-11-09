/**
 * Console: run JavaScript against the live game. In scope: `state` (SimState), `ctx` (GameContext),
 * `session`, `dev` (every registered __hearth dev hook) and `commit(msg)` to redraw after a change.
 */
import type { Tab } from './types';
import { btn, el, row } from './ui';

type Memo = { code: string; out: string[] };
const SAMPLES: [string, string][] = [
  ['Lowest flames', "Object.values(state.people).sort((a,b)=>a.flame-b.flame).slice(0,5).map(p=>`${p.name} ${p.flame}`)"],
  ['Town goods', 'Object.fromEntries(Object.entries(state.villageEconomy?.towns ?? {}).map(([t,l])=>[t,Math.round(Object.values(l.goods).reduce((a,b)=>a+b,0))]))'],
  ['Dev hooks', 'Object.keys(dev)'],
  ['Double every flame', 'for (const p of Object.values(state.people)) p.flame *= 2; commit("doubled"); "done"'],
];

export const consoleTab: Tab = {
  id: 'console',
  label: 'Console',
  render(g, body) {
    const m = (g.memo.console ??= { code: SAMPLES[0]![1], out: [] }) as Memo;
    const ta = el('textarea');
    ta.rows = 5;
    ta.style.width = '100%';
    ta.value = m.code;
    ta.spellcheck = false;
    const out = el('pre');
    out.style.marginTop = '8px';
    const show = (): void => { out.textContent = m.out.slice(-40).join('\n'); };
    const run = (): void => {
      m.code = ta.value;
      const h = (window as unknown as { __hearth?: { dev?: Record<string, unknown> } }).__hearth;
      let res: unknown;
      try {
        // Dev builds only: the console is the point of this tab.
        res = new Function('state', 'ctx', 'session', 'dev', 'commit', `return (${m.code});`)(g.state(), g.ctx, g.ctx.session, h?.dev ?? {}, g.commit);
      } catch {
        try { res = new Function('state', 'ctx', 'session', 'dev', 'commit', m.code)(g.state(), g.ctx, g.ctx.session, h?.dev ?? {}, g.commit); } catch (err) { res = err; }
      }
      let text: string;
      try { text = res instanceof Error ? `✕ ${res.message}` : JSON.stringify(res, null, 2) ?? String(res); } catch { text = String(res); }
      m.out.push(`› ${m.code.split('\n')[0]!.slice(0, 80)}`, text);
      show();
    };
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
    body.append(el('div', 'dim', 'In scope: state, ctx, session, dev, commit(msg). Ctrl+Enter runs.'), ta,
      row(btn('Run', run, 'hot'), btn('Clear output', () => { m.out = []; show(); }), ...SAMPLES.map(([l, c]) => btn(l, () => { ta.value = c; m.code = c; }))), out);
    show();
  },
};
