/**
 * QA hooks for the one interaction model:
 *  - dev.focus(kind?)       what is in focus now: { kind, id, prompt, verbs: [{ id, label }] } or null;
 *                           with a kind, first stand beside the nearest such thing (facing it)
 *  - dev.act(ref, verb)     act a verb on a thing ('kind:id' or { kind, id }; verb or full act id), as the
 *                           ring would: { ok, line?, actionId }. The thing is looked up among those in reach,
 *                           so it carries its scene data (a node's kind, a door's interior).
 *  - dev.ringView()         the ring as it shows now: { family, chips: [{ id, label, tip?, verbs? }] } or null
 */
import { registerDevHook } from '../dev-hooks';
import { isTargetKind, parseTargetKey, type TargetKind, type TargetRef } from '../../sim/play-session/targets';
import type { InteractController } from '../interact/interact-controller';
import type { ActionRing } from '../action-ring';

type SceneWith = { interactions?: InteractController; ring?: ActionRing; debugFocusKind?: (k: TargetKind) => boolean };
const refOf = (r: string | TargetRef): TargetRef | null => (typeof r === 'string' ? parseTargetKey(r) : r);

/** dev.focus(): the focus now. dev.focus(kind): first walk beside the nearest thing of that kind. */
registerDevHook('focus', ({ scene }) => (kind?: TargetKind) => {
  const s = scene as SceneWith;
  if (kind && isTargetKind(kind) && !s.debugFocusKind?.call(scene, kind)) return null;
  return s.interactions?.focusView() ?? null;
});

registerDevHook('act', ({ scene }) => (ref: string | TargetRef, verb: string) => {
  const ctl = (scene as SceneWith).interactions;
  const t = refOf(ref);
  if (!ctl || !t) return { ok: false, line: 'no target', actionId: verb };
  return ctl.act(t, verb);
});

registerDevHook('ringView', ({ scene }) => () => (scene as SceneWith).ring?.view() ?? null);
