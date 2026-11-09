/**
 * The Works at dawn (late slot, after the world's own day): people who left are dropped from crews and
 * the band; lines run; convoys move; the band marches, fights and eats; vassals pay or rise; the airship
 * flies; towns post contracts; arcs are checked. What happened is told at dawn by the people it concerns
 * (registerDawnLines; a line "Name says ..." is spoken by Name). Pure + deterministic.
 */
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import type { SimState } from '../types/runtime';
import { checkArcs } from './arcs';
import { tickVoyage } from './feast-voyage';
import { lineNews, tickLines } from './lines';
import { tickContracts, tickConvoys } from './logistics';
import { prunePeople, worksIfAny } from './state';
import { vehicleById } from './vehicles';
import { tickWar } from './war';

export function tickWorks(state: SimState): void {
  const w = worksIfAny(state);
  if (!w) return;
  prunePeople(state);
  tickLines(state);
  tickConvoys(state);
  tickWar(state);
  // War machines go where the band goes.
  if (w.band && !w.band.march) for (const id of w.band.vehicles) { const v = vehicleById(state, id); if (v) v.townId = w.band.townId; }
  tickVoyage(state);
  tickContracts(state);
  if (w.boons.includes('hearth')) for (const t of Object.values(state.towns ?? {})) t.despair = Math.max(0, t.despair - 0.005);
  lineNews(state);
  checkArcs(state);
}

registerDawnTick('late', 'works', tickWorks);

/** Today's Works news, at most four, people's own words first. */
export function worksDawnLines(state: SimState): string[] {
  const today = (worksIfAny(state)?.news ?? []).filter((n) => n.day === state.day);
  return [...today.filter((n) => n.who), ...today.filter((n) => !n.who)].slice(0, 4).map((n) => n.text);
}
registerDawnLines('works', worksDawnLines);
