/**
 * Kingdom patrons in play: doctrine voices in a patron's seat broker its deals (hear the offer,
 * accept a deal, deliver on it), and the deal's man comes asking at dawn as the deadline nears or
 * lapses. Accept/deliver chips are catalog interactions (patronAccept / patronFulfil) the generic
 * dispatcher already plays; only "hear" is handled here. Pure + deterministic.
 */
import type { DataTables } from '../load-data';
import { registerDawnLines } from '../dawn-lines';
import { ensureHoard } from '../hoard';
import { pushJuice } from '../packets';
import { canFulfilDeal, findDeal, openDeals, patronTable, patronsBrokeredBy, type DealDef, type PatronDef, type PatronLines } from '../patrons';
import { registerActionProvider, type ProvidedAction } from '../play-session/action-providers';
import type { SimState } from '../types/runtime';

const HEAR = 'hear_';
const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

function pick(arr: string[] | undefined, key: string): string {
  if (!arr?.length) return '';
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length]!;
}

const lines = (state: SimState): PatronLines | undefined => patronTable(state)?.lines;
const short = (p: PatronDef): string => p.shortName ?? p.name;
const terms = (d: DealDef): string => d.terms ?? 'deal';
/** Chip text within SHORT_MAX (16), else the fallback. */
const chip = (text: string, fallback: string): string => (text.length <= 16 ? text : fallback);
/** "The Strand Road Wardens' man" / "The Ashford Mill Trust's man". */
export const patronMan = (p: PatronDef): string => `The ${p.name}${p.name.endsWith('s') ? "'" : "'s"} man`;
const daysLeft = (n: number): string => `${NUM[n] ?? n} day${n === 1 ? '' : 's'}`;

type CatalogRow = { id: string; patronAccept?: string; patronFulfil?: string };
const catalog = (state: SimState): CatalogRow[] =>
  ((state.data as Partial<DataTables> | undefined)?.interactions?.catalog.interactions ?? []) as CatalogRow[];

/** What the patron puts on the table right now, in the broker's words. */
export function offerLine(state: SimState, patron: PatronDef, personId: string): string {
  const L = lines(state);
  if (!L) return '';
  const vars = { patron: patron.name };
  const key = `${state.seed}:${state.day}:${patron.id}:${personId}`;
  if (ensureHoard(state).notoriety < patron.openNotorietyMin) return fill(pick(L.closed, key), vars);
  const open = openDeals(state, patron.id);
  if (!open.length) return fill(pick(L.taken, key), vars);
  const parts = open.map((id) => {
    const deal = patron.deals.find((d) => d.id === id)!;
    const o = deal.offer;
    const got: string[] = [];
    if (o.coin) got.push(fill(L.offerPart.coin ?? '', { n: o.coin }));
    for (const g of Object.keys(o.goods ?? {}).sort()) got.push(fill(L.offerPart.goods ?? '', { n: o.goods![g]!, item: g.replace(/_/g, ' ') }));
    if (o.travelSafeDays) got.push(fill(L.offerPart.travelSafeDays ?? '', { n: o.travelSafeDays }));
    if (o.standing) got.push(L.offerPart.standing ?? '');
    const offer = got.length > 1 ? `${got.slice(0, -1).join(', ')} and ${got.at(-1)}` : (got[0] ?? '');
    const owed = fill(L.obligation[deal.obligation.kind] ?? '', { n: deal.obligation.magnitude, d: deal.obligation.dueDays });
    return fill(L.offerDeal, { offer, owed });
  });
  return fill(L.offer, { ...vars, deals: parts.join(L.offerJoin) });
}

registerActionProvider({
  id: 'patrons',
  list(state, personId) {
    const out: ProvidedAction[] = [];
    const rows = catalog(state);
    for (const patron of patronsBrokeredBy(state, personId)) {
      out.push({ id: `${HEAR}${patron.id}@${personId}`, label: `Hear the ${short(patron)} offer`, short: chip(`${short(patron)} offer`, 'Hear the offer'), family: 'deal' });
      for (const dealId of openDeals(state, patron.id)) {
        const deal = patron.deals.find((d) => d.id === dealId)!;
        for (const r of rows) if (r.patronAccept === dealId) out.push({ id: `${r.id}@${personId}`, label: `Accept the ${short(patron)} deal (${terms(deal)})`, short: chip(`Accept ${terms(deal)}`, 'Accept the deal'), family: 'deal' });
      }
      for (const deal of patron.deals) {
        if (!canFulfilDeal(state, deal.id)) continue;
        for (const r of rows) if (r.patronFulfil === deal.id) out.push({ id: `${r.id}@${personId}`, label: `Deliver on the deal (${terms(deal)})`, short: chip(`Deliver ${terms(deal)}`, 'Deliver on deal'), family: 'deal' });
      }
    }
    return out;
  },
  act(state, actionId, eventLog) {
    if (!actionId.startsWith(HEAR)) return false;
    const at = actionId.indexOf('@');
    const patronId = actionId.slice(HEAR.length, at);
    const personId = actionId.slice(at + 1);
    const patron = patronsBrokeredBy(state, personId).find((p) => p.id === patronId);
    if (at < 0 || !patron) return false;
    const before = state.bus?.lastIds?.length ?? 0;
    pushJuice(state, 'patron.offer', { personId, patronId, townId: state.people[personId]?.townId, line: offerLine(state, patron, personId) });
    for (const type of state.bus?.lastIds?.slice(before) ?? []) eventLog.push({ type, methodId: patronId });
    return true;
  },
});

/** The patron's man at dawn: a deadline coming up, or what became of a deal that just ended. */
export function patronDawnLines(state: SimState): string[] {
  const L = lines(state);
  const t = patronTable(state);
  if (!L || !t || !state.patronDeals) return [];
  const warn = t.rules.warnDays ?? 2;
  const out: string[] = [];
  for (const id of Object.keys(state.patronDeals).sort()) {
    const d = state.patronDeals[id]!;
    const found = findDeal(state, id);
    if (!found) continue;
    const vars = { patron: found.patron.name, patronMan: patronMan(found.patron), terms: terms(found.deal) };
    const key = `${state.seed}:${state.day}:${id}`;
    const left = d.dueDay - state.day;
    if (d.status === 'active') {
      // A deal kept by holding back (no deliver act) is watched, not chased.
      const soft = !catalog(state).some((r) => r.patronFulfil === id);
      if (left > 0 && left <= warn) out.push(fill(pick(soft && L.dueSoft?.length ? L.dueSoft : L.due, key), { ...vars, left: daysLeft(left) }));
      continue;
    }
    if (d.endedDay !== state.day) continue;
    const pool = d.status === 'fulfilled' ? L.kept : d.status === 'broken' ? L.broken : d.status === 'betrayed' ? L.betrayed : L.void;
    out.push(fill(pick(pool, key), vars));
  }
  return out;
}

registerDawnLines('patrons', patronDawnLines);
