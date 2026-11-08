/**
 * Proof that the living world is drawn, not only simulated: every layer that shows a sim system as it
 * happens reports how many of its things it drew this frame (on or near the camera). QA and the e2e spec
 * read them through `__hearth.dev.visuals()`; `__hearth.dev.visualsWhy()` names each dawn tick and what
 * shows it, or why it shows only through people's words. Render-side only: the sim never imports this.
 */
import { registerDevHook } from '../app/dev-hooks';

const counts: Record<string, number> = {};

/** A layer's count of what it drew this frame (set, not added: each layer owns its own names). */
export function countVisual(name: string, n: number): void {
  counts[name] = n;
}

export const visualCounts = (): Record<string, number> => ({ ...counts });

/**
 * Every registered dawn tick (sim/**: registerDawnTick) and the counters that prove it is seen. A tick whose
 * whole effect is talk lists no counter and says so: news comes through people (game/README rule 1).
 */
export const DAWN_TICK_VISUALS: Record<string, { counters: string[]; why: string }> = {
  visitors: { counters: ['roadFolk'], why: 'visitors walk the roads between towns (actors/road-folk)' },
  'promise-tally': { counters: [], why: 'invisible by design: legitimacy voices are spoken lines by townsfolk at dawn' },
  'civic-zoning': { counters: ['scaffolds', 'siteMarks'], why: 'zoned plots are drawn as staked plots and site marks (zoning itself is owned elsewhere)' },
  'tasks-help': { counters: ['workFx', 'workBars'], why: 'each task spot shows its work (sparks, steam, sawdust, chaff, dust) and a progress bar' },
  'district-polity': { counters: ['warSigns', 'districtCouriers'], why: 'war banners and smoke at war; a courier walks in from the border with a district letter' },
  'food-word': { counters: ['emptyStalls', 'leanGranaries'], why: 'the market stall empties and the granary heap shrinks; the word itself is spoken' },
  'site-desk': { counters: ['siteMarks'], why: 'site staffing marks (wanted notice, pips, smoke) on plots and facilities' },
  carry: { counters: ['storePiles'], why: 'heavy-goods piles by the hearth and facilities' },
  legends: { counters: [], why: 'invisible by design: legend talk is told by townsfolk' },
  roads: { counters: ['roadWear', 'workFx'], why: 'worn roads show ruts, broken ones rubble and a barrier; crews work at their spot' },
  mortality: { counters: ['graves', 'sickFolk'], why: 'a headstone appears in the yard; the sick walk pale and slow' },
  'civic-sites': { counters: ['siteMarks', 'workFx'], why: 'working sites smoke and glow, idle ones dim' },
  'civic-hauling': { counters: ['haulers', 'storeHeaps', 'crows'], why: 'haulers carry loads to the stores; heaps track stock; crows over spoiled food' },
  'realm-away': { counters: ['districtCouriers'], why: 'mail for elsewhere waits in an inbox; arriving letters come in by courier' },
};

registerDevHook('visuals', () => () => visualCounts());
registerDevHook('visualsWhy', () => () => DAWN_TICK_VISUALS);
