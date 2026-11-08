/**
 * One interaction model: the focus resolver picks the single thing in front of the player each frame, the
 * one world prompt sits over it, and E / Enter / a tap / the Act button opens that thing's ring. A thing
 * with one verb (and no held-item verb) just does it; people always show their ring.
 *
 * Verbs come from session.listVerbs for the focused (or tapped) target only, never the whole world, and are
 * cached until the focus changes, an act lands, the held item changes or dawn comes. The held item rides
 * on the target as `data.heldItem`, so sim providers can offer "Use <item>" verbs for it.
 */
import type { GameContext, Pt, Thing } from '../app/contracts';
import type { ActOutcome } from '../sim/play-session/action-providers';
import { targetActionId, type Target } from '../sim/play-session/targets';
import { groupVerbs, shortLabel, type RingChip, type Verb } from '../sim/play-session/verb-families';
import { itemName } from '../sim/goods/inventory';
import { SCAN_RADIUS, dist, pickFocus, reachOf, thingAt } from './focus';
import { createLayer } from './layer';
import { createPrompt } from './prompt';
import { createRing } from './ring';
import { attachInput } from './input';
import { actAndPresent, verbOf } from './present';
import { createHold, isWorkSpot } from './hold';

/** How far past its reach the player may wander before an open ring closes. */
const RING_SLACK = 2.2;
/** A dragged item can be given to someone this far past their reach. */
const DROP_SLACK = 2.2;
/** Where the prompt and ring hang over a thing that has no head. */
const THING_TOP = 20;
const HEAD_FALLBACK = 30;

export type Controller = ReturnType<typeof createController>;

export function createController(ctx: GameContext) {
  const layer = createLayer(ctx.scene);
  const prompt = createPrompt(layer);
  const ring = createRing(layer);
  let focus: Thing | null = null;
  let ringThing: Thing | null = null;
  let actLabel: string | null | undefined;
  const cache = new Map<string, { verbs: Verb[]; held: Set<string> }>();
  const invalidate = (): void => cache.clear();

  const held = (): string | null => ctx.panels.satchel.held();
  /** The target as the sim sees it: the thing's own data plus the item in hand. */
  function targetFor(thing: Thing): Target {
    const item = held();
    if (!item) return thing.target;
    const base = thing.target.data;
    if (base !== undefined && (typeof base !== 'object' || base === null)) return thing.target;
    return { ...thing.target, data: { ...(base as object | undefined), heldItem: item } };
  }

  /** Ring verbs for one thing (cached); held-item verbs are marked so the chip shows it. */
  function verbsFor(thing: Thing): { verbs: Verb[]; held: Set<string> } {
    const item = held();
    const key = `${thing.key}|${item ?? ''}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const marked = new Set<string>();
    const name = item ? itemName(item) : '';
    const verbs = ctx.session.listVerbs(targetFor(thing)).map((v) => {
      const verb = verbOf(v.id);
      if (item && item !== 'coin' && verb === 'gift_give') {
        marked.add(v.id);
        return { ...v, label: `Give ${name}`, short: shortLabel({ label: `Give ${name}` }) };
      }
      if (item && (verb.startsWith('use') || v.label.startsWith(`Use ${name}`))) marked.add(v.id);
      return v;
    });
    const out = { verbs, held: marked };
    cache.set(key, out);
    return out;
  }

  const candidates = (at: Pt, r: number, facing?: { dx: number; dy: number }): Thing[] => [
    ...ctx.world.things(at, r, facing),
    ...ctx.actors.things(at, r),
  ];
  /** The live copy of a thing by key (people walk), searched around the player. */
  const fresh = (key: string, r = SCAN_RADIUS): Thing | null =>
    // With facing, so the tile in front of the player (land work) can be found by key too.
    candidates(ctx.actors.player.pos(), r, ctx.actors.player.facing()).find((t) => t.key === key) ?? null;

  function anchorOf(thing: Thing): Pt {
    if (thing.kind === 'person') return ctx.actors.headOf(thing.id) ?? { x: thing.x, y: thing.y - HEAD_FALLBACK };
    return { x: thing.x, y: thing.y - THING_TOP };
  }

  const blocked = (): boolean => ctx.ui.blocking();

  function labels(thing: Thing | null): { act: string | null; hint?: string } {
    if (!thing) return { act: null };
    const { verbs } = verbsFor(thing);
    if (!verbs.length) return { act: null };
    if (thing.kind === 'person') return { act: 'Talk' };
    if (verbs.length === 1) return { act: shortLabel(verbs[0]!), hint: shortLabel(verbs[0]!) };
    return { act: thing.label };
  }

  function setFocus(next: Thing | null): void {
    const changed = (next?.key ?? null) !== (focus?.key ?? null);
    focus = next;
    if (changed) {
      invalidate();
      ctx.events.emit('focus', { thing: next });
    }
    const act = labels(next).act;
    if (act !== actLabel) {
      actLabel = act;
      ctx.ui.setActLabel(act);
    }
  }

  function close(): void {
    const was = ring.isOpen();
    ring.close();
    ringThing = null;
    if (was) ctx.events.emit('overlay', { open: false });
  }

  function act(thing: Thing, verbId: string, itemId?: string): ActOutcome | undefined {
    close();
    const actionId = verbId.includes('@') ? verbId : targetActionId(verbId, thing.target);
    const out = actAndPresent(ctx, thing, targetFor(thing), actionId, itemId);
    invalidate();
    actLabel = undefined; // the focused thing's verbs may have changed: re-label next frame
    return out;
  }

  function open(thing?: Thing): void {
    const t = thing ?? focus;
    if (!t || (blocked() && !ring.isOpen())) return;
    close();
    const { verbs, held: marked } = verbsFor(t);
    if (!verbs.length) {
      ctx.voice.tell(`Nothing to do with ${t.label} now.`, 'player');
      return;
    }
    // A thing with one verb does it; people always show their ring.
    if (t.kind !== 'person' && verbs.length === 1) {
      act(t, verbs[0]!.id);
      return;
    }
    ringThing = t;
    prompt.show(null);
    ring.open(() => (ringThing ? anchorOf(ringThing) : null), groupVerbs(verbs), (c: RingChip) => {
      if (ringThing) act(ringThing, c.id);
    }, { held: marked });
    ctx.events.emit('overlay', { open: true });
  }

  /** Per frame (after the actors moved): place the ring or pick the focus and place the prompt. */
  function update(): void {
    layer.sync();
    hold.update();
    const player = ctx.actors.player.pos();
    if (ring.isOpen()) {
      const t = ringThing;
      const head = t?.kind === 'person' ? ctx.actors.headOf(t.id) : undefined;
      const live = t && (t.kind === 'person' ? (fresh(t.key, SCAN_RADIUS * RING_SLACK) ?? (head ? { ...t, x: head.x, y: head.y + HEAD_FALLBACK } : null)) : t);
      if (live) ringThing = live;
      if (!live || dist(player, live) > reachOf(live) * RING_SLACK || !ring.place()) close();
      return;
    }
    if (blocked()) {
      setFocus(null);
      prompt.show(null);
      return;
    }
    setFocus(pickFocus(candidates(player, SCAN_RADIUS, ctx.actors.player.facing()), player, ctx.actors.player.facing()));
    if (!focus) {
      prompt.show(null);
      return;
    }
    const { act: a, hint } = labels(focus);
    prompt.show(a ? anchorOf(focus) : null, focus.label, hint);
  }

  /** A hotbar item let go at a viewport point: over a person in reach, it is the gift. */
  function dropItem(itemId: string, client: Pt): boolean {
    if (blocked() || !itemId || itemId === 'coin') return false;
    const at = layer.toWorld(client);
    const who = thingAt(ctx.actors.things(at, SCAN_RADIUS).filter((t) => t.kind === 'person'), at);
    if (!who) return false;
    if (dist(ctx.actors.player.pos(), who) > reachOf(who) * DROP_SLACK) {
      ctx.voice.tell('Too far to hand it over.', 'player');
      return true;
    }
    const gift = ctx.session.listVerbs(who.target).find((v) => verbOf(v.id) === 'gift_give');
    if (!gift) {
      ctx.voice.tell(`${who.label} won't take anything just now.`, who.id);
      ctx.voice.sfx('refuse');
      return true;
    }
    act(who, gift.id, itemId);
    return true;
  }

  // Work spots are held, not opened: E down starts the hold, E up ends it (a quick tap gives the hint).
  const hold = createHold(ctx, { focus: () => focus, fresh: (key) => fresh(key), blocked });

  const detachInput = attachInput({
    ctx,
    ring,
    ringThing: () => ringThing,
    focus: () => focus,
    blocked,
    thingUnder: (p) => thingAt(candidates(p, SCAN_RADIUS), p),
    fresh: (key) => fresh(key),
    open: (t) => open(t),
    close,
    hold: { start: () => (isWorkSpot(focus) ? hold.start() : false), end: () => hold.end(), active: () => hold.active() },
  });

  const offs = [
    ctx.events.on('dawn', invalidate),
    ctx.events.on('held-item', invalidate),
    ctx.events.on('state-replaced', () => { close(); invalidate(); }),
    ctx.events.on('arrive', () => { close(); invalidate(); }),
    ctx.events.on('room-enter', () => { close(); invalidate(); }),
    ctx.events.on('room-leave', () => { close(); invalidate(); }),
    ctx.events.on('rest-start', () => close()),
  ];

  function destroy(): void {
    detachInput();
    hold.destroy();
    for (const off of offs) off();
    layer.destroy();
  }

  return {
    update,
    open,
    close,
    act,
    dropItem,
    destroy,
    isOpen: () => ring.isOpen(),
    focus: () => focus,
    ringThing: () => ringThing,
    ringView: () => ring.view(),
    promptText: () => prompt.text(),
    verbsFor,
    targetFor,
    fresh,
    hold,
  };
}
