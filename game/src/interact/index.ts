/**
 * INTERACT area: the focus resolver, the one world prompt, the ring, act → present, held-item verbs,
 * drag-to-give, keyboard + tap input. See game/README.md ("One way to act on anything").
 *
 *  focus.ts       pick the one thing in front of the player (pure)
 *  layer.ts       DOM layer over the canvas (world px ↔ CSS px), styles
 *  prompt.ts      the one world prompt
 *  ring.ts        the ≤ 6-chip ring (families first, then verbs), tips, long-press
 *  input.ts       E / Enter / 1–6 / Esc, tap a thing (walk there first when far)
 *  present.ts     session.act → line, cue, sheet, room, rest, world refresh, shift hours
 *  controller.ts  ties them together; verbs for the focused thing only, cached
 *  hold.ts        hold E (or the A button) on a work spot to help: an arc fills, one effort unit to session.workAt
 */
import Phaser from 'phaser';
import type { GameContext, InteractApi, Thing } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { parseTargetKey, type TargetRef } from '../sim/play-session/targets';
import { flattenChips, groupVerbs } from '../sim/play-session/verb-families';
import { createController, type Controller } from './controller';
import { SCAN_RADIUS } from './focus';

const controllers = new WeakMap<GameContext, Controller>();

export function attachInteract(ctx: GameContext): InteractApi {
  const c = createController(ctx);
  controllers.set(ctx, c);
  // After the actors moved this frame (the shell runs them in scene.update).
  ctx.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, c.update);
  let torn = false;
  const teardown = (): void => {
    if (torn) return;
    torn = true;
    ctx.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, c.update);
    c.destroy();
  };
  ctx.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
  ctx.scene.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  return {
    focus: c.focus,
    open: (thing) => c.open(thing),
    close: c.close,
    isOpen: c.isOpen,
    act: (thing, verbId) => c.act(thing, verbId),
    dropItem: c.dropItem,
    startHold: () => c.hold.start(),
    endHold: () => c.hold.end(),
  };
}

// ---- QA hooks (window.__hearth.dev) ----

const ctl = (ctx: GameContext): Controller => {
  const c = controllers.get(ctx);
  if (!c) throw new Error('interact not attached');
  return c;
};

/** A thing by key: the live one near the player (with its scene data), else a bare one at the player. */
function thingByKey(ctx: GameContext, key: string): Thing | null {
  const live = ctl(ctx).fresh(key, SCAN_RADIUS * 4);
  if (live) return live;
  const ref: TargetRef | null = parseTargetKey(key);
  if (!ref) return null;
  const p = ctx.actors.player.pos();
  return { key: `${ref.kind}:${ref.id}`, kind: ref.kind, id: ref.id, x: p.x, y: p.y, label: ref.id, target: { ...ref } };
}

const chipView = (c: { id: string; label: string; tip?: string; savage: boolean }) =>
  ({ id: c.id, label: c.label, savage: c.savage, ...(c.tip ? { tip: c.tip } : {}) });

registerDevHook('focus', (ctx) => () => {
  const c = ctl(ctx);
  const f = c.focus();
  if (!f) return null;
  return { key: f.key, kind: f.kind, id: f.id, label: f.label, prompt: c.promptText(), verbs: c.verbsFor(f).verbs.map((v) => ({ id: v.id, label: v.label })) };
});

registerDevHook('act', (ctx) => (thingKey: string, verbId: string) => {
  const thing = thingByKey(ctx, thingKey);
  if (!thing) return { ok: false, line: 'no such thing' };
  const out = ctl(ctx).act(thing, verbId);
  return { ok: out?.ok ?? true, ...(out?.line ? { line: out.line } : {}), said: ctx.voice.last() };
});

registerDevHook('ring', (ctx) => () => {
  const c = ctl(ctx);
  const v = c.ringView();
  return v ? { thing: c.ringThing()?.key ?? null, ...v } : null;
});

registerDevHook('openRing', (ctx) => (thingKey?: string) => {
  const c = ctl(ctx);
  const thing = thingKey ? thingByKey(ctx, thingKey) : c.focus();
  if (thing) c.open(thing);
  return c.ringView();
});

registerDevHook('chips', (ctx) => (personId: string) => {
  const c = ctl(ctx);
  const thing = thingByKey(ctx, `person:${personId}`);
  if (!thing) return [];
  return flattenChips(groupVerbs(c.verbsFor(thing).verbs)).map(chipView);
});
