/** Patron deals: accept (reward), dawn obligations, breakage, betrayal. Reached only via interactions. */
import { addNotoriety, ensureHoard, notePeakCoin } from '../hoard';
import { clamp01 } from '../hoard/state';
import { enqueueLetter } from '../letters-scale';
import { nudgeDoctrine } from '../doctrine-tick';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { applyObligationEffect, doctrineOf, findDeal, patronTable } from './doctrine-link';
import type { PatronDeal } from './types';

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

export function acceptDeal(state: SimState, patronId: string, dealId: string): { ok: boolean } {
  const found = findDeal(state, dealId);
  if (!found || found.patron.id !== patronId || !openDeals(state, patronId).includes(dealId)) return { ok: false };
  const { patron, deal } = found;
  const offer = deal.offer;
  if (offer.coin) {
    state.player.coin = (state.player.coin ?? 0) + offer.coin;
    notePeakCoin(state);
  }
  if (offer.standing || offer.goods) {
    const town = ((state.towns ??= {})[patron.homeTownId] ??= { id: patron.homeTownId, economyOptIn: false, stock: {}, despair: 0 });
    if (offer.standing) town.standing = clamp01((town.standing ?? 0) + offer.standing);
    for (const g of Object.keys(offer.goods ?? {}).sort()) town.stock[g] = (town.stock[g] ?? 0) + offer.goods![g]!;
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
  };
  addNotoriety(state, 'gain_patron_deal');
  applyObligationEffect(state, patron, deal, 'accept');
  word(state, patron.homeTownId, 'patron_deal');
  pushJuice(state, 'patron.deal', { patronId, dealId });
  return { ok: true };
}

/** Meet an obligation through an interaction (tithe paid from carried coin). */
export function fulfilDeal(state: SimState, dealId: string): { ok: boolean } {
  const d = deals(state)[dealId];
  const found = findDeal(state, dealId);
  if (!d || !found || d.status !== 'active' || found.deal.obligation.kind !== 'tithe') return { ok: false };
  const cost = found.deal.obligation.magnitude;
  if ((state.player.coin ?? 0) < cost) return { ok: false };
  state.player.coin = (state.player.coin ?? 0) - cost;
  d.status = 'fulfilled';
  applyObligationEffect(state, found.patron, found.deal, 'fulfil');
  pushJuice(state, 'patron.fulfilled', { patronId: d.patronId, dealId });
  return { ok: true };
}

/** Fires leverageOnBreak once; methods are never disabled. */
export function breakDeal(state: SimState, dealId: string, as: 'broken' | 'betrayed' = 'broken'): void {
  const d = deals(state)[dealId];
  const found = findDeal(state, dealId);
  if (!d || !found || d.status !== 'active') return;
  d.status = as;
  const lev = found.deal.leverageOnBreak;
  if (lev.notorietyAdd) {
    const h = ensureHoard(state);
    h.notoriety = clamp01(h.notoriety + lev.notorietyAdd);
    state.flags.notoriety = h.notoriety;
  }
  if (lev.doctrineExposureAdd) nudgeDoctrine(state, found.patron.doctrineId, 'exposure', lev.doctrineExposureAdd);
  if (lev.betrayalSpawn) pushJuice(state, 'notoriety.attractor', { attractorId: lev.betrayalSpawn, dealId });
  pushJuice(state, as === 'broken' ? 'patron.broken' : 'patron.betrayed', { patronId: d.patronId, dealId });
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
    const doc = doctrineOf(state, found.patron);
    if (!doc || doc.collapsed) {
      d.status = 'void';
      out.voided.push(id);
      continue;
    }
    const sour = Math.max(0, doc.exposure - d.exposureAtAccept);
    const p = Math.min(1, found.deal.betrayalRisk * t.rules.betrayalDailyScale * (1 + t.rules.lowLegitimacyMul * (1 - doc.legitimacy) + t.rules.sourMul * sour));
    if (deriveRng(state.seed, 'patron', state.day, id).next() < p) {
      breakDeal(state, id, 'betrayed');
      out.betrayed.push(id);
    } else if (state.day >= d.dueDay) {
      out.due.push(id);
      const softKept = found.deal.obligation.kind === 'deny_reignite' && ensureHoard(state).reigniteCount <= d.reigniteAtAccept;
      if (softKept) d.status = 'fulfilled';
      else {
        breakDeal(state, id);
        out.broken.push(id);
      }
    } else continue;
    if (letters < t.rules.maxLettersPerDawn) {
      word(state, found.patron.homeTownId, d.status === 'fulfilled' ? 'patron_kept' : 'patron_break');
      letters++;
    }
  }
  return out;
}
