/** Patron deals: accept (reward), dawn obligations, breakage, betrayal. Reached only via interactions. */
import { addStock } from '../economy/food-stock';
import { noteUse } from '../data-use-civic';
import { addNotoriety, ensureHoard, notePeakCoin } from '../hoard';
import { clamp01 } from '../hoard/state';
import { enqueueLetter } from '../letters-scale';
import { nudgeDoctrine } from '../doctrine-tick';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { applyObligationEffect, dealDoctrine, doctrineOf, findDeal, patronDoctrineId, patronSeat, patronTable } from './doctrine-link';
import type { PatronDeal, PatronDef } from './types';

const deals = (state: SimState): Record<string, PatronDeal> => (state.patronDeals ??= {});

export function openDeals(state: SimState, patronId: string): string[] {
  const p = patronTable(state)?.patrons.find((x) => x.id === patronId);
  if (!p || ensureHoard(state).notoriety < p.openNotorietyMin) return [];
  return p.deals.map((d) => d.id).filter((id) => deals(state)[id]?.status !== 'active');
}

/** Speaker in the patron's home town (deterministic: first sorted person id). */
function voiceOf(state: SimState, townId: string): string | undefined {
  return Object.keys(state.people).sort().find((id) => state.people[id]!.townId === townId);
}

function word(state: SimState, townId: string, outcomeId: string): void {
  const v = voiceOf(state, townId);
  if (v) enqueueLetter(state, { kind: 'rumor', fromPersonId: v, outcomeId });
}

/** Juice payload: townsfolk where it happened (the seat, or where you are when word reaches you) notice. */
const noticed = (patron: PatronDef, dealId: string, townId: string | undefined) => ({ patronId: patron.id, patronName: patron.name, dealId, townId });

export function acceptDeal(state: SimState, patronId: string, dealId: string): { ok: boolean } {
  const found = findDeal(state, dealId);
  if (!found || found.patron.id !== patronId || !openDeals(state, patronId).includes(dealId)) return { ok: false };
  const { patron, deal } = found;
  noteUse('economy/patrons', patron.id);
  noteUse('economy/patrons', `deal:${deal.id}`);
  const seat = patronSeat(state, patron);
  const offer = deal.offer;
  if (offer.coin) {
    state.player.coin = (state.player.coin ?? 0) + offer.coin;
    notePeakCoin(state);
  }
  if (offer.standing || offer.goods) {
    const town = ((state.towns ??= {})[seat] ??= { id: seat, economyOptIn: false, stock: {}, despair: 0 });
    if (offer.standing) town.standing = clamp01((town.standing ?? 0) + offer.standing);
    for (const g of Object.keys(offer.goods ?? {}).sort()) addStock(state, seat, g, offer.goods![g]!); // food goes to the ledger
  }
  if (offer.travelSafeDays) state.flags.travelSafeDays = ((state.flags.travelSafeDays as number | undefined) ?? 0) + offer.travelSafeDays;
  deals(state)[dealId] = {
    dealId,
    patronId,
    acceptedDay: state.day,
    dueDay: state.day + deal.obligation.dueDays,
    status: 'active',
    reigniteAtAccept: ensureHoard(state).reigniteCount,
    exposureAtAccept: doctrineOf(state, patron)?.exposure ?? 0,
    ...(patronDoctrineId(state, patron) ? { doctrineId: patronDoctrineId(state, patron) } : {}),
  };
  addNotoriety(state, 'gain_patron_deal');
  applyObligationEffect(state, patron, deal, 'accept');
  word(state, seat, 'patron_deal');
  pushJuice(state, 'patron.deal', noticed(patron, dealId, seat));
  return { ok: true };
}

/** Meet an obligation through an interaction (tithe paid from carried coin; guard_caravan is service, no cost). */
export function canFulfilDeal(state: SimState, dealId: string): boolean {
  const d = deals(state)[dealId];
  const found = findDeal(state, dealId);
  if (!d || !found || d.status !== 'active' || !['tithe', 'guard_caravan'].includes(found.deal.obligation.kind)) return false;
  return found.deal.obligation.kind !== 'tithe' || (state.player.coin ?? 0) >= found.deal.obligation.magnitude;
}

export function fulfilDeal(state: SimState, dealId: string): { ok: boolean } {
  if (!canFulfilDeal(state, dealId)) return { ok: false };
  const d = deals(state)[dealId]!;
  const found = findDeal(state, dealId)!;
  if (found.deal.obligation.kind === 'tithe') state.player.coin = (state.player.coin ?? 0) - found.deal.obligation.magnitude;
  d.status = 'fulfilled';
  d.endedDay = state.day;
  const { id: backed, doc } = dealDoctrine(state, found.patron, d);
  if (doc) applyObligationEffect(state, found.patron, found.deal, 'fulfil', backed);
  pushJuice(state, 'patron.fulfilled', noticed(found.patron, dealId, patronSeat(state, found.patron)));
  return { ok: true };
}

/** Fires leverageOnBreak once; methods are never disabled. */
export function breakDeal(state: SimState, dealId: string, as: 'broken' | 'betrayed' = 'broken'): void {
  const d = deals(state)[dealId];
  const found = findDeal(state, dealId);
  if (!d || !found || d.status !== 'active') return;
  d.status = as;
  d.endedDay = state.day;
  const lev = found.deal.leverageOnBreak;
  if (lev.notorietyAdd) {
    const h = ensureHoard(state);
    h.notoriety = clamp01(h.notoriety + lev.notorietyAdd);
    state.flags.notoriety = h.notoriety;
  }
  const { id: backed } = dealDoctrine(state, found.patron, d);
  if (lev.doctrineExposureAdd && backed) nudgeDoctrine(state, backed, 'exposure', lev.doctrineExposureAdd);
  if (lev.betrayalSpawn) pushJuice(state, 'notoriety.attractor', { attractorId: lev.betrayalSpawn, dealId });
  pushJuice(state, as === 'broken' ? 'patron.broken' : 'patron.betrayed', noticed(found.patron, dealId, state.player.townId ?? patronSeat(state, found.patron)));
}

export function tickPatronDawn(state: SimState): { due: string[]; broken: string[]; betrayed: string[]; voided: string[] } {
  const out = { due: [] as string[], broken: [] as string[], betrayed: [] as string[], voided: [] as string[] };
  const t = patronTable(state);
  if (!t || !state.patronDeals) return out;
  let letters = 0;
  for (const id of Object.keys(state.patronDeals).sort()) {
    const d = state.patronDeals[id]!;
    const found = findDeal(state, id);
    if (d.status !== 'active' || !found) continue;
    const { doc } = dealDoctrine(state, found.patron, d);
    // Struck with a doctrine of another world (deals travel with you): it waits here, betrayal needs its patron near.
    const away = !!d.doctrineId && !doc;
    if (!away && (!doc || doc.collapsed)) {
      d.status = 'void';
      d.endedDay = state.day;
      out.voided.push(id);
      continue;
    }
    const sour = doc ? Math.max(0, doc.exposure - d.exposureAtAccept) : 0;
    const p = !doc ? 0 : Math.min(1, found.deal.betrayalRisk * t.rules.betrayalDailyScale * (1 + t.rules.lowLegitimacyMul * (1 - doc.legitimacy) + t.rules.sourMul * sour));
    if (deriveRng(state.seed, 'patron', state.day, id).next() < p) {
      breakDeal(state, id, 'betrayed');
      out.betrayed.push(id);
    } else if (state.day >= d.dueDay) {
      out.due.push(id);
      const softKept = found.deal.obligation.kind === 'deny_reignite' && ensureHoard(state).reigniteCount <= d.reigniteAtAccept;
      if (softKept) {
        d.status = 'fulfilled';
        d.endedDay = state.day;
      } else {
        breakDeal(state, id);
        out.broken.push(id);
      }
    } else continue;
    if (letters < t.rules.maxLettersPerDawn) {
      word(state, patronSeat(state, found.patron), d.status === 'fulfilled' ? 'patron_kept' : 'patron_break');
      letters++;
    }
  }
  return out;
}
