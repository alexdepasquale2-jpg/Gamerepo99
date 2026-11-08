/**
 * The realm while you are elsewhere. Only the district you stand in runs its people, so mail and news
 * addressed to another district would otherwise land on nobody. Instead they wait in that district's
 * inbox (RealmState.inbox) and are applied the day you arrive: a letter is delivered (and its reply
 * begun), a proof lifts someone struggling, a relapse dims someone lit, a reply that was being written
 * is finished and sent. A late dawn tick also lets the districts you have left drift by the LOD rates they
 * left with (civic/lod-away: people, food, despair by neglect and flame), stamping `lastTick` so arriving
 * (which runs the district itself on the LOD day from there) never counts those days twice.
 * Pure over SimState (no Phaser/DOM).
 */
import { registerDawnTick } from './dawn-ticks';
import { composeReply } from './letter-replies';
import { deliverFlight, ensureLetters } from './letters-scale';
import { deliverPacket } from './packets';
import { districtOfTownRef, inboxOf, realmIfAny, refId, type InboxItem } from './realm';
import { driftSummary } from './civic/lod-away';
import type { SimState } from './types/runtime';

const districtIdOf = (townId: string): string => refId(districtOfTownRef(townId));

/**
 * Move everything addressed to a town outside district `keepId` into that town's district inbox.
 * `leaving` takes everything addressed inside `keepId` too, plus its unsent backlog: the district you leave.
 */
function park(state: SimState, keepId: string, leaving: boolean): void {
  const ls = state.letters;
  const goesTo = (townId: string | undefined): string | undefined => {
    if (!townId) return undefined;
    const id = districtIdOf(townId);
    return leaving || id !== keepId ? id : undefined;
  };
  if (ls) {
    ls.flight = ls.flight.filter((f) => {
      const to = goesTo(f.toTownId);
      if (to) inboxOf(state, to).push({ t: 'letter', due: state.day + f.days, flight: f });
      return !to;
    });
    // A reply still being written needs its writer in the live sim; it waits with them.
    if (ls.replies) ls.replies = ls.replies.filter((r) => {
      const to = r.status === 'writing' ? goesTo(r.fromTownId) : undefined;
      if (to) inboxOf(state, to).push({ t: 'reply', due: state.day + r.writeLeft, reply: r });
      return !to;
    });
    if (leaving) {
      // The backlog of what came to pass here is told by people here: it stays with them.
      for (const p of ls.pending) if (state.people[p.fromPersonId]) inboxOf(state, keepId).push({ t: 'pending', pending: p });
      ls.pending = ls.pending.filter((p) => !state.people[p.fromPersonId]);
    }
  }
  // On leaving, today's packet countdown has run (tickPackets follows the dawn); at the late dawn tick it
  // has not, so a packet with one day left would still have landed today.
  const packetDue = (days: number): number => state.day + (leaving ? days : Math.max(0, days - 1));
  state.packets = (state.packets ?? []).filter((p) => {
    const to = goesTo(p.toTownId);
    if (to) inboxOf(state, to).push({ t: 'packet', due: packetDue(p.days), packet: p });
    return !to;
  });
}

/** Leaving district `id`: its mail, news and half-written replies wait in its inbox (they are not carried). */
export function parkLeaving(state: SimState, id: string): void {
  park(state, id, true);
}

/** Arriving in district `id`: apply what has landed by today; anything still on the road goes back in flight. */
export function deliverInbox(state: SimState, id: string): void {
  const realm = realmIfAny(state);
  const items: InboxItem[] = realm?.inbox?.[id] ?? [];
  if (realm?.inbox) delete realm.inbox[id];
  if (!items.length) return;
  const ls = ensureLetters(state);
  let arrived = false;
  for (const it of items) {
    if (it.t === 'pending') ls.pending.push(it.pending);
    else if (it.t === 'letter') {
      if (it.due <= state.day) arrived = deliverFlight(state, it.flight) || arrived;
      else ls.flight.push({ ...it.flight, days: it.due - state.day });
    } else if (it.t === 'packet') {
      if (it.due <= state.day) deliverPacket(state, it.packet);
      else state.packets.push({ ...it.packet, days: it.due - state.day });
    } else {
      const r = it.reply;
      (ls.replies ??= []).push(r);
      if (it.due > state.day) r.writeLeft = it.due - state.day;
      else {
        // Written while you were away: it has been on the road since; the courier's next dawn decides it.
        composeReply(state, r);
        r.status = 'travelling';
        r.daysLeft = Math.max(1, r.roadDays - (state.day - it.due));
      }
    }
  }
  // Mail that landed today is a letter's arrival, as a dawn delivery would say (Blessings and Burdens key on it).
  if (arrived) {
    const tags = (state.flags.circumstanceTags ??= []) as string[];
    if (!tags.includes('letter_arrived')) tags.push('letter_arrived');
  }
}

/** Late dawn: districts you have left drift one day, and stray mail for elsewhere is parked. */
function tickRealmAway(state: SimState): void {
  const realm = realmIfAny(state);
  if (!realm) return;
  const here = refId(realm.active);
  for (const [id, s] of Object.entries(realm.summaries)) {
    if (id === here || (s.lastTick ?? s.day) >= state.day) continue;
    driftSummary(state, s, state.day - (s.lastTick ?? s.day));
    s.lastTick = state.day;
  }
  park(state, here, false);
}

registerDawnTick('late', 'realm-away', tickRealmAway);
