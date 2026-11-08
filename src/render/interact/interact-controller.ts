/**
 * One interaction model for the scene: the focus resolver picks the single thing in front of the player,
 * one world prompt sits over it, and E / Enter / a tap opens that thing's own verb ring (people, nodes,
 * facilities, boards, wagons, signposts, doors, the hearth, chests, things on the ground; indoors the
 * resident and the exit). A thing with a single verb just does it. Verbs come from session.listVerbs for
 * the focused target only and are cached until the focus changes, an act lands, or dawn comes.
 */
import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { ActOutcome } from '../../sim/play-session/action-providers';
import { parseTargetAction, targetActionId, targetKey, type Target, type TargetKind, type TargetRef } from '../../sim/play-session/targets';
import { groupVerbs, shortLabel, type Verb } from '../../sim/play-session/verb-families';
import type { ActionRing, Chip } from '../action-ring';
import { pickFocus, type FocusCandidate } from './focus';

type Pt = { x: number; y: number };

export type InteractDeps = {
  scene: Phaser.Scene;
  session: PlaySession;
  ring: ActionRing;
  player: () => Pt;
  facing: () => { dx: number; dy: number };
  /** Every interactable thing near the player right now (cheap positional scan; no verb listing). */
  candidates: () => FocusCandidate[];
  /** True while nothing may be acted on (resting, a sheet open, the road menu, succession). */
  blocked: () => boolean;
  /** Extra verbs the scene adds for a target (indoors: Chat with the resident). */
  extraVerbs?: (t: Target) => Verb[];
  /** A person's verb: the scene's deed path (goods first, juice, vfx). */
  actPerson: (personId: string, chip: Chip) => void;
  /** After a thing's act resolved: open its sheet, play its fade, refresh its sprite, say its line. */
  present: (kind: TargetKind, verb: string, target: Target, outcome: ActOutcome | undefined) => void;
  /** The ring opened on / closed for a person (freeze them in place). */
  onRingFor?: (personId: string | null) => void;
  say: (line: string) => void;
};

export type FocusView = TargetRef & { prompt: string; verbs: { id: string; label: string }[] };

/** How far past its reach a tapped thing may be and still answer (then: walk closer). */
const TAP_SLACK = 2.2;

export function createInteractController(d: InteractDeps) {
  const prompt = d.scene.add
    .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
    .setOrigin(0.5, 1)
    .setDepth(998_500)
    .setVisible(false);
  let focus: FocusCandidate | null = null;
  let ringFor: Target | null = null;
  const cache = new Map<string, Verb[]>();

  const asTarget = (c: TargetRef & { data?: unknown }): Target => ({ kind: c.kind, id: c.id, ...(c.data !== undefined ? { data: c.data } : {}) });
  const verbsOf = (t: Target, fresh = false): Verb[] => {
    const key = targetKey(t);
    let v = fresh ? undefined : cache.get(key);
    if (!v) {
      v = [...d.session.listVerbs(t), ...(d.extraVerbs?.(t) ?? [])];
      cache.set(key, v);
    }
    return v;
  };
  const invalidate = (): void => cache.clear();
  const anchorOf = (c: FocusCandidate): Pt => c.anchor ?? { x: c.x, y: c.y };

  const promptText = (c: FocusCandidate): string | null => {
    const verbs = verbsOf(asTarget(c));
    if (!verbs.length) return null;
    if (c.kind === 'person') return 'E · Talk';
    if (verbs.length === 1) return `E · ${shortLabel(verbs[0]!)}`;
    return 'E · …';
  };

  /** Resolve a verb on a target (the ring's pick, a single-verb E, or dev.act). */
  function run(target: Target, actionId: string): ActOutcome | undefined {
    close();
    if (target.kind === 'person') {
      d.actPerson(target.id, { id: actionId, label: actionId, savage: false });
      invalidate();
      return undefined;
    }
    const verb = parseTargetAction(actionId)?.verb ?? actionId;
    // Scene-only verbs (no '@'), e.g. the room's Chat: presentation alone.
    const out = actionId.includes('@') ? d.session.act(actionId, target) : undefined;
    invalidate();
    d.present(target.kind, verb, target, out);
    return out;
  }

  function open(target: Target, anchor: Pt): boolean {
    const verbs = verbsOf(target, true);
    if (!verbs.length) return false;
    // A thing with one verb does it; people always show their ring.
    if (target.kind !== 'person' && verbs.length === 1) {
      run(target, verbs[0]!.id);
      return true;
    }
    ringFor = target;
    prompt.setVisible(false);
    if (target.kind === 'person') d.onRingFor?.(target.id);
    d.ring.open(anchor, groupVerbs(verbs), (c) => run(target, c.id));
    return true;
  }

  function close(): void {
    d.ring.close();
    if (ringFor?.kind === 'person') d.onRingFor?.(null);
    ringFor = null;
  }

  const api = {
    /** Per frame: pick the focus and place the one prompt. */
    update(time: number): void {
      const next = d.blocked() || d.ring.isOpen() ? null : pickFocus(d.candidates(), d.player(), d.facing());
      if ((next && targetKey(next)) !== (focus && targetKey(focus))) cache.clear();
      focus = next;
      const text = focus ? promptText(focus) : null;
      if (!focus || !text) {
        prompt.setVisible(false);
        return;
      }
      const a = anchorOf(focus);
      prompt.setText(text).setVisible(true).setPosition(a.x, a.y - 2 - Math.abs(Math.sin(time / 300)) * 3);
    },
    /** E / Enter: act on the focus. False when nothing is in focus (the caller may fall back). */
    interact(): boolean {
      if (d.blocked() || d.ring.isOpen()) return false;
      const c = pickFocus(d.candidates(), d.player(), d.facing());
      if (!c) return false;
      focus = c;
      return open(asTarget(c), anchorOf(c));
    },
    /** A tap or click on a thing: same path as E, if it is close enough. */
    tap(c: FocusCandidate): boolean {
      if (d.blocked()) return false;
      const p = d.player();
      if (Math.hypot(c.x - p.x, c.y - p.y) > c.reach * TAP_SLACK) {
        d.say('Too far. Walk closer.');
        return true;
      }
      return open(asTarget(c), anchorOf(c));
    },
    /** A tap on the world near the focused thing acts on it. */
    tapAt(pt: Pt): boolean {
      if (!focus || d.blocked() || d.ring.isOpen()) return false;
      const a = anchorOf(focus);
      if (Math.hypot(pt.x - focus.x, pt.y - focus.y) > 28 && Math.hypot(pt.x - a.x, pt.y - a.y) > 28) return false;
      return open(asTarget(focus), a);
    },
    /** Open the ring on a target directly (dev.ring, the scene's openRing). */
    openOn(c: FocusCandidate): boolean {
      return open(asTarget(c), anchorOf(c));
    },
    close,
    invalidate,
    focus: (): FocusCandidate | null => focus,
    ringTarget: (): Target | null => ringFor,
    /** QA: the focused thing and its verbs. */
    focusView(): FocusView | null {
      const c = focus ?? (d.blocked() ? null : pickFocus(d.candidates(), d.player(), d.facing()));
      if (!c) return null;
      return { kind: c.kind, id: c.id, prompt: promptText(c) ?? '', verbs: verbsOf(asTarget(c)).map((v) => ({ id: v.id, label: v.label })) };
    },
    /**
     * QA: act a verb on a target (`verb` or a full act id). The target is found among the things in
     * reach (so it carries its scene data), else used as given.
     */
    act(ref: TargetRef, verb: string): { ok: boolean; line?: string; actionId: string } {
      const c = d.candidates().find((x) => x.kind === ref.kind && x.id === ref.id);
      const target = c ? asTarget(c) : asTarget(ref);
      const actionId = verb.includes('@') ? verb : targetActionId(verb, target);
      const offered = verbsOf(target, true).some((v) => v.id === actionId);
      if (!offered && !actionId.startsWith('@')) return { ok: false, line: 'not offered', actionId };
      const out = run(target, actionId);
      return { ok: out?.ok ?? true, ...(out?.line ? { line: out.line } : {}), actionId };
    },
    verbsOf,
  };
  return api;
}

export type InteractController = ReturnType<typeof createInteractController>;
