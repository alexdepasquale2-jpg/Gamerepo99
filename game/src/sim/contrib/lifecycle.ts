/**
 * Deaths and retirements reach you at dawn, told by kin when there is any, else by a neighbour, in the
 * towns you care about (where you stand, then home). The family's own grief follows as their bubble
 * (juice kin.death). Importing this module also registers the mortality dawn tick (economy/mortality).
 */
import { prettyTownId } from '../map/districts';
import { registerDevHook } from '../../app/dev-hooks';
import { registerDawnLines } from '../dawn-lines';
import { laidToRest, lifeEvents, retire, type LifeEvent } from '../economy/mortality';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

/** At most this many life lines per dawn. */
export const MAX_LIFE_LINES = 3;

const townLabel = (id: string): string => prettyTownId(id);
const nameOf = (state: SimState, id: string): string => state.people[id]?.name ?? townLabel(id);
const first = (name: string): string => firstNameOf(name) ?? name;

function lifeLine(state: SimState, e: LifeEvent, away: string): string {
  const by = e.teller && state.people[e.teller] ? nameOf(state, e.teller) : undefined;
  const heir = e.heir && state.people[e.heir] ? first(nameOf(state, e.heir)) : undefined;
  if (e.kind === 'died') {
    const after = e.trade && heir ? ` ${heir} has ${e.trade} now.` : '';
    const news = `${e.name} died in the night, at ${e.age}. There'll be a stone by the wall.${after}`;
    if (away) return `${away}${news}`;
    return by ? `${by} says ${news}` : `Word is ${news}`;
  }
  const after = e.trade && heir ? ` ${heir} runs ${e.trade} now.` : '';
  const news = `${e.name} has put the tools down for good, at ${e.age}.${after}`;
  if (away) return `${away}${news}`;
  return by ? `${by} says ${news}` : news;
}

/** This dawn's deaths first, then retirements, here before home. */
export function lifeDawnLines(state: SimState): string[] {
  const today = lifeEvents(state);
  if (!today.length) return [];
  const here = state.player.townId;
  const home = state.player.homeTownId;
  const towns = [here, home].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
  const out: string[] = [];
  for (const kind of ['died', 'retired'] as const) {
    for (const townId of towns) {
      const away = townId !== here ? `Word from ${townLabel(townId)}: ` : '';
      for (const e of today) if (e.kind === kind && e.townId === townId) out.push(lifeLine(state, e, away));
    }
  }
  return out.slice(0, MAX_LIFE_LINES);
}

registerDawnLines('lifecycle', lifeDawnLines);

// QA: __hearth.dev.lifecycle.events() / .bury(id) / .retire(id) (bury and retire redraw people and graves).
registerDevHook('lifecycle', (ctx) => {
  const st = (): SimState | undefined => ctx.session.getState();
  const redraw = (): void => { ctx.actors.sync(); ctx.world.refresh('all'); };
  return {
    events: () => st()?.life?.events ?? [],
    bury: (id: string) => { const s = st(); const e = s ? laidToRest(s, id) : null; redraw(); return e; },
    retire: (id: string) => { const s = st(); const e = s ? retire(s, id) : null; redraw(); return e; },
    lines: () => { const s = st(); return s ? lifeDawnLines(s) : []; },
  };
});
