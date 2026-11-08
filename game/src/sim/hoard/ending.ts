/**
 * The ash_hoard ending, as the player meets it: a quiet look back at what the hoard bought and what
 * the towns became, then "Carry on" or "Let it rest". Neither is shamed. Pure; the overlay is in src/ui.
 * Not re-exported from ./index (legacy imports the hoard barrel; this module imports legacy).
 */

import { loadWorldTables } from '../gen/load/load-world-tables';
import { letItRest } from '../legacy/flow';
import { districtOfTown, prettyTownId } from '../map/districts';
import type { SimState } from '../types/runtime';
import { hoardEndingOpen } from './neglect';
import { ensureHoard, notorietyTable, siteDefs, type HoardEndingUi } from './state';

export type HoardEndingView = {
  title: string;
  lines: string[];
  buttons: { continue: string; quit: string };
};

export type HoardEndingChoice = 'continue' | 'quit';

let townNames: Map<string, string> | undefined;
export function townDisplayName(id: string): string {
  townNames ??= new Map(loadWorldTables().towns.map((t) => [t.id, t.name]));
  // A generated district town (d<col>_<row>_t<i>) is not in the authored table: use its generated name.
  return townNames.get(id) ?? (districtOfTown(id) ? prettyTownId(id) : id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}

const fill = (s: string, vars: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
const byBelow = (rows: { below: number; line: string }[], v: number): string => (rows.find((r) => v < r.below) ?? rows.at(-1))?.line ?? '';

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** The ending's words, from this run's state (stashes, guards, notoriety, towns' despair). */
export function hoardEndingLines(state: SimState, ui: HoardEndingUi): string[] {
  const h = ensureHoard(state);
  const sites = siteDefs(state);
  const held = Object.values(h.stash).filter((s) => s.coin > 0);
  const coin = held.reduce((a, s) => a + s.coin, 0);
  const guardsN = held.reduce((a, s) => a + s.guardsHired, 0);
  const places = list(
    held.map((s) => {
      const d = sites.find((x) => x.id === s.siteId);
      const name = (d?.name ?? 'a hidden place').toLowerCase();
      return d ? `the ${name} in ${townDisplayName(d.townId)}` : name;
    }),
  );
  const guards = guardsN > 0 ? fill(ui.guards, { n: guardsN, guardWord: guardsN === 1 ? 'guard' : 'guards' }) : '';
  const out = [ui.opening, fill(ui.bought, { coin, places, guards, notoriety: byBelow(ui.nameByNotoriety, h.notoriety) })];
  const towns = Object.values(state.towns ?? {}).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (towns.length) {
    const said = towns.map((t) => fill(byBelow(ui.townByDespair, t.despair ?? 0), { town: townDisplayName(t.id) }));
    out.push(`${ui.townsLead} ${list(said)}.`);
  }
  return out;
}

/** The ending screen, while it is waiting for an answer; null otherwise. */
export function hoardEndingView(state: SimState): HoardEndingView | null {
  const ui = notorietyTable(state)?.hoardLegacy.ui;
  if (!ui || !hoardEndingOpen(state)) return null;
  return { title: ui.title, lines: hoardEndingLines(state, ui), buttons: { ...ui.buttons } };
}

/**
 * "Carry on": set it aside for this life and keep playing. "Let it rest": the run ends through the
 * same warm path as succession's rest (grave, lineage, ash_hoard imprint).
 */
export function chooseHoardEnding(state: SimState, choice: HoardEndingChoice): { ok: boolean; restedLine?: string } {
  if (!hoardEndingOpen(state)) return { ok: false };
  const e = ensureHoard(state).ending!;
  e.open = false;
  if (choice === 'continue') {
    e.dismissedDay = state.day;
    return { ok: true };
  }
  const was = state.ended;
  state.ended = 'succession';
  const res = letItRest(state);
  if (!res.ok) {
    state.ended = was;
    e.open = true;
    return { ok: false };
  }
  return { ok: true, restedLine: notorietyTable(state)?.hoardLegacy.ui?.restedLine };
}
