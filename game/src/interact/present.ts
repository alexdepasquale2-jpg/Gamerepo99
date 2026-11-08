/**
 * Act → present: run one verb on one thing through session.act, then show what happened. The sim decides
 * (ok, line, hours); this file only maps the verb to what the player sees: a line at a head, a cue, a
 * sheet, a room, a rest, a redrawn world thing. Reignite bursts, wound lines and refusal flickers come
 * from the sim's juice stream, which the voice area presents; nothing here duplicates them.
 *
 * Goods deeds on people (gift, fair trade, carry, work alongside) move real items before the deed
 * resolves, as the old scene did: the held item is the one given or traded.
 */
import type { GameContext, Thing } from '../app/contracts';
import type { ActOutcome } from '../sim/play-session/action-providers';
import { parseTargetAction, type Target } from '../sim/play-session/targets';
import { applyDeedGoods, isGoodsDeed } from '../sim/goods/deed-goods';

type Sfx = Parameters<GameContext['voice']['sfx']>[0];
type WorldPart = NonNullable<Parameters<GameContext['world']['refresh']>[0]>;

/** Verbs whose effect is a scene change or a sheet; the sim only settles (and may refuse) them. */
const SCENE_VERBS = new Set(['read', 'trade', 'roads', 'enter', 'leave', 'rest']);
/** Which world things to redraw after a verb (by verb, then by target kind). */
const REFRESH_BY_VERB: Record<string, WorldPart> = { gather: 'nodes', pick_up: 'ground', work: 'all' };
const REFRESH_BY_KIND: Partial<Record<Target['kind'], WorldPart>> = {
  node: 'nodes', chest: 'chests', 'ground-item': 'ground', plot: 'plots', tile: 'edits', facility: 'all',
};
const CUE_BY_VERB: Record<string, Sfx> = { gather: 'pickup', pick_up: 'pickup', stash_withdraw: 'pickup', read: 'open', trade: 'open', roads: 'open', enter: 'open', leave: 'close' };
/** A shift never pushes the day past dusk into the night. */
export const SHIFT_PHASE_CAP = 0.7;

export const verbOf = (actionId: string): string => parseTargetAction(actionId)?.verb ?? actionId;

/** A line in quotes is the person's own words (a bubble); anything else is a tell over their head. */
function sayOrTell(ctx: GameContext, line: string, who: string): void {
  const m = /^\s*["“‘'](.*?)["”’']?\s*$/.exec(line);
  if (m && who !== 'player') ctx.voice.say(who, m[1] ?? line);
  else ctx.voice.tell(line, who);
}

/** The person verbs' item side; false (with the refusal told) when the deed should not go ahead. */
function goodsFirst(ctx: GameContext, verb: string, personId: string, itemId?: string): boolean {
  const state = ctx.session.getState();
  if (!state || !isGoodsDeed(verb)) return true;
  const r = applyDeedGoods(state, verb, personId, itemId ?? ctx.panels.satchel.held() ?? undefined);
  if (!r) return true;
  if (r.line) ctx.voice.tell(r.line, r.ok ? personId : 'player');
  if (!r.ok) ctx.voice.sfx('refuse');
  return r.ok;
}

/** Present a scene-changing verb that the sim allowed. */
function sceneChange(ctx: GameContext, verb: string, thing: Thing): void {
  const id = thing.target.id;
  switch (verb) {
    case 'read': ctx.panels.board.open(id); break;
    case 'trade': ctx.panels.trade.open(id); break;
    case 'roads': ctx.panels.roads.open(id); break;
    case 'enter':
      if (!ctx.world.enterRoom(id)) { ctx.voice.tell('It will not open.', 'player'); ctx.voice.sfx('refuse'); }
      break;
    case 'leave': ctx.world.leaveRoom(); break;
    case 'rest': void ctx.rest(); break;
  }
}

/**
 * Resolve `actionId` on `thing` (target already carries the held item) and present it. Emits 'act' and
 * 'inventory'. Returns the sim's outcome (undefined for most person deeds, whose news is juice).
 * `itemId` is the item a goods deed moves (a dragged item); default the held one.
 */
export function actAndPresent(ctx: GameContext, thing: Thing, target: Target, actionId: string, itemId?: string): ActOutcome | undefined {
  const verb = verbOf(actionId);
  const person = target.kind === 'person';
  if (person && !goodsFirst(ctx, verb, target.id, itemId)) {
    ctx.events.emit('act', { actionId, target, outcome: { ok: false } });
    return { ok: false };
  }

  const before = ctx.session.lastResolve();
  const outcome = ctx.session.act(actionId, target);
  const after = ctx.session.lastResolve();
  // Person deeds return no outcome: a fresh 'refused' resolve is how the sim says no.
  const refused = outcome ? !outcome.ok : after !== before && after?.kind === 'refused';

  if (person) {
    if (outcome?.line) sayOrTell(ctx, outcome.line, target.id);
    ctx.voice.sfx(refused ? 'refuse' : 'act');
  } else if (refused) {
    ctx.voice.tell(outcome?.line ?? 'Not now.', 'player');
    ctx.voice.sfx('refuse');
  } else {
    if (outcome?.line) ctx.voice.tell(outcome.line, 'player');
    ctx.voice.sfx(CUE_BY_VERB[verb] ?? 'act');
    if (SCENE_VERBS.has(verb)) sceneChange(ctx, verb, thing);
    const part = REFRESH_BY_VERB[verb] ?? REFRESH_BY_KIND[target.kind];
    if (part) ctx.world.refresh(part);
    if (outcome?.hours) {
      const ph = ctx.world.phase();
      ctx.world.setPhase(Math.max(ph, Math.min(SHIFT_PHASE_CAP, ph + outcome.hours / 24)));
    }
  }

  ctx.events.emit('act', { actionId, target, ...(outcome ? { outcome } : {}) });
  ctx.events.emit('inventory', {});
  return outcome;
}
