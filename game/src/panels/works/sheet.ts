/**
 * The Works sheet: the progression layer in one side sheet. A header with your Era, renown and title; the
 * yards you keep (pick one to look at it from afar); seven tabs (Ages, Yard, Make, Lines, Garage, Roads,
 * War); the last act's line at the foot. Opened with J, the Works chip under the spark bar, the pause
 * menu, or the ring ("The Works" at a hearth, "Contracts" at a board). Every act goes through runAct.
 */
import type { GameContext, SheetDef } from '../../app/contracts';
import { registerDevHook } from '../../app/dev-hooks';
import { parseTargetAction } from '../../sim/play-session/targets';
import { titleOf } from '../../sim/works/arcs';
import { eraRow, ROMAN, townName, worksIfAny } from '../../sim/works/state';
import { button, el } from '../dom';
import { runAct, type WorksUi } from './kit';
import { ensureWorksStyles } from './style';
import { renderAges } from './tab-ages';
import { renderGarage } from './tab-garage';
import { renderLines } from './tab-lines';
import { renderMake } from './tab-make';
import { renderRoads } from './tab-roads';
import { renderWar } from './tab-war';
import { renderYard } from './tab-yard';

export const WORKS_ID = 'works';
export const WORKS_TABS = ['ages', 'yard', 'make', 'lines', 'garage', 'roads', 'war'] as const;
export type WorksTab = (typeof WORKS_TABS)[number];
const TAB_LABEL: Record<WorksTab, string> = { ages: 'Ages', yard: 'Yard', make: 'Make', lines: 'Lines', garage: 'Garage', roads: 'Roads', war: 'War' };
const RENDER: Record<WorksTab, (ui: WorksUi, body: HTMLElement) => void> = {
  ages: renderAges, yard: renderYard, make: renderMake, lines: renderLines, garage: renderGarage, roads: renderRoads, war: renderWar,
};

/** Remembered across openings in one run. */
const memo: { tab: WorksTab; town: string | null } = { tab: 'ages', town: null };

export function worksSheet(ctx: GameContext, tab?: WorksTab): SheetDef {
  ensureWorksStyles();
  if (tab) memo.tab = tab;
  else if (!worksIfAny(ctx.session.getState()!)) memo.tab = 'ages';
  let message = '';
  const def: SheetDef = {
    id: WORKS_ID,
    title: 'The Works',
    render(body) {
      const scroll = body.scrollTop;
      body.replaceChildren();
      const st = ctx.session.getState();
      if (!st) return;
      const here = st.player.townId ?? '';
      const w = worksIfAny(st);
      const yards = Object.keys(w?.depots ?? {}).sort();
      const town = memo.town && (yards.includes(memo.town) || memo.town === here) ? memo.town : here;
      memo.town = town;
      const ui: WorksUi = {
        ctx, st, town, here,
        setTown(t) { memo.town = t; def.render(body); },
        setTab(t) { memo.tab = t as WorksTab; def.render(body); },
        run(fn, juice) { return runAct(ctx, fn, juice, (r) => { message = r.line; def.render(body); if (r.line && r.ok) ctx.voice?.tell(r.line.length > 90 ? `${r.line.slice(0, 88)}…` : r.line, 'player'); }); },
        redraw() { def.render(body); },
      };

      const era = eraRow(st);
      const head = el('div', 'hf-works-head');
      head.append(el('strong', '', `Era ${ROMAN[era.era]} · ${era.name}`), el('span', 'hf-small hf-muted', `${w?.renown ?? 0} renown · ${titleOf(st)}`));
      body.append(head);

      const towns = el('div', 'hf-works-towns', undefined, { 'aria-label': 'Your yards' });
      const places = [...new Set([here, ...yards])].filter(Boolean);
      for (const t of places) {
        const b = button(`${t === here ? '⌂ ' : ''}${townName(st, t)}`, () => ui.setTown(t), { cls: t === town ? 'is-on' : '', pressed: t === town });
        towns.append(b);
      }
      if (places.length > 1) body.append(towns);

      const tabs = el('div', 'hf-tabs hf-works-tabs', undefined, { role: 'tablist', 'aria-label': 'Works' });
      for (const id of WORKS_TABS) {
        const b = button(TAB_LABEL[id], () => ui.setTab(id), { cls: id === memo.tab ? 'is-on' : '', id: `works-tab-${id}`, pressed: id === memo.tab });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(id === memo.tab));
        tabs.append(b);
      }
      body.append(tabs);

      const panel = el('div', 'hf-works-page', undefined, { role: 'tabpanel', 'data-tab': memo.tab });
      try { RENDER[memo.tab](ui, panel); } catch (err) {
        console.error(`works tab ${memo.tab} failed`, err);
        panel.append(el('p', 'hf-muted', 'This page would not open.'));
      }
      body.append(panel);
      body.append(el('p', 'hf-note hf-small hf-works-msg', message));
      body.scrollTop = scroll;
    },
  };
  return def;
}

/** Open the sheet when the ring's Works verbs say so (`works.open` at a hearth, `works.open.contracts` at a board). */
export function watchWorksVerbs(ctx: GameContext, open: (tab?: WorksTab) => void): () => void {
  return ctx.events.on('act', (e) => {
    const verb = parseTargetAction(e.actionId)?.verb;
    if (!e.outcome?.ok || !verb?.startsWith('works.open')) return;
    open(verb === 'works.open.contracts' ? 'roads' : undefined);
  });
}

// ---- QA hook (window.__hearth.dev.works): open the sheet on a tab, and read the Works state. ----
registerDevHook('works', (ctx) => (tab?: WorksTab) => {
  if (tab) ctx.panels.works?.open(tab);
  const st = ctx.session.getState();
  return st ? (worksIfAny(st) ?? null) : null;
});
