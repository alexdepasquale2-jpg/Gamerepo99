/**
 * The company sheet (F20). Two views of one sheet:
 *   town   your builds under way and your workshops in this town, and the plots to let (stake one for a
 *          building with a trade); opened from the noticeboard's "Found a workshop" verb
 *   books  one workshop: the till, takings, wages and how long they are covered, who works there (let go),
 *          who could (hire), take the takings or put coin in the till; opened from "Open the books"
 * Every change goes through sim/economy/workshops; hired and let-go people answer in their own voice.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { BUILDING_BY_ID } from '../sim/economy/build-plans';
import { COMPANY } from '../sim/economy/companies';
import { townEconomyView } from '../sim/economy/economy-view';
import {
  buyMaterials, companyById, companyOnClaim, hire, hireCandidates, letGo, materialsOffer, missingFor, payIn, playerCompanies,
  playerPlans, roomIn, stakeWorkshop, takeTakings, wageCover, workshopKinds, WORKSHOPS,
} from '../sim/economy/workshops';
import { inventoryOf, itemName } from '../sim/goods/inventory';
import { jobOf } from '../sim/goods/jobs';
import { parseTargetAction } from '../sim/play-session/targets';
import { button, el, personName, townNamer } from './dom';

export const COMPANY_ID = 'company';

const lc = (s: string): string => s.toLowerCase();
const cap = (s: string): string => s.replace(/^./, (c) => c.toUpperCase());
const costText = (cost: Record<string, number>): string => Object.entries(cost).map(([i, q]) => `${q} ${lc(itemName(i))}`).join(', ');
const unquote = (line: string): string => line.replace(/^\s*["“]/, '').replace(/["”]\s*$/, '');

export function companySheet(ctx: GameContext, townId: string, companyId?: string): SheetDef {
  const nameOf = townNamer(ctx);
  let viewing = companyId;
  let message = '';

  const changed = (line: string, refreshPlots = false): void => {
    message = line;
    ctx.events.emit('inventory', {});
    if (refreshPlots) ctx.world.refresh('plots');
  };

  const townView = (body: HTMLElement): void => {
    const st = ctx.session.getState()!;
    body.append(el('p', 'hf-small', `Your coin: ${Math.max(0, inventoryOf(st).coin ?? 0)}`));
    const plans = playerPlans(st, townId);
    if (plans.length) {
      body.append(el('h3', 'hf-subhead', 'Your builds'));
      const progress = new Map(townEconomyView(st, townId).plans.map((p) => [p.id, p.progress]));
      for (const p of plans) {
        const def = BUILDING_BY_ID.get(p.kind)!;
        const pct = Math.round((progress.get(p.id) ?? 0) * 100);
        const miss = missingFor(p);
        body.append(el('p', '', `${cap(def.name)}: ${pct}%. ${p.stage === 'gathering' ? `Still needs ${costText(Object.fromEntries(miss.map((m) => [m.itemId, m.qty])))}.` : 'The goods are in; it is going up.'}`));
        if (p.stage === 'gathering') {
          const offer = materialsOffer(st, p);
          const row = el('div', 'hf-sheet-actions');
          row.append(button(offer.length ? `Buy what the town has (${offer.map((o) => `${o.qty} ${lc(itemName(o.itemId))} at ${o.price}c`).join(', ')})` : 'The town has none of it to sell', () => { changed(buyMaterials(st, p.claimId).line, true); def0.render(body); }, { disabled: !offer.length, id: `buy-${p.id}` }));
          body.append(row, el('p', 'hf-muted hf-small', 'Or bring the goods to the plot yourself: hold one and use it there, or "Bring goods" in its ring.'));
        } else body.append(el('p', 'hf-muted hf-small', 'Lend a hand at the plot to raise it sooner.'));
      }
    }
    const mine = playerCompanies(st, townId);
    if (mine.length) {
      body.append(el('h3', 'hf-subhead', 'Your workshops'));
      for (const c of mine) {
        body.append(button(`${c.name}: ${c.workers.length} working, ${Math.floor(c.coin)} coin in the till`, () => { viewing = c.id; message = ''; def0.render(body); }, { id: `books-${c.id}` }));
      }
    }
    body.append(el('h3', 'hf-subhead', 'Plots to let'));
    if (plans.length >= WORKSHOPS.plansPerTown) {
      body.append(el('p', 'hf-muted', 'Finish the build you have going here before you stake another.'));
    } else {
      body.append(el('p', 'hf-muted hf-small', 'Stake a plot by the town and build a workshop with a trade. Once it stands, it is yours: hire people, pay their wages, keep the takings.'));
      for (const k of workshopKinds()) {
        const label = `${cap(k.name)} (${k.jobs.join(', ')}; room for ${k.slots}): ${costText(k.cost)}, ${k.labor} days' work`;
        body.append(button(label, () => {
          const r = stakeWorkshop(st, townId, k.id);
          changed(r.line, r.ok);
          if (r.ok) ctx.voice?.tell(r.line, 'player');
          def0.render(body);
        }, { id: `stake-${k.id}` }));
      }
    }
  };

  const booksView = (body: HTMLElement, id: string): void => {
    const st = ctx.session.getState()!;
    const c = companyById(st, id);
    if (!c) { viewing = undefined; townView(body); return; }
    const def = BUILDING_BY_ID.get(c.kind)!;
    const cover = wageCover(st, c);
    body.append(
      el('p', 'hf-small', `In ${nameOf(c.townId)} since day ${c.founded}. Till: ${Math.floor(c.coin)} coin · your coin: ${Math.max(0, inventoryOf(st).coin ?? 0)}`),
      el('p', 'hf-small', `Takings: ${Math.round(c.yesterday ?? 0)} coin at the last dawn, ${Math.round(c.revenue)} in all. Workers make ${def.jobs.join(', ')} goods here at the workshop's pace.`),
      el('p', `hf-small${cover.dawns < COMPANY.quitAfterUnpaid ? ' hf-glow' : ''}`, cover.perDawn
        ? `Wages: ${cover.perDawn} coin a dawn (${COMPANY.wage} each), from the till and then your coin. Enough for ${Number.isFinite(cover.dawns) ? cover.dawns : 'many'} dawns. Unpaid ${COMPANY.quitAfterUnpaid} dawns, a worker walks out.`
        : 'Nobody works here yet. Hire someone to start the trade.'),
    );
    body.append(el('h3', 'hf-subhead', `Working here (${c.workers.length} of ${def.slots})`));
    for (const w of c.workers) {
      const owed = c.unpaid[w] ?? 0;
      const row = el('div', 'hf-sheet-actions');
      row.append(el('span', '', `${personName(ctx, w)}, ${lc(jobOf(st, w).name)}${owed ? ` (unpaid ${owed} day${owed === 1 ? '' : 's'})` : ''}`));
      row.append(button('Let go', () => {
        const r = letGo(st, c.id, w);
        if (r.ok) ctx.voice?.say(w, unquote(r.line));
        changed(r.ok ? `${personName(ctx, w)} leaves your ${def.name}.` : r.line);
        def0.render(body);
      }, { id: `letgo-${w}` }));
      body.append(row);
    }
    if (!c.workers.length) body.append(el('p', 'hf-muted', 'No one yet.'));
    if (roomIn(c) > 0) {
      const cands = hireCandidates(st, c).slice(0, 5);
      body.append(el('h3', 'hf-subhead', 'Could take the work'));
      for (const p of cands) {
        const job = jobOf(st, p);
        const row = el('div', 'hf-sheet-actions');
        row.append(el('span', '', `${personName(ctx, p)}, ${lc(job.name)}${def.jobs.includes(job.id) ? ' (knows the trade)' : ''}`));
        row.append(button(`Hire (${COMPANY.wage}c a day)`, () => {
          const r = hire(st, c.id, p);
          if (r.ok) ctx.voice?.say(p, unquote(r.line));
          changed(r.ok ? `${personName(ctx, p)} will work your ${def.name}.` : r.line);
          def0.render(body);
        }, { id: `hire-${p}` }));
        body.append(row);
      }
      if (!cands.length) body.append(el('p', 'hf-muted', 'Nobody free in town wants the work right now.'));
    }
    const acts = el('div', 'hf-sheet-actions');
    acts.append(
      button('Take the takings', () => { changed(takeTakings(st, c.id).line); def0.render(body); }, { disabled: c.coin < 1, id: 'takings' }),
      button(`Put ${WORKSHOPS.payInStep} coin in the till`, () => { changed(payIn(st, c.id).line); def0.render(body); }, { disabled: (inventoryOf(st).coin ?? 0) < 1, id: 'pay-in' }),
      button('All your workshops', () => { viewing = undefined; message = ''; def0.render(body); }, { id: 'back' }),
    );
    body.append(acts);
  };

  const def0: SheetDef = {
    id: COMPANY_ID,
    title: companyId ? 'Your workshop' : `Workshops · ${nameOf(townId)}`,
    render(body) {
      body.replaceChildren();
      if (!ctx.session.getState()) { body.append(el('p', 'hf-muted', 'Nothing to show.')); return; }
      if (viewing) booksView(body, viewing); else townView(body);
      body.append(el('p', 'hf-note hf-small', message));
    },
  };
  return def0;
}

/** Open the sheet when the ring's workshop verbs say so (noticeboard: town view; a plot: its books). */
export function watchCompanyVerbs(ctx: GameContext): () => void {
  return ctx.events.on('act', (e) => {
    if (!e.outcome?.ok) return;
    const verb = parseTargetAction(e.actionId)?.verb;
    const st = ctx.session.getState();
    if (!st) return;
    if (verb === 'workshop.found' && e.target.kind === 'board') ctx.panels.company.open(e.target.id);
    else if (verb === 'workshop.books' && e.target.kind === 'plot') {
      const c = companyOnClaim(st, e.target.id);
      const townId = c?.townId ?? st.build?.claims.find((x) => x.id === e.target.id)?.townId ?? st.player.townId;
      if (townId) ctx.panels.company.open(townId, c?.id);
    }
  });
}

// ---- QA hook (window.__hearth.dev.company) ----
registerDevHook('company', (ctx) => (townId?: string, companyId?: string) => {
  const st = ctx.session.getState();
  const t = townId ?? ctx.session.snapshot().townId;
  ctx.panels.company.open(t, companyId);
  return {
    plans: st ? playerPlans(st, t).map((p) => ({ id: p.id, claimId: p.claimId, kind: p.kind, stage: p.stage, have: p.have })) : [],
    companies: st ? playerCompanies(st).map((c) => ({ id: c.id, townId: c.townId, kind: c.kind, workers: c.workers, coin: c.coin, unpaid: c.unpaid })) : [],
  };
});
