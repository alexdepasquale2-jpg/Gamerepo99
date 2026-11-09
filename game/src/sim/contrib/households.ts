/**
 * Households on the shared surfaces: births and children coming of age reach you at dawn through a
 * parent, and each noticeboard has a Families page (households, their children, who has just grown).
 */
import { prettyTownId } from '../map/districts';
import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { householdsIn, KIN, voiceOf, type Household } from '../economy/households';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

/** At most this many household lines per dawn. */
export const MAX_HOUSEHOLD_LINES = 3;

const townLabel = (id: string): string => prettyTownId(id);
const nameOf = (state: SimState, id: string): string => state.people[id]?.name ?? townLabel(id);
const firstOf = (state: SimState, id: string): string => firstNameOf(nameOf(state, id))!;

/**
 * Births and comings-of-age from this dawn, in the towns you care about (where you stand, then home),
 * each told by a parent: "Marta Ellison's household has a new child, named Wren."
 */
export function householdDawnLines(state: SimState): string[] {
  const kids = state.kin?.children ?? [];
  if (!kids.length) return [];
  const here = state.player.townId;
  const home = state.player.homeTownId;
  const towns = [here, home].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
  const out: string[] = [];
  for (const townId of towns) {
    const away = townId !== here ? `Word from ${townLabel(townId)}: ` : '';
    for (const c of kids) {
      if (c.townId !== townId) continue;
      const parent = voiceOf(state, c);
      if (c.born === state.day && c.status === 'child') {
        const bright = c.gift ? ` There's something bright about ${c.sex === 'f' ? 'her' : 'him'}, they say.` : '';
        out.push(parent ? `${away}${nameOf(state, parent)}'s household has a new child, named ${c.given}.${bright}` : `${away}A child was born to the ${c.surname} household, named ${c.given}.${bright}`);
      } else if (c.grown === state.day && c.personId && state.people[c.personId]) {
        const who = nameOf(state, c.personId);
        out.push(parent ? `${away}${firstOf(state, parent)} says ${who} is grown now, and out among the neighbours.` : `${away}${who} of the ${c.surname} household is grown now, and out among the neighbours.`);
      }
    }
  }
  return out.slice(0, MAX_HOUSEHOLD_LINES);
}

const familyLine = (state: SimState, h: Household): string => {
  const kids = (state.kin?.children ?? []).filter((c) => h.kids.includes(c.id));
  const adults = h.adults.filter((a) => state.people[a]).map((a) => firstOf(state, a));
  const small = kids.filter((c) => c.status === 'child').map((c) => c.given);
  const grown = kids.filter((c) => c.status === 'adult' && c.personId && state.people[c.personId]).map((c) => c.given);
  const parts = [`• The ${h.surname}s${adults.length ? ` (${adults.join(' and ')})` : ''}`];
  if (small.length) parts.push(`little ones: ${small.join(', ')}`);
  if (grown.length) parts.push(`grown: ${grown.join(', ')}`);
  return parts.join('; ') + '.';
};

registerBoardPage({
  id: 'families',
  title: 'Families',
  render: (s, townId) => {
    const hh = householdsIn(s, townId).filter((h) => h.adults.some((a) => s.people[a]));
    if (!hh.length) return { lines: ['No households have set up home here yet.'] };
    const lines = ['Households of this town', '', ...hh.map((h) => familyLine(s, h))];
    const soon = (s.kin?.children ?? []).filter((c) => c.townId === townId && c.status === 'child' && KIN.comeOfAgeDays - (s.day - c.born) <= 10);
    if (soon.length) lines.push('', `Nearly grown: ${soon.map((c) => `${c.given} ${c.surname}`).join(', ')}.`);
    return { lines };
  },
});

registerDawnLines('households', householdDawnLines);
