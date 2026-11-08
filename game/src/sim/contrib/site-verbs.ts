/**
 * Running sites, kept in the world (civic slice 5). The ring offers one verb at a site's plot or a road
 * facility: "Ledger" (`site.ledger@<kind>:<id>`; panels open the site sheet). Everything else happens on
 * that sheet, whose buttons act through session.act with ids the ring never lists, so the ring stays
 * small and the sheet and any test share one path:
 *   site.take / site.resign                       take an empty manager's post, or give it back
 *   site.hire.<personId> / site.letgo.<personId>  hands
 *   site.wage.<n>                                 the wage, from the next dawn
 *   site.stock.<itemId> / site.sell.<itemId>      satchel → shelves; shelves → the town at its price
 * The dawn tick after staffing (`afterStaffing`) makes the dawn keep the player's choices; its news comes
 * through the site's hands as dawn lines. Logic: sim/civic/site-actions.ts. Pure: no Phaser/DOM.
 */
// The civic index registers the staffing tick; load it first so 'site-desk' runs after it whoever imports this.
import '../civic';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { PLAYER_OWNER } from '../economy/build-plans';
import { prettyTownId } from '../map/districts';
import { registerTargetProvider, type ActOutcome } from '../play-session/action-providers';
import { targetActionId } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import { siteById } from '../civic/sites';
import {
  LEDGER_VERB, afterStaffing, deskIfAny, hireHand, letGoHand, playerRuns, resignPost, sellFromStore, setWage, siteForTarget, stockSite, takePost,
  type DeskNews, type DeskResult,
} from '../civic/site-actions';

const verbOf = (actionId: string): string => actionId.slice(0, actionId.indexOf('@'));
const out = (r: DeskResult): ActOutcome => ({ ok: r.ok, line: r.line });

registerTargetProvider({
  id: 'site-ledger',
  kinds: ['plot', 'facility'],
  list(state, t) {
    const site = siteForTarget(state, t);
    // While a place goes up its plan is the thing to look at (workshops' "The plan"); the ledger opens once it stands.
    if (!site || site.status === 'building' || site.status === 'closed') return [];
    return [{ id: targetActionId(LEDGER_VERB, t), label: playerRuns(site) ? `The ledger of ${site.name} (you run it)` : `Read the ledger of ${site.name}`, short: 'Ledger', family: 'deal' }];
  },
  act(state, actionId, t) {
    const verb = verbOf(actionId);
    if (!verb.startsWith('site.')) return false;
    const site = siteForTarget(state, t);
    if (!site) return { ok: false, line: 'There are no books kept here.' };
    const arg = (prefix: string): string => verb.slice(prefix.length);
    if (verb === LEDGER_VERB) return { ok: true };
    if (verb === 'site.take') return out(takePost(state, site.id));
    if (verb === 'site.resign') return out(resignPost(state, site.id));
    if (verb.startsWith('site.hire.')) return out(hireHand(state, site.id, arg('site.hire.')));
    if (verb.startsWith('site.letgo.')) return out(letGoHand(state, site.id, arg('site.letgo.')));
    if (verb.startsWith('site.wage.')) return out(setWage(state, site.id, Number(arg('site.wage.'))));
    if (verb.startsWith('site.stock.')) return out(stockSite(state, site.id, arg('site.stock.')));
    if (verb.startsWith('site.sell.')) return out(sellFromStore(state, site.id, arg('site.sell.')));
    return false;
  },
});

// After civic-sites in the people slot (this module is imported after ../civic in contrib/index).
registerDawnTick('people', 'site-desk', afterStaffing);

// ---- Dawn: the hands tell you how your places went. ----

const firstOf = (state: SimState, id: string | undefined): string | undefined => (id ? state.people[id]?.name?.split(' ')[0] : undefined);

function deskLine(state: SimState, n: DeskNews): string | null {
  const site = siteById(state, n.siteId);
  if (!site || site.status === 'closed') return null;
  const who = firstOf(state, n.personId);
  // Told by someone still at the place (not the one it is about), else word goes round.
  const teller = firstOf(state, [...site.workers, site.ownerId].find((id) => id !== n.personId && id !== PLAYER_OWNER && state.people[id]));
  const says = (s: string): string => (teller ? `${teller} says ${s}` : `Word is ${s}`);
  if (n.kind === 'underpaid-left' && who) return says(`${who} walked out of ${site.name}. The wage you set would not feed a family.`);
  return null;
}

export function siteDeskDawnLines(state: SimState): string[] {
  const out: string[] = [];
  for (const n of deskIfAny(state)?.news ?? []) {
    if (n.day !== state.day) continue;
    const line = deskLine(state, n);
    if (!line) continue;
    out.push(n.townId !== state.player.townId ? `Word from ${prettyTownId(n.townId)}: ${line}` : line);
  }
  return out.slice(0, 2);
}

registerDawnLines('site-desk', siteDeskDawnLines);
