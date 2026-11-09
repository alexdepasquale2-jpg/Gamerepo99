/** The storyteller: who paces the tale, what is afoot, and how it reads on a board. */
export * from './data';
export * from './state';
export { fireIncident, intensityOf, mercyNow, routPack, startArc, tickStoryteller } from './director';

import { happeningTownName } from '../happenings';
import type { SimState } from '../types/runtime';
import { arcById, incidentById, STORY, tellerById } from './data';
import { storyIfAny } from './state';

/** Lines heard on waking: what began or ended overnight (what you ended yourself by day was said then and there). */
export function storyDawnLines(state: SimState): string[] {
  return (storyIfAny(state)?.news ?? []).filter((n) => n.day === state.day).map((n) => n.line);
}

/** What is afoot, for a town's board: the mood of the days, troubles in force and how to end them, the chain running. */
export function tidings(state: SimState, townId: string): string[] {
  const s = storyIfAny(state);
  if (!s) return ['Nothing to tell yet.'];
  const out: string[] = [STORY.phaseLines[s.phase] ?? ''];
  const mine = [...s.active].sort((a, b) => Number(b.townId === townId) - Number(a.townId === townId) || a.ends - b.ends);
  for (const a of mine) {
    const inc = incidentById(a.id);
    if (!inc?.board) continue;
    out.push(inc.board
      .replace(/\{town\}/g, happeningTownName(a.townId))
      .replace(/\{left\}/g, String(Math.max(1, a.ends - state.day)))
      .replace(/\{need\}/g, String(Math.max(0, (a.need ?? 0) - (a.routed ?? 0)))));
  }
  const arc = arcById(s.arc?.id);
  if (arc && s.arc) out.push(`They are saying at ${happeningTownName(s.arc.townId)}: ${arc.blurb}`);
  if (!mine.length && !arc) out.push('No trouble is standing at anyone\'s gate today.');
  const past = s.log.filter((l) => l.outcome).slice(-3).reverse();
  for (const l of past) out.push(`Day ${l.day}: ${incidentById(l.id)?.name ?? l.id} at ${happeningTownName(l.townId)}, ${l.outcome === 'won' ? 'seen off' : 'not answered'}.`);
  out.push(`The tale is ${tellerById(s.teller).name}'s.`);
  return out.filter(Boolean);
}
