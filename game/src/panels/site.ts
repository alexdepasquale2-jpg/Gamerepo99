/**
 * The site's ledger sheet (civic slice 5): who runs a place, its hands and wage, the till, the shelves and
 * the latest of its story. Opened by the one "Ledger" verb at the site in the world, or from the board's
 * Sites tab. When you run the place it is also where you run it: hire, let go, set the wage, stock the
 * shelves from your satchel and sell off them. Every button acts through session.act (sim/contrib/site-verbs),
 * so the sheet changes nothing itself; hands answer in their own voice, as bubbles.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { SITE_KIND_BY_ID, civicIfAny, companyOfSite, siteById, sitesIn, type Site, type SiteEvent } from '../sim/civic/sites';
import {
  DESK, LEDGER_VERB, hireCandidatesFor, isWanted, playerOwns, playerRuns, postRefusal, roomAt, siteForTarget, siteTarget, wageAt,
} from '../sim/civic/site-actions';
import { total } from '../sim/civic/store';
import { BUILDING_BY_ID, PLAYER_OWNER } from '../sim/economy/build-plans';
import { priceAt } from '../sim/goods/deed-goods';
import { inventoryOf, itemName } from '../sim/goods/inventory';
import { jobOf } from '../sim/goods/jobs';
import { parseTargetAction, targetActionId } from '../sim/play-session/targets';
import { registerBoardDecor } from './board';
import { button, el, personName, townNamer } from './dom';
import { ensureSiteStyles } from './site-style';

export const SITE_ID = 'site';

const lc = (s: string): string => s.toLowerCase();
const unquote = (line: string): string => line.replace(/^\s*["“]/, '').replace(/["”]\s*$/, '');
const STATUS: Record<string, string> = { working: 'At work', idle: 'Standing idle', standing: 'Built; nobody trades from it', building: 'Going up', closed: 'Shut' };

/** Small dots for the hands at work (filled) and the room left (hollow). */
export function pips(filled: number, of: number): HTMLElement {
  const row = el('span', 'hf-site-pips', undefined, { 'aria-label': `${filled} of ${of} hands` });
  for (let i = 0; i < Math.max(filled, of); i++) row.append(el('span', `hf-site-pip${i < filled ? '' : ' is-off'}`));
  return row;
}

function eventText(ctx: GameContext, e: SiteEvent): string {
  const who = e.personId === PLAYER_OWNER ? 'You' : e.personId ? personName(ctx, e.personId) : '';
  switch (e.what) {
    case 'founded': return `Founded${who ? ` by ${who === 'You' ? 'you' : who}` : ''}.`;
    case 'manager': return `${who} took the post.`;
    case 'vacant': return `${who} left the post (${e.note ?? 'gone'}). Wanted: a manager.`;
    case 'hired': return `${who} was taken on${e.note === 'you' ? ' by you' : ''}.`;
    case 'quit': return `${who} left (${e.note === 'unfed' ? 'went hungry' : e.note === 'quit' ? 'unpaid' : e.note ?? 'gone'}).`;
    case 'unfed': return `${who} went without bread.`;
    case 'sick': return `${who} fell sick with hunger.`;
    case 'wage': return `The wage went to ${e.note} coin.`;
    case 'closed': return 'It shut.';
  }
  return '';
}

export function siteSheet(ctx: GameContext, siteId: string): SheetDef {
  ensureSiteStyles();
  const nameOf = townNamer(ctx);
  let message = '';

  const act = (verb: string, body: HTMLElement, speaker?: string): void => {
    const st = ctx.session.getState();
    const site = st && siteById(st, siteId);
    const target = st && site ? siteTarget(st, site) : null;
    if (!target) { message = 'There are no books kept here any more.'; def.render(body); return; }
    const actionId = targetActionId(verb, target);
    const out = ctx.session.act(actionId, target);
    const line = out?.line ?? '';
    // A quoted line is the hand's own answer: they say it over their head; the sheet keeps a note.
    const quoted = /^\s*["“]/.test(line);
    const who = speaker ?? (quoted ? site?.workers.find((w) => st?.people[w]) : undefined);
    if (out?.ok && quoted && who) { ctx.voice?.say(who, unquote(line)); message = `${personName(ctx, who)}: ${line}`; } else message = line;
    ctx.voice?.sfx?.(out?.ok ? 'act' : 'refuse');
    ctx.events.emit('act', { actionId, target, ...(out ? { outcome: out } : {}) });
    ctx.events.emit('inventory', {});
    ctx.world.refresh('plots');
    def.render(body);
  };

  const header = (body: HTMLElement, st: NonNullable<ReturnType<typeof ctx.session.getState>>, site: Site): void => {
    const kind = SITE_KIND_BY_ID.get(site.kind)?.name ?? site.kind;
    const owner = site.ownerId === PLAYER_OWNER ? 'you' : site.ownerId ? personName(ctx, site.ownerId) : 'nobody';
    body.append(el('p', 'hf-small', `${kind.replace(/^./, (c) => c.toUpperCase())} in ${nameOf(site.townId)}, since day ${site.founded}. Owned by ${owner}.`));
    body.append(el('p', 'hf-small', `${STATUS[site.status] ?? site.status}.`));
    body.append(el('h3', 'hf-subhead', 'Manager'));
    if (site.managerId) {
      body.append(el('p', '', site.managerId === PLAYER_OWNER ? 'You run it.' : personName(ctx, site.managerId)));
    } else {
      body.append(el('p', 'hf-site-wanted', `WANTED: A MANAGER${site.wantedSince !== undefined ? ` (posted day ${site.wantedSince})` : ''}`));
    }
    if (isWanted(site)) {
      const why = postRefusal(st, site);
      const row = el('div', 'hf-sheet-actions');
      row.append(button("Take the manager's post", () => act('site.take', body), { disabled: !!why, id: 'site-take', ...(why ? { title: why } : {}) }));
      if (why) row.append(el('span', 'hf-small hf-muted', why));
      body.append(row);
    }
  };

  const handsView = (body: HTMLElement, st: NonNullable<ReturnType<typeof ctx.session.getState>>, site: Site, runs: boolean): void => {
    const slots = BUILDING_BY_ID.get(site.building)?.slots ?? 0;
    const cap = site.crewRun ? site.workers.length : Math.max(site.workers.length, playerOwns(site) ? slots : Math.max(0, slots - 1));
    const head = el('h3', 'hf-subhead', `Hands (${site.workers.length}${cap ? ` of ${cap}` : ''})`);
    head.append(pips(site.workers.length, cap));
    body.append(head);
    const c = companyOfSite(st, site);
    for (const w of site.workers) {
      const owed = c?.unpaid[w] ?? 0;
      const row = el('div', 'hf-sheet-actions');
      row.append(el('span', '', `${personName(ctx, w)}, ${lc(jobOf(st, w).name)}${owed ? ` (unpaid ${owed} day${owed === 1 ? '' : 's'})` : ''}`));
      if (runs) row.append(button('Let go', () => act(`site.letgo.${w}`, body, w), { id: `site-letgo-${w}` }));
      body.append(row);
    }
    if (!site.workers.length) body.append(el('p', 'hf-muted', 'No one works here.'));
    if (!runs || site.crewRun) return;
    if (roomAt(st, site) > 0) {
      const cands = hireCandidatesFor(st, site, DESK.hireList);
      body.append(el('h3', 'hf-subhead', 'Could take the work (best fit first)'));
      for (const h of cands) {
        const row = el('div', 'hf-sheet-actions');
        row.append(el('span', '', `${personName(ctx, h.personId)}, ${lc(jobOf(st, h.personId).name)}${h.knowsTrade ? ' (knows the trade)' : ''}`));
        row.append(button(`Hire (${wageAt(st, site)}c a day)`, () => act(`site.hire.${h.personId}`, body, h.personId), { id: `site-hire-${h.personId}` }));
        body.append(row);
      }
      if (!cands.length) body.append(el('p', 'hf-muted', 'Nobody free in town wants the work right now.'));
    } else body.append(el('p', 'hf-muted hf-small', 'No room for another hand.'));
  };

  const moneyView = (body: HTMLElement, st: NonNullable<ReturnType<typeof ctx.session.getState>>, site: Site, runs: boolean): void => {
    body.append(el('h3', 'hf-subhead', 'Wage and till'));
    const wage = wageAt(st, site);
    if (site.crewRun) body.append(el('p', 'hf-small', 'A road crew works for its share of what it brings in, not a wage.'));
    else if (runs) {
      const row = el('div', 'hf-sheet-actions');
      row.append(el('span', 'hf-small', 'Wage a day:'));
      row.append(button('−', () => act(`site.wage.${wage - 1}`, body), { disabled: wage <= DESK.wageMin, id: 'site-wage-down', title: 'Pay less' }));
      row.append(el('span', 'hf-site-wage', String(wage), { id: 'site-wage' }));
      row.append(button('+', () => act(`site.wage.${wage + 1}`, body), { disabled: wage >= DESK.wageMax, id: 'site-wage-up', title: 'Pay more' }));
      body.append(row);
    } else body.append(el('p', 'hf-small', `Wage: ${wage} coin a day.`));
    body.append(el('p', 'hf-small', `Till: ${Math.floor(site.coin)} coin.${runs ? ` Your coin: ${Math.max(0, inventoryOf(st).coin ?? 0)}.` : ''}`));
  };

  const storeView = (body: HTMLElement, st: NonNullable<ReturnType<typeof ctx.session.getState>>, site: Site, runs: boolean): void => {
    const held = Object.keys(site.store.items).filter((i) => total(site.store, i) >= 1).sort();
    const room = Number.isFinite(site.store.capacity) ? ` (${Math.floor(total(site.store))} of ${site.store.capacity})` : '';
    body.append(el('h3', 'hf-subhead', `On the shelves${room}`));
    for (const item of held) {
      const row = el('div', 'hf-sheet-actions');
      const n = Math.floor(total(site.store, item));
      row.append(el('span', '', `${n} ${lc(itemName(item))}`));
      if (runs) row.append(button(`Sell ${Math.min(n, DESK.sellStep)} (${priceAt(st, site.townId, item)}c each)`, () => act(`site.sell.${item}`, body), { id: `site-sell-${item}` }));
      body.append(row);
    }
    if (!held.length) body.append(el('p', 'hf-muted', 'Bare shelves.'));
    if (!runs || site.crewRun) return;
    const carried = Object.entries(inventoryOf(st)).filter(([id, n]) => id !== 'coin' && n >= 1).sort(([a], [z]) => a.localeCompare(z));
    if (!carried.length) return;
    const row = el('div', 'hf-sheet-actions');
    row.append(el('span', 'hf-small', 'Stock from your satchel:'));
    for (const [item, n] of carried) row.append(button(`${Math.floor(n)} ${lc(itemName(item))}`, () => act(`site.stock.${item}`, body), { id: `site-stock-${item}` }));
    body.append(row);
  };

  const newsView = (body: HTMLElement, site: Site): void => {
    const recent = [...site.history].reverse().slice(0, 6).map((e) => `Day ${e.day}: ${eventText(ctx, e)}`).filter((l) => !l.endsWith(': '));
    if (!recent.length) return;
    body.append(el('h3', 'hf-subhead', 'Lately'));
    body.append(el('pre', 'hf-pre', recent.join('\n')));
  };

  const st0 = ctx.session.getState();
  const def: SheetDef = {
    id: SITE_ID,
    title: `${(st0 && siteById(st0, siteId)?.name) ?? 'A site'} · Ledger`,
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      const site = st && siteById(st, siteId);
      if (!st || !site) { body.append(el('p', 'hf-muted', 'There are no books kept here.')); return; }
      const runs = playerRuns(site);
      header(body, st, site);
      handsView(body, st, site, runs);
      moneyView(body, st, site, runs);
      storeView(body, st, site, runs);
      newsView(body, site);
      const acts = el('div', 'hf-sheet-actions');
      const c = companyOfSite(st, site);
      if (playerOwns(site) && c) acts.append(button('Open the books (takings, till)', () => ctx.panels.company.open(site.townId, c.id), { id: 'site-books' }));
      if (runs && !playerOwns(site) && !site.crewRun) acts.append(button('Give up the post', () => act('site.resign', body), { id: 'site-resign' }));
      if (acts.childElementCount) body.append(acts);
      body.append(el('p', 'hf-note hf-small', message));
    },
  };
  return def;
}

/** Open the sheet when the ring's Ledger verb says so. */
export function watchSiteVerbs(ctx: GameContext, open: (siteId: string) => void): () => void {
  return ctx.events.on('act', (e) => {
    if (!e.outcome?.ok || parseTargetAction(e.actionId)?.verb !== LEDGER_VERB) return;
    const st = ctx.session.getState();
    if (!st) return;
    const site = siteForTarget(st, e.target);
    if (site) open(site.id);
  });
}

// ---- The board's Sites tab: one row per site, empty posts first; a row opens its ledger. ----

registerBoardDecor('sites', (ctx, panel, townId) => {
  ensureSiteStyles();
  const st = ctx.session.getState();
  const sites = st ? sitesIn(st, townId) : [];
  if (!st || !sites.length) { panel.append(el('p', 'hf-muted', 'No workplaces here yet. Plots stand empty.')); return; }
  const order = (s: Site): number => (isWanted(s) ? 0 : s.managerId === PLAYER_OWNER ? 1 : s.status === 'working' ? 2 : 3);
  for (const s of [...sites].sort((a, z) => order(a) - order(z) || a.name.localeCompare(z.name))) {
    const kind = SITE_KIND_BY_ID.get(s.kind)?.name ?? s.kind;
    const boss = s.managerId === PLAYER_OWNER ? 'run by you' : s.managerId ? `run by ${personName(ctx, s.managerId)}` : s.crewRun ? 'no crew at work' : '';
    const b = button('', () => ctx.panels.site.open(s.id), { cls: 'hf-site-row', id: `sites-${s.id}` });
    const top = el('span', '', `${s.name} (${kind})`);
    top.append(pips(s.workers.length, s.workers.length));
    b.append(top);
    if (isWanted(s)) b.append(el('span', 'hf-site-wanted hf-small', `Wanted: a manager (posted day ${s.wantedSince ?? s.founded})`));
    b.append(el('span', 'hf-small hf-muted', [STATUS[s.status] ?? s.status, boss, `${s.workers.length} hand${s.workers.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
    panel.append(b);
  }
});

// ---- QA hooks: __hearth.dev.sites(townId?) and __hearth.dev.openSite(id) ----

registerDevHook('sites', (ctx) => (townId?: string) => {
  const st = ctx.session.getState();
  if (!st) return [];
  return sitesIn(st, townId).map((s) => ({
    id: s.id, name: s.name, kind: s.kind, townId: s.townId, status: s.status, managerId: s.managerId ?? null, ownerId: s.ownerId,
    workers: s.workers, wage: wageAt(st, s), coin: Math.floor(s.coin), store: { ...s.store.items }, wanted: isWanted(s),
    target: siteTarget(st, s), runByYou: playerRuns(s),
  }));
});
registerDevHook('openSite', (ctx) => (id?: string) => {
  const st = ctx.session.getState();
  const pick = id ?? (st ? sitesIn(st, ctx.session.snapshot().townId)[0]?.id : undefined);
  if (pick) ctx.panels.site.open(pick);
  return { opened: pick ?? null, news: civicIfAny(st)?.news.filter((n) => n.siteId === pick) ?? [] };
});
