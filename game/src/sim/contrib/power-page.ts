/**
 * Power on the noticeboard: who holds a town and by what compact, what people say it delivers against
 * what the ledgers say, land quarrels and how the neighbours settled them, treaties and wars with
 * neighbouring towns, the town's creed and crafts. The same systems speak at dawn through a named
 * townsperson ("Wren says the mill plot went to Tobin"). Hearsay and posted notices only, never meters.
 * Builders are pure over SimState; the dawn source keeps a small "already heard" memory on the state.
 */

import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { ensureDoctrines, type DoctrineState } from '../doctrine-tick';
import { BUILDING_BY_ID } from '../economy/build-plans';
import { LAND, bordersOf } from '../economy/borders';
import { CREEDS, TECHS, pairKey, type Creed, type Treaty } from '../economy/polity';
import type { DataTables } from '../load-data';
import { deriveRng } from '../rng';
import { promiseNote } from '../promise-tally';
import type { SimState } from '../types/runtime';

// ---------- data ----------

type DoctrineRow = {
  id: string;
  name: string;
  leaderPersonId?: string | null;
  goals?: { promise: string }[];
  hearsay?: { holds?: string; ledger?: string };
};

const rowsOf = (state: SimState): DoctrineRow[] =>
  ((state.data as DataTables | undefined)?.doctrines as { doctrines?: DoctrineRow[] } | undefined)?.doctrines ?? [];

/** A town's spoken name: authored name without any "(…)" aside, else its id in title case. */
export function townLabel(state: SimState, townId: string, nameOf?: (id: string) => string): string {
  const authored = nameOf?.(townId) ?? ((state.data as DataTables | undefined)?.towns as { id: string; name?: string }[] | undefined)?.find((t) => t.id === townId)?.name;
  const n = (authored && authored !== townId ? authored : townId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return n || townId;
}

const fullName = (state: SimState, id: string): string => state.people[id]?.name ?? id;
const firstName = (state: SimState, id: string): string => fullName(state, id).split(' ')[0]!;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- phrases (pure) ----------

/** What people say the compact delivers, set against what the ledger says. */
export function deliveryHearsay(perceived: number, real: number, hearsay?: DoctrineRow['hearsay']): string {
  const holds = hearsay?.holds ?? 'it still holds';
  const ledger = hearsay?.ledger ?? 'the tally-book';
  const gap = perceived - real;
  if (gap > 0.15) return perceived >= 0.5 ? `People say ${holds}. ${cap(ledger)} says otherwise.` : `A few still say ${holds}. ${cap(ledger)} says otherwise.`;
  if (gap < -0.15) return `Nobody believes ${holds}. ${cap(ledger)} says they should.`;
  if (real >= 0.55) return `People say ${holds}, and ${ledger} bears them out.`;
  if (real >= 0.3) return `People say ${holds} some weeks and not others. ${cap(ledger)} agrees.`;
  return `Nobody says ${holds} any more, and ${ledger} agrees.`;
}

/** How a compact sits with the town, in words. */
export function legitimacyPhrase(legitimacy: number, collapsed?: boolean): string {
  if (collapsed) return 'It has fallen. Nobody keeps it now.';
  if (legitimacy >= 0.75) return 'Most would stand up for it.';
  if (legitimacy >= 0.5) return 'Most go along with it.';
  if (legitimacy >= 0.3) return 'People follow it out of habit, not faith.';
  return 'Few still believe in it. It could fall any day.';
}

/** Short form for news of other towns. */
export function legitimacyShort(legitimacy: number, collapsed?: boolean): string {
  if (collapsed) return 'fallen';
  if (legitimacy >= 0.75) return 'held firm';
  if (legitimacy >= 0.5) return 'kept';
  if (legitimacy >= 0.3) return 'kept out of habit';
  return 'barely believed';
}

/** Criers, fear and doubt: what you would notice walking the street. */
export function streetTalk(d: Pick<DoctrineState, 'propaganda' | 'control' | 'exposure'>): string[] {
  const out: string[] = [];
  if (d.propaganda >= 0.5) out.push('Its criers are at every corner.');
  else if (d.propaganda >= 0.25) out.push('Its sayings are chalked on the doors.');
  if (d.control >= 0.4) out.push('Few dare speak against it aloud.');
  if (d.exposure >= 0.4) out.push('Its lies are common talk now.');
  else if (d.exposure >= 0.2) out.push('Some have started asking questions.');
  return out;
}

export function tensionPhrase(t: number): string {
  if (t >= 80) return 'folk walk the border armed';
  if (t >= 50) return "they move each other's boundary stones";
  if (t >= 20) return 'hard words at the boundary stones';
  return 'a few fence-posts argued over';
}

/** What a creed is said to do, read from its effects. */
export function creedSaying(c: Creed): string {
  const parts: string[] = [];
  if ((c.birthMul ?? 1) > 1) parts.push('cradles fill under it');
  if (c.jobMul && Object.values(c.jobMul).some((m) => m > 1)) parts.push('fields and nets give more');
  if (c.safeRoads) parts.push('carts go safe under its sign');
  if ((c.feudDecay ?? 0) > 1) parts.push('quarrels cool quickly');
  return parts.length ? `folk say ${parts.join(' and ')}` : 'folk keep it quietly';
}

// ---------- the town's compact ----------

/** Who leads a doctrine in its current town: its authored leader if they live there, else a known voice. */
export function leaderOf(state: SimState, d: Pick<DoctrineState, 'id' | 'townId'>): string | undefined {
  const authored = rowsOf(state).find((r) => r.id === d.id)?.leaderPersonId;
  if (authored && state.people[authored]?.townId === d.townId) return authored;
  // Someone else's authored leader never fronts this compact (after a swap they stay loyal to their own).
  const others = new Set(rowsOf(state).filter((r) => r.id !== d.id && r.leaderPersonId).map((r) => r.leaderPersonId!));
  return voiceIn(state, d.townId, others);
}

const voiceIn = (state: SimState, townId: string, skip?: Set<string>): string | undefined =>
  Object.keys(state.people).sort().find((id) => !skip?.has(id) && state.people[id]!.townId === townId && state.people[id]!.tags?.some((t) => t === 'leader' || t === 'doctrine_voice'));

const doctrinesIn = (state: SimState, townId: string): DoctrineState[] =>
  Object.values(ensureDoctrines(state)).filter((d) => d.townId === townId).sort((a, b) => Number(!!a.collapsed) - Number(!!b.collapsed) || a.id.localeCompare(b.id));

/** Towns that send word: road or treaty neighbours, else every other town with a compact. */
function neighboursOf(state: SimState, townId: string): string[] {
  const out = new Set<string>();
  for (const r of state.economyRoutes ?? []) { if (r.fromTownId === townId) out.add(r.toTownId); if (r.toTownId === townId) out.add(r.fromTownId); }
  for (const r of Object.values(state.polity?.relations ?? {})) { if (r.a === townId) out.add(r.b); if (r.b === townId) out.add(r.a); }
  out.delete(townId);
  return [...out].filter((t) => !state.towns || state.towns[t]).sort();
}

export function compactLines(state: SimState, townId: string, nameOf?: (id: string) => string): string[] {
  const town = townLabel(state, townId, nameOf);
  const rows = rowsOf(state);
  const here = doctrinesIn(state, townId);
  const live = here.find((d) => !d.collapsed);
  const out: string[] = ['Who holds sway'];
  if (live) {
    const row = rows.find((r) => r.id === live.id);
    const name = row?.name ?? live.id;
    const lead = leaderOf(state, live);
    out.push(lead ? `• ${fullName(state, lead)} speaks for the ${name}.` : `• The ${name} holds ${town}; no one stands at its head.`);
    const promises = (row?.goals ?? []).slice(0, 2).map((g) => `"${g.promise}"`);
    if (promises.length) out.push(`• It promises ${promises.join(' and ')}.`);
    out.push(`• ${deliveryHearsay(live.perceivedDelivery, live.realDelivery, row?.hearsay)}`);
    out.push(...promiseNote(state, live.id, row?.hearsay?.ledger, live.perceivedDelivery));
    out.push(`• ${[legitimacyPhrase(live.legitimacy), ...streetTalk(live)].join(' ')}`);
  } else {
    const lead = voiceIn(state, townId);
    out.push(`• No compact holds ${town}. Folk keep their own counsel.`);
    if (lead) out.push(`• ${fullName(state, lead)} is listened to, but answers to no compact.`);
  }
  for (const d of here.filter((x) => x.collapsed).slice(0, 1)) out.push(`• The ${rows.find((r) => r.id === d.id)?.name ?? d.id} fell here. Nobody keeps it now.`);
  const word = neighboursOf(state, townId).flatMap((t) => {
    const d = doctrinesIn(state, t)[0];
    return d ? [`• ${townLabel(state, t, nameOf)}: the ${rows.find((r) => r.id === d.id)?.name ?? d.id}, ${legitimacyShort(d.legitimacy, d.collapsed)}.`] : [];
  });
  if (word.length) out.push('', 'Word from the road', ...word.slice(0, 3));
  return out;
}

// ---------- land, neighbours, creed, crafts ----------

const plotOf = (state: SimState, claimId: string): string => {
  const kind = state.build?.claims.find((c) => c.id === claimId)?.kind;
  return (kind && BUILDING_BY_ID.get(kind)?.name.toLowerCase()) || 'building';
};

export function landLines(state: SimState, townId: string, nameOf?: (id: string) => string): string[] {
  const out: string[] = ['Land in dispute'];
  const disputes = (state.borders?.disputes ?? []).filter((d) => d.townId === townId).sort((a, b) => b.opened - a.opened || b.id.localeCompare(a.id)).slice(0, 3);
  if (!disputes.length) out.push('• No one is quarrelling over land.');
  for (const d of disputes) {
    const ch = firstName(state, d.challengerId), ho = firstName(state, d.holderId), plot = plotOf(state, d.claimId);
    if (d.status === 'open') {
      const left = Math.max(1, d.opened + LAND.settleDays - state.day);
      out.push(`• ${ch} contests ${ho}'s idle ${plot} plot. The neighbours judge in ${plural(left, 'day')}.`);
    } else if (d.status === 'upheld') out.push(`• ${ch} took ${ho}'s stalled ${plot} plot; the neighbours judged ${ch} the surer hand.`);
    else out.push(`• ${ho} kept the ${plot} plot; ${ch}'s claim was turned away.`);
  }
  const borders = bordersOf(state, townId).filter((p) => p.tension > 0).sort((a, b) => b.tension - a.tension).slice(0, 2);
  for (const p of borders) out.push(`• Toward ${townLabel(state, p.a === townId ? p.b : p.a, nameOf)}: ${tensionPhrase(p.tension)}.`);

  const rel = Object.values(state.polity?.relations ?? {}).filter((r) => r.a === townId || r.b === townId).sort((a, b) => (a.a + a.b).localeCompare(b.a + b.b));
  if (rel.length) out.push('', 'Neighbours');
  for (const r of rel.slice(0, 4)) {
    const other = r.a === townId ? r.b : r.a;
    out.push(`• ${townLabel(state, other, nameOf)}: ${relationPhrase(state, townId, other, r.treaty, r.trust, r.feud, r.since)}`);
  }

  out.push('');
  const faith = state.polity?.faiths[townId];
  const creed = CREEDS.find((c) => c.id === faith?.creed);
  out.push(creed ? `Faith: ${creed.name}; ${creedSaying(creed)}.` : 'Faith: no chapel, no creed. Folk pray as they please.');
  const crafts = (state.polity?.tech[townId] ?? []).map((t) => TECHS.find((x) => x.id === t)?.name ?? t);
  out.push(crafts.length ? `Crafts: ${crafts.join(', ')}.` : 'Crafts: nothing beyond the old ways yet.');
  return out;
}

function relationPhrase(state: SimState, townId: string, other: string, treaty: Treaty, trust: number, feud: number, since: number): string {
  const key = pairKey(townId, other);
  const war = (state.polity?.wars ?? []).filter((w) => pairKey(w.aggressor, w.defender) === key).sort((a, b) => b.started - a.started)[0];
  if (war?.status === 'active') {
    const who = war.aggressor === townId ? 'we marched on them' : 'they marched on us';
    return `at war; ${who}. ${war.raids ? `${plural(war.raids, 'raid')} so far.` : 'No raids yet.'}`;
  }
  const ago = state.day - since;
  if (treaty === 'alliance') return `sworn allies these ${plural(ago, 'day')}.`;
  if (treaty === 'trade') return `a trade pact these ${plural(ago, 'day')}.`;
  if (war?.status === 'ended' && war.winner) return `a truce after the war; ${war.winner === townId ? 'we' : 'they'} came out ahead.`;
  if (feud >= 50) return 'bad blood, no pact.';
  if (feud >= 20) return 'old grudges, no pact.';
  if (trust >= 10) return 'on good terms, no pact yet.';
  if (trust < 0) return 'cold. Few carts go between.';
  return 'strangers, mostly.';
}

/** The whole board page: the compact on the left, land and neighbours on the right. */
export function powerPage(state: SimState, townId: string, nameOf?: (id: string) => string): { columns: [string[], string[]] } {
  return { columns: [compactLines(state, townId, nameOf), landLines(state, townId, nameOf)] };
}

// ---------- dawn news ----------

/** What the town has already heard, so dawn news is told once. Optional on SimState (old saves load). */
export type PowerHeard = { said: Record<string, number>; treaty: Record<string, Treaty>; seat: Record<string, string> };
type WithHeard = SimState & { powerHeard?: PowerHeard };

/** `day` = when it happened, where known: lets a first listen still pass on yesterday's news. */
type News = { key: string; town?: string; pri: number; day?: number; who?: string[]; text: (speaker: string) => string };

/** Everything newsworthy in the power systems right now (keys are stable; memory decides what is new). */
function currentNews(state: SimState): { news: News[]; treaty: Record<string, Treaty>; seat: Record<string, string> } {
  const news: News[] = [];
  const t = (id: string): string => townLabel(state, id);
  const rows = rowsOf(state);
  const dname = (id: string): string => rows.find((r) => r.id === id)?.name ?? id;

  for (const d of state.borders?.disputes ?? []) {
    const ch = fullName(state, d.challengerId), ho = fullName(state, d.holderId), plot = plotOf(state, d.claimId), at = t(d.townId);
    const who = [d.challengerId, d.holderId];
    if (d.status === 'open') news.push({ key: `${d.id}:open`, town: d.townId, pri: 1, day: d.opened, who, text: (s) => `${s} says ${ch} has laid claim to ${ho}'s idle ${plot} plot in ${at}.` });
    else if (d.status === 'upheld') news.push({ key: `${d.id}:done`, town: d.townId, pri: 2, day: d.opened + LAND.settleDays, who, text: (s) => `${s} says the neighbours handed ${ho}'s stalled ${plot} plot in ${at} to ${ch}.` });
    else news.push({ key: `${d.id}:done`, town: d.townId, pri: 2, day: d.opened + LAND.settleDays, who, text: (s) => `${s} says ${ch}'s grab for ${ho}'s ${plot} plot in ${at} came to nothing.` });
  }

  const seat: Record<string, string> = {};
  for (const d of Object.values(ensureDoctrines(state)).sort((a, b) => a.id.localeCompare(b.id))) {
    seat[d.id] = d.townId;
    if (d.collapsed) {
      const promise = rows.find((r) => r.id === d.id)?.goals?.[0]?.promise;
      news.push({ key: `collapse:${d.id}`, town: d.townId, pri: 3, text: (s) => `${s} says the ${dname(d.id)} has fallen in ${t(d.townId)}.${promise ? ` Nobody believes "${promise}" now.` : ''}` });
    }
  }

  const treaty: Record<string, Treaty> = {};
  for (const [key, r] of Object.entries(state.polity?.relations ?? {}).sort(([a], [b]) => a.localeCompare(b))) treaty[key] = r.treaty;
  for (const w of state.polity?.wars ?? []) {
    news.push({ key: `${w.id}:start`, town: w.defender, pri: 3, day: w.started, text: (s) => `${s} says ${t(w.aggressor)} has marched on ${t(w.defender)}.` });
    if (w.status === 'ended' && w.winner) news.push({ key: `${w.id}:end`, town: w.defender, pri: 3, day: w.started + w.duration, text: (s) => `${s} says the war between ${t(w.aggressor)} and ${t(w.defender)} is over; ${t(w.winner!)} came out ahead.` });
  }
  for (const [townId, f] of Object.entries(state.polity?.faiths ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const c = CREEDS.find((x) => x.id === f.creed);
    if (c) news.push({ key: `faith:${townId}`, town: townId, pri: 1, day: f.founded, text: (s) => `${s} says the new chapel in ${t(townId)} keeps ${c.name}.` });
  }
  for (const [townId, known] of Object.entries(state.polity?.tech ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const id of known) {
      const name = TECHS.find((x) => x.id === id)?.name ?? id;
      news.push({ key: `tech:${townId}:${id}`, town: townId, pri: 0, text: (s) => `${s} says the workshops in ${t(townId)} have worked out ${name.toLowerCase()}.` });
    }
  }
  return { news, treaty, seat };
}

/** A resident of the town to carry the news (seeded per key), else anyone who lives where it happened. */
function speakerFor(state: SimState, near: string | undefined, about: string | undefined, key: string, skip: string[] = []): string {
  for (const town of [near, about]) {
    if (!town) continue;
    const folk = Object.keys(state.people).sort().filter((id) => state.people[id]!.townId === town && state.people[id]!.name && !skip.includes(id) && !state.people[id]!.tags?.includes('child'));
    if (folk.length) return fullName(state, folk[deriveRng(state.seed, 'power-crier', state.day, key).int(0, folk.length)]!);
  }
  return 'Word on the road';
}

const MAX_LINES = 3;
const FORGET_AFTER = 150;
const KEEP = /^(collapse|faith|tech):/;

/**
 * Dawn news from the power systems: what changed since the town last heard, told by a named person.
 * Pure: returns the lines and the updated memory. With no memory yet, it only listens (no flood of old news).
 */
export function powerNews(state: SimState, heard: PowerHeard | undefined): { lines: string[]; heard: PowerHeard } {
  const { news, treaty, seat } = currentNews(state);
  const said: Record<string, number> = {};
  for (const [k, day] of Object.entries(heard?.said ?? {})) if (KEEP.test(k) || state.day - day < FORGET_AFTER) said[k] = day;
  const next: PowerHeard = { said, treaty, seat };
  const t = (id: string): string => townLabel(state, id);
  const rows = rowsOf(state);
  // First listen: only what happened since yesterday; older talk, treaties and seats are taken as known.
  const prev: PowerHeard = heard ?? { said: Object.fromEntries(news.filter((n) => n.day === undefined || n.day < state.day - 1).map((n) => [n.key, state.day])), treaty, seat };
  const fresh: News[] = news.filter((n) => !(n.key in prev.said));
  for (const [key, now] of Object.entries(treaty)) {
    if (now === (prev.treaty[key] ?? 'none')) continue;
    const [a, b] = key.split('|') as [string, string];
    const text = now === 'alliance' ? `${t(a)} and ${t(b)} have sworn an alliance` : now === 'trade' ? `${t(a)} and ${t(b)} have shaken on a trade pact` : `the pact between ${t(a)} and ${t(b)} is broken`;
    fresh.push({ key: `treaty:${key}:${now}`, town: a === state.player.townId ? a : b, pri: 1, text: (s) => `${s} says ${text}.` });
  }
  for (const [id, townId] of Object.entries(seat)) {
    const was = prev.seat[id];
    if (!was || was === townId) continue;
    const name = rows.find((r) => r.id === id)?.name ?? id;
    fresh.push({ key: `seat:${id}:${townId}`, town: townId, pri: 2, text: (s) => `${s} says ${t(townId)} has turned to the ${name}.` });
  }
  if (!heard) Object.assign(said, prev.said);
  for (const n of fresh) said[n.key] = state.day;
  const home = state.player.townId;
  const lines = fresh
    .map((n, i) => ({ n, i, w: n.pri + (n.town && n.town === home ? 10 : 0) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, MAX_LINES)
    .map(({ n }) => n.text(speakerFor(state, home, n.town, n.key, n.who)));
  return { lines, heard: next };
}

// ---------- registration ----------

registerBoardPage({ id: 'power', title: 'Power', render: (s, townId, nameOf) => powerPage(s, townId, nameOf) });

registerDawnLines('power-news', (s) => {
  const st = s as WithHeard;
  const { lines, heard } = powerNews(st, st.powerHeard);
  st.powerHeard = heard;
  return lines;
});
