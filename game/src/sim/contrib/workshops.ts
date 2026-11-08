/**
 * Player workshops (F20) on the ring, all in the Work and Deal families:
 *   board   Found a workshop / Your workshops          → `workshop.found@board:<townId>` (panels open the company sheet)
 *   plot    your plan gathering: Bring goods, Buy materials, Pull up stakes; building: Lend a hand;
 *           built: Open the books                        → `workshop.<verb>@plot:<claimId>`
 *   person  Hire for your <building> / Let go             → `workshop.hire@<personId>`, `workshop.letgo@<personId>`
 * Wages and walk-outs reach you at dawn through the worker (fallbacks workshop_unpaid / workshop_quit in
 * data/dialogue/surface-fallbacks.json). Logic lives in sim/economy/workshops.ts. Pure: no Phaser/DOM.
 */
import { prettyTownId } from '../map/districts';
import { registerDawnLines } from '../dawn-lines';
import { BUILDING_BY_ID } from '../economy/build-plans';
import { asClause, fallbackLine } from '../fallback-lines';
import { inventoryOf } from '../goods/inventory';
import {
  abandonPlot, bringGoods, buyMaterials, companyHiring, companyOnClaim, employerOf, hire, lendHand, letGo,
  materialsOffer, missingFor, planOnClaim, playerCompanies, playerPlans,
} from '../economy/workshops';
import { registerTargetProvider, type ActOutcome, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import { isGrave } from './target-data';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const act = (verb: string, t: Target, label: string, short: string, family = 'work'): ProvidedAction => ({ id: targetActionId(`workshop.${verb}`, t), label, short, family });
const out = (r: { ok: boolean; line: string }, hours?: number): ActOutcome => ({ ok: r.ok, line: r.line, ...(r.ok && hours ? { hours } : {}) });
const buildingOf = (kind: string): string => BUILDING_BY_ID.get(kind)?.name ?? 'workshop';

registerTargetProvider({
  id: 'workshops-board',
  kinds: ['board'],
  list(state, t) {
    const mine = playerCompanies(state, t.id).length + playerPlans(state, t.id).length > 0;
    return [act('found', t, mine ? 'Your workshops, and plots to let' : 'Found a workshop on a plot to let', mine ? 'Workshops' : 'Found workshop')];
  },
  act(state, actionId, t) {
    if (verbOf(actionId) !== 'workshop.found') return false;
    return state.towns?.[t.id] ? { ok: true } : { ok: false, line: 'No plots are let here.' };
  },
});

registerTargetProvider({
  id: 'workshops-plot',
  kinds: ['plot'],
  list(state, t) {
    if (isGrave(t)) return [];
    const plan = planOnClaim(state, t.id);
    if (plan?.stage === 'gathering') {
      const missing = missingFor(plan);
      const inv = inventoryOf(state);
      const verbs: ProvidedAction[] = [];
      if (missing.some((m) => (inv[m.itemId] ?? 0) > 0)) verbs.push(act('bring', t, 'Bring what you carry for the build', 'Bring goods'));
      const offer = materialsOffer(state, plan);
      if (offer.length) verbs.push(act('buy', t, `Buy materials from the town (${offer.map((o) => o.price).reduce((a, b) => Math.min(a, b))}+ coin each)`, 'Buy materials', 'deal'));
      verbs.push(act('books', t, 'Look over the plan', 'The plan'));
      verbs.push(act('abandon', t, 'Pull up the stakes (take back what you stacked)', 'Pull stakes'));
      return verbs;
    }
    if (plan?.stage === 'building') {
      const done = (state.flags as { workshopHandDay?: number }).workshopHandDay === state.day;
      return [...(done ? [] : [act('hand', t, 'Lend a hand with the building work', 'Lend a hand')]), act('books', t, 'Look over the plan', 'The plan')];
    }
    return companyOnClaim(state, t.id) ? [act('books', t, 'Open the books', 'Open books', 'deal')] : [];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (!verb.startsWith('workshop.')) return false;
    switch (verb) {
      case 'workshop.bring': return out(bringGoods(state, t.id));
      case 'workshop.buy': return out(buyMaterials(state, t.id));
      case 'workshop.hand': return out(lendHand(state, t.id), 4);
      case 'workshop.abandon': return out(abandonPlot(state, t.id));
      case 'workshop.books': return planOnClaim(state, t.id) || companyOnClaim(state, t.id) ? { ok: true } : { ok: false, line: 'These are not your books.' };
      default: return false;
    }
  },
});

registerTargetProvider({
  id: 'workshops-person',
  kinds: ['person'],
  list(state, t) {
    const verbs: ProvidedAction[] = [];
    const mine = employerOf(state, t.id);
    if (mine) verbs.push(act('letgo', t, `Let go from your ${buildingOf(mine.kind)}`, 'Let go', 'deal'));
    const hiring = !mine && companyHiring(state, t.id);
    if (hiring) verbs.push(act('hire', t, `Hire for your ${buildingOf(hiring.kind)} (1 coin a day)`, 'Hire', 'deal'));
    return verbs;
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (verb === 'workshop.hire') {
      const c = companyHiring(state, t.id);
      return c ? out(hire(state, c.id, t.id)) : { ok: false, line: 'You have no workshop here with room.' };
    }
    if (verb === 'workshop.letgo') {
      const c = employerOf(state, t.id);
      return c ? out(letGo(state, c.id, t.id)) : { ok: false, line: 'They do not work for you.' };
    }
    return false;
  },
});

// ---- Dawn: workers tell you about their wages, in their own town or by word from it. ----

const DEFAULT: Record<string, string> = {
  workshop_unpaid: 'no wage came from your {building} this morning.',
  workshop_quit: "there's been no wage from your {building} in {days}. That's the end of it.",
};
const townLabel = (id: string): string => prettyTownId(id);

export function workshopDawnLines(state: SimState): string[] {
  const lines: string[] = [];
  for (const c of playerCompanies(state)) {
    for (const n of c.news ?? []) {
      if (n.day !== state.day) continue;
      const key = n.kind === 'quit' ? 'workshop_quit' : 'workshop_unpaid';
      const slots = { building: buildingOf(c.kind), days: n.days === 1 ? 'a day' : `${n.days} days` };
      // The worker's own wording, seeded per save, day and worker; the DEFAULT only if the key is gone.
      const said = fallbackLine(key, `${state.seed}|${state.day}|${n.personId}`, slots);
      const text = said ? asClause(said) : DEFAULT[key]!.replace(/\{(\w+)\}/g, (_, k: string) => slots[k as keyof typeof slots] ?? '');
      const who = (state.people[n.personId]?.name ?? n.personId).split(' ')[0]!;
      const away = c.townId !== state.player.townId ? `Word from ${townLabel(c.townId)}: ` : '';
      lines.push(`${away}${who} says ${text}`);
    }
  }
  return lines.slice(0, 4);
}

registerDawnLines('workshops', workshopDawnLines);
