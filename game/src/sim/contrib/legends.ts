/**
 * Legends spoken of (I8). The legend lines a world file carried (state.legacy.legends) live on in talk:
 *   - dawn: now and then someone in your town retells one (legends that just came across go first);
 *   - rumour: "Ask after old names" in the Ask family of anyone grown, once a day each; they pass on what
 *     they heard as their own bubble (juice legend.heard).
 * The ui hands an import's legends to keepImportedLegends so the first dawns carry them. Pure: no DOM.
 */
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { ensureLegacy } from '../legacy/state';
import { pushJuice } from '../packets';
import { registerActionProvider } from '../play-session/action-providers';
import { expandGrammar, type Grammar } from '../grammar';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { townLabel } from './power-page';
import { markUsed, usedToday } from './use-effects';

export type LegendTalk = {
  /** Legend lines from the last import not yet retold at dawn. */
  arrived: string[];
  /** The line chosen for this dawn. */
  today?: { day: number; line: string };
};

export const LEGEND_TALK = {
  /** Chance a dawn with nothing new still brings an old legend up. */
  dawnChance: 0.2,
  /** Youngest who passes on a legend. */
  minAge: 14,
  /** How people frame what they heard (sim/grammar.ts); {line} is the legend line, {town} the teller's. */
  frames: {
    frames: ['{line}', '#source# told it me: {line}', '#where# {line}', '#swear# {line}', '{line} #after#', '#where# {line} #after#'],
    rules: {
      source: ['My mother', 'My father', 'My gran', 'The old carter', 'A tinker once', 'My first master'],
      where: ['You hear it at the well still.', 'It gets told round the fires in {town}.', 'Every child in {town} knows this one.', 'It is an old one, this.', 'They told it at my naming.'],
      swear: ['Old folk swear to it.', 'My gran swore it was true.', 'I believe it, mostly.', 'Nobody here doubts it.'],
      after: ['That is how they tell it.', 'So they say, anyway.', 'I like to think it is true.', 'Mind, I never saw it myself.'],
    },
  } satisfies Grammar,
};
export const ASK_LEGEND = 'ask_legend';
const PREFIX = `${ASK_LEGEND}@`;

const talk = (state: SimState): LegendTalk => (state.legendTalk ??= { arrived: [] });
export const legendsOf = (state: SimState): string[] => state.legacy?.legends ?? [];

/** Keep an import's legends: in the legacy list, and queued for the first dawns to retell. */
export function keepImportedLegends(state: SimState, legends: readonly string[]): void {
  const lg = ensureLegacy(state);
  const t = talk(state);
  for (const l of legends) {
    if (!l) continue;
    if (!lg.legends.includes(l)) lg.legends.push(l);
    if (!t.arrived.includes(l)) t.arrived.push(l);
  }
}

/** Grown, not a legend themselves, and in the world. */
function canTell(state: SimState, personId: string): boolean {
  const p = state.people[personId];
  return !!p && (p.age ?? LEGEND_TALK.minAge) >= LEGEND_TALK.minAge && !p.tags?.includes('legacy_player') && !state.legacy?.npcs[personId];
}

/** Someone in the player's town to retell it at dawn: one of the three eldest, turn by turn. */
function dawnTeller(state: SimState): string | undefined {
  const town = state.player.townId;
  const folk = Object.values(state.people)
    .filter((p) => p.townId === town && canTell(state, p.id))
    .sort((a, z) => (z.age ?? 0) - (a.age ?? 0) || a.id.localeCompare(z.id))
    .slice(0, 3);
  return folk.length ? folk[state.day % folk.length]!.id : undefined;
}

function tickLegendTalk(state: SimState): void {
  const legends = legendsOf(state);
  if (!legends.length) return;
  const t = talk(state);
  t.arrived = t.arrived.filter((l) => legends.includes(l));
  let line = t.arrived.shift();
  if (!line && deriveRng(state.seed, 'legend-dawn', state.day).next() < LEGEND_TALK.dawnChance) {
    line = legends[deriveRng(state.seed, 'legend-pick', state.day).int(0, legends.length)];
  }
  if (!line) return;
  const by = dawnTeller(state);
  t.today = { day: state.day, line: by ? `${state.people[by]!.name ?? by} says ${line}` : `They still say it: ${line}` };
}

registerDawnTick('late', 'legends', tickLegendTalk);
registerDawnLines('legends', (state) => (state.legendTalk?.today?.day === state.day ? [state.legendTalk.today.line] : []));

/** What this person passes on today: a legend in their own framing. */
export function legendRumour(state: SimState, personId: string): string | null {
  const legends = legendsOf(state);
  if (!legends.length) return null;
  const rng = deriveRng(state.seed, 'legend-rumour', state.day, personId);
  const line = legends[rng.int(0, legends.length)]!;
  const townId = state.people[personId]?.townId;
  // Imported legends are free text; a closing stop keeps "{line} That is how they tell it." reading right.
  const slots = { line: /[.!?"']$/.test(line.trim()) ? line : `${line.trim()}.`, town: townId ? townLabel(state, townId) : undefined };
  return expandGrammar(LEGEND_TALK.frames, {}, { slots }, `legend-rumour|${state.seed}|${state.day}|${personId}`);
}

registerActionProvider({
  id: 'legends',
  list: (state, personId) =>
    legendsOf(state).length && canTell(state, personId) && !usedToday(state, PREFIX + personId)
      ? [{ id: PREFIX + personId, label: 'Ask after the old names people speak of', short: 'Ask of legends', family: 'ask' }]
      : [],
  act: (state, actionId, eventLog) => {
    if (!actionId.startsWith(PREFIX)) return false;
    const personId = actionId.slice(PREFIX.length);
    const line = canTell(state, personId) ? legendRumour(state, personId) : null;
    markUsed(state, PREFIX + personId);
    if (line) pushJuice(state, 'legend.heard', { personId, lines: [line], rumour: true });
    eventLog.push({ type: line ? 'legend.heard' : 'act', methodId: actionId });
    return true;
  },
});
