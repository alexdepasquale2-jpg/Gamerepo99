/**
 * The civic layer's public face (imported once from sim/contrib): the staffing dawn tick, the "Sites"
 * noticeboard page, dawn lines told by the people of a site, and a QA hook. News comes through people:
 * a hand of the site tells you its post is empty, who took it, who left hungry. Pure: no Phaser/DOM.
 */
import { registerDevHook } from '../../app/dev-hooks';
import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { PLAYER_OWNER } from '../economy/build-plans';
import { neighbourOf } from '../economy/mortality';
import { prettyTownId } from '../map/districts';
import type { SimState } from '../types/runtime';
import { SITE_KIND_BY_ID, civicIfAny, siteById, sitesIn, type CivicNews, type Site } from './sites';
import { tickSites } from './staffing';

export * from './sites';
export * from './store';
export { bestCandidate, managerFit, rationCoin, tickSites, vacatePosts } from './staffing';

/** At most this many site lines a dawn. */
export const MAX_SITE_LINES = 3;

// After mortality (registered when economy/mortality loads), so the night's deaths are in before posts are filled.
registerDawnTick('people', 'civic-sites', tickSites);

const fullName = (state: SimState, id: string | undefined): string | undefined => (id ? state.people[id]?.name : undefined);
const firstOf = (state: SimState, id: string | undefined): string | undefined => fullName(state, id)?.split(' ')[0];

/** Who tells a site's news: one of its hands (not the one it is about), else its owner, else a neighbour. */
function tellerFor(state: SimState, site: Site, about?: string): string | undefined {
  const pool = [...site.workers, site.managerId, site.ownerId].filter((id): id is string => !!id && id !== about && id !== PLAYER_OWNER && !!state.people[id]);
  return pool[0] ?? neighbourOf(state, about ?? site.ownerId, site.townId);
}

const WHY: Record<string, string> = { died: 'died', retired: 'put the tools down', hungry: 'left hungry', unpaid: 'walked out unpaid', gone: 'went' };

function newsLine(state: SimState, n: CivicNews, site: Site): string | null {
  // A place that shut the same dawn (its owner died with no one to take it) has no post to fill.
  if (site.status === 'closed') return null;
  const by = firstOf(state, tellerFor(state, site, n.personId));
  const who = fullName(state, n.personId) ?? site.vacated?.name;
  const says = (s: string): string => (by ? `${by} says ${s}` : `Word is ${s}`);
  switch (n.kind) {
    case 'wanted': {
      const since = site.vacated ? ` since ${site.vacated.name} ${WHY[site.vacated.why] ?? 'went'}` : '';
      return says(`nobody runs ${site.name}${since}. It stands idle: wanted, a manager.`);
    }
    case 'promoted': return who ? says(`${who} runs ${site.name} now; nobody in town fit it better.`) : null;
    case 'unfed-left': return who ? says(`${who} has left ${site.name}. No bread on their table for days.`) : null;
    case 'unpaid-left': return who ? says(`${who} walked out of ${site.name}. The till could not pay them.`) : null;
    case 'sick': return who ? says(`${who} from ${site.name} is sick with hunger.`) : null;
  }
  return null;
}

/** Today's site news where you stand, then from home. Promotions and empty posts first. */
export function civicDawnLines(state: SimState): string[] {
  const today = (civicIfAny(state)?.news ?? []).filter((n) => n.day === state.day);
  if (!today.length) return [];
  const here = state.player.townId;
  const towns = [here, state.player.homeTownId].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
  const order: CivicNews['kind'][] = ['wanted', 'promoted', 'unfed-left', 'sick', 'unpaid-left'];
  const out: string[] = [];
  for (const townId of towns) {
    const away = townId !== here ? `Word from ${prettyTownId(townId)}: ` : '';
    for (const kind of order) {
      for (const n of today) {
        if (n.townId !== townId || n.kind !== kind) continue;
        const site = siteById(state, n.siteId);
        const line = site && newsLine(state, n, site);
        if (line) out.push(away + line);
      }
    }
  }
  return out.slice(0, MAX_SITE_LINES);
}

registerDawnLines('civic', civicDawnLines);

/** One board line per site: who runs it and who works it, or that its post is empty. */
export function siteBoardLine(state: SimState, s: Site): string {
  const kind = SITE_KIND_BY_ID.get(s.kind)?.name ?? s.kind;
  const head = `${s.name} (${kind})`;
  if (s.status === 'building') return `${head}: going up.`;
  if (s.status === 'standing') return `${head}: built, nobody trades from it.`;
  if (s.crewRun) return s.managerId ? `${head}: ${firstOf(state, s.managerId) ?? 'a foreman'}'s crew of ${1 + s.workers.length}.` : `${head}: no crew at work.`;
  const hands = `${s.workers.length} hand${s.workers.length === 1 ? '' : 's'} at ${s.wage} coin`;
  if (!s.managerId) return `${head}: WANTED, A MANAGER (posted day ${s.wantedSince ?? s.founded}). ${hands}, idle.`;
  const boss = s.managerId === PLAYER_OWNER ? 'you' : fullName(state, s.managerId) ?? 'someone';
  return `${head}: run by ${boss}; ${hands}; till ${Math.floor(s.coin)}.`;
}

registerBoardPage({
  id: 'sites',
  title: 'Sites',
  render: (state, townId) => {
    const sites = sitesIn(state, townId);
    if (!sites.length) return { lines: ['No workplaces here yet. Plots stand empty.'] };
    // Empty posts first: that is what the board is for.
    const lines = [...sites].sort((a, z) => Number(!!a.managerId || !!a.crewRun || a.status !== 'idle') - Number(!!z.managerId || !!z.crewRun || z.status !== 'idle')).map((s) => siteBoardLine(state, s));
    return lines.length > 8 ? { columns: [lines.slice(0, Math.ceil(lines.length / 2)), lines.slice(Math.ceil(lines.length / 2))] } : { lines };
  },
});

// QA: __hearth.dev.civic.sites(townId?) / .wanted() / .news()
registerDevHook('civic', (ctx) => {
  const st = (): SimState | undefined => ctx.session.getState();
  const view = (s: Site) => ({ id: s.id, name: s.name, kind: s.kind, townId: s.townId, status: s.status, managerId: s.managerId ?? null, workers: s.workers, wage: s.wage, coin: Math.round(s.coin * 100) / 100, wantedSince: s.wantedSince ?? null });
  return {
    sites: (townId?: string) => { const s = st(); return s ? sitesIn(s, townId).map(view) : []; },
    wanted: () => { const s = st(); return s ? sitesIn(s).filter((x) => !x.managerId && x.status === 'idle' && !x.crewRun).map(view) : []; },
    news: () => civicIfAny(st())?.news ?? [],
  };
});
