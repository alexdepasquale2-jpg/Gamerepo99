/**
 * Letting time pass at the hearth: "Wait a day / 3 days / a week" beside "Rest until dawn". The sim only
 * allows the verb here; the scene plays the rest's fade and calls session.wait(days) (app/shell), so a
 * wait is one evening then the clock (civic/clock). After a long stretch (a wait past FULL_DAYS, or your
 * first morning back in a district that lived on without you) the news comes from a neighbour: who was
 * born, who was buried, while the days went by (the stretch's LOD report).
 * Pure: no Phaser/DOM.
 */
import { registerDawnLines } from '../dawn-lines';
import { lastStretch } from '../civic/clock';
import { registerTargetProvider, type ProvidedAction } from '../play-session/action-providers';
import { targetActionId, parseTargetAction, type Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';

/** The waits on offer, in days, with their chip text. */
export const WAITS: readonly { days: number; label: string; short: string }[] = [
  { days: 1, label: 'Wait out a day by the fire', short: 'Wait a day' },
  { days: 3, label: 'Wait three days by the fire', short: 'Wait 3 days' },
  { days: 7, label: 'Wait a week by the fire', short: 'Wait a week' },
];
const VERB = 'wait_';

/** Days a wait act asks for (`wait_3@hearth:x` → 3); undefined when it is not a wait. */
export function waitDays(actionId: string): number | undefined {
  const verb = parseTargetAction(actionId)?.verb ?? '';
  if (!verb.startsWith(VERB)) return undefined;
  const n = Number(verb.slice(VERB.length));
  return WAITS.some((w) => w.days === n) ? n : undefined;
}

registerTargetProvider({
  id: 'clock-wait',
  kinds: ['hearth'],
  list: (_s, t: Target): ProvidedAction[] => WAITS.map((w) => ({ id: targetActionId(`${VERB}${w.days}`, t), label: w.label, short: w.short })),
  act: (_s, actionId) => (waitDays(actionId) ? { ok: true } : false),
});

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const list = (names: string[]): string => (names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** The eldest in the player's town tells it (ties by id): the one who has seen the most mornings. */
function teller(state: SimState): string | undefined {
  const here = state.player.townId;
  return Object.values(state.people)
    .filter((p) => p.townId === here && p.name)
    .sort((a, z) => (z.age ?? 0) - (a.age ?? 0) || a.id.localeCompare(z.id))[0]?.name;
}

/** One line after a long stretch: births and burials while you waited (or nothing much, said so). */
export function stretchLines(state: SimState): string[] {
  const rep = lastStretch(state);
  if (!rep) return [];
  const by = teller(state);
  // A wait's stretch ends the morning before this one; a district's catch-up ended the day you arrived.
  const days = rep.to - rep.from + (rep.away ? 0 : 1);
  const parts: string[] = [];
  if (rep.born.length) parts.push(`${rep.born.length} ${plural(rep.born.length, 'little one', 'little ones')} born`);
  if (rep.died.length) parts.push(`${list(rep.died.slice(0, 3))}${rep.died.length > 3 ? ' and others' : ''} laid to rest`);
  if (rep.wed) parts.push(`${rep.wed} ${plural(rep.wed, 'couple', 'couples')} set up home`);
  const span = rep.away ? `${days} days you were gone.` : `${days} days.`;
  const news = parts.length ? `${span} ${list(parts)}.` : `${span} Nothing much changed but the weather.`;
  return [by ? `${by} counts it on their fingers: ${news}` : `Word is: ${news}`];
}

registerDawnLines('clock', stretchLines);
