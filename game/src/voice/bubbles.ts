/**
 * Speech bubbles, tells and tips over heads. Max one bubble per person (later lines wait behind it);
 * one tell and one tip per anchor (a newer one replaces the older). Everything follows its anchor every
 * frame, is culled off-camera, and only spends its reading time while it is on screen (with a wall-clock
 * cap so nothing lingers forever). At one anchor the bubble sits lowest, the tell above it, the tip on top.
 */
import type { Pt } from '../app/contracts';
import type { VoiceLayer } from './layer';
import { readMs } from './style';

export type Tone = 'warm' | 'plain' | 'hard';
export type Anchor = string | Pt;
type Kind = 'bubble' | 'tell' | 'tip';

type Item = {
  kind: Kind;
  key: string;
  anchor: Anchor;
  text: string;
  el: HTMLElement;
  /** Reading time left (ms), spent only while on screen. */
  left: number;
  /** Wall-clock deadline (ms since stage start). */
  cap: number;
  w: number;
  h: number;
  done: () => void;
};

type Waiting = { text: string; opts: BubbleOpts; done: () => void };
export type BubbleOpts = { tone?: Tone; ms?: number; name?: string; ember?: boolean };
export type ShownItem = { kind: Kind; key: string; text: string; onScreen: boolean };

const ORDER: Kind[] = ['bubble', 'tell', 'tip'];
const MAX_WAITING = 4;
/** Extra wall time an item may wait off-screen before it is dropped. */
const OFF_SCREEN_GRACE = 15000;

export const anchorKey = (a: Anchor): string => (typeof a === 'string' ? a : `@${Math.round(a.x)},${Math.round(a.y)}`);

export type Stage = ReturnType<typeof createStage>;

export function createStage(layer: VoiceLayer, headOf: (id: string) => Pt | undefined) {
  const items = new Map<string, Item>(); // `${kind}|${anchorKey}`
  const waiting = new Map<string, Waiting[]>();
  const onScreen = new Set<string>();
  let clock = 0;
  let lastU = layer.u();

  const posOf = (a: Anchor): Pt | undefined => (typeof a === 'string' ? headOf(a) : a);

  const measure = (it: Item): void => {
    it.w = it.el.offsetWidth;
    it.h = it.el.offsetHeight;
  };

  const make = (kind: Kind, anchor: Anchor, text: string, ms: number, cls: string, done: () => void, build?: (el: HTMLElement) => void): Item => {
    const el = document.createElement('div');
    el.className = `hfv hfv-${kind} ${cls}`.trim();
    if (build) build(el);
    else el.textContent = text;
    el.style.visibility = 'hidden';
    layer.el.appendChild(el);
    const it: Item = { kind, key: anchorKey(anchor), anchor, text, el, left: ms, cap: clock + ms + OFF_SCREEN_GRACE, w: 0, h: 0, done };
    measure(it);
    requestAnimationFrame(() => el.classList.add('on'));
    return it;
  };

  const retire = (id: string, it: Item): void => {
    items.delete(id);
    onScreen.delete(id);
    it.el.classList.add('gone');
    setTimeout(() => it.el.remove(), 300);
    it.done();
    if (it.kind === 'bubble') {
      const next = waiting.get(it.key)?.shift();
      if (next) showBubble(it.key, next.text, next.opts, next.done);
    }
  };

  const showBubble = (speaker: string, text: string, opts: BubbleOpts, done: () => void): void => {
    const ms = opts.ms ?? readMs(text);
    const it = make('bubble', speaker, text, ms, opts.tone ?? '', done, (el) => {
      if (opts.name) {
        const n = document.createElement('span');
        n.className = 'hfv-name';
        n.textContent = opts.name;
        el.appendChild(n);
      }
      if (opts.ember) {
        const pip = document.createElement('span');
        pip.className = 'hfv-ember';
        el.appendChild(pip);
      }
      el.appendChild(document.createTextNode(text));
    });
    items.set(`bubble|${speaker}`, it);
  };

  /** Replace any tell/tip of this kind at the anchor. */
  const place = (kind: 'tell' | 'tip', anchor: Anchor, text: string, cls: string, ms: number): void => {
    const id = `${kind}|${anchorKey(anchor)}`;
    const old = items.get(id);
    if (old) retire(id, old);
    items.set(id, make(kind, anchor, text, ms, cls, () => {}));
  };

  const layout = (): void => {
    const { w: W, h: H } = layer.size();
    const u = layer.u();
    if (u !== lastU) {
      lastU = u;
      for (const it of items.values()) measure(it);
    }
    const byKey = new Map<string, Item[]>();
    for (const it of items.values()) {
      const list = byKey.get(it.key);
      if (list) list.push(it);
      else byKey.set(it.key, [it]);
    }
    for (const [, list] of byKey) {
      list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      const world = posOf(list[0]!.anchor);
      const at = world ? layer.project(world) : undefined;
      const visible = !!at && at.x > -12 && at.x < W + 12 && at.y > -8 && at.y < H + 48;
      let bottom = (at?.y ?? 0) - 4 * u;
      for (const it of list) {
        const id = `${it.kind}|${it.key}`;
        if (!visible || !at) {
          if (onScreen.delete(id)) it.el.style.visibility = 'hidden';
          continue;
        }
        if (!onScreen.has(id)) {
          onScreen.add(id);
          it.el.style.visibility = 'visible';
        }
        const left = Math.round(Math.max(2, Math.min(W - it.w - 2, at.x - it.w / 2)));
        const top = Math.round(Math.max(2, bottom - it.h));
        it.el.style.transform = `translate(${left}px, ${top}px)`;
        if (it.kind === 'bubble') it.el.style.setProperty('--hfv-tail', `${Math.round(Math.max(6 * u, Math.min(it.w - 6 * u, at.x - left)))}px`);
        bottom = top - (it.kind === 'bubble' ? 6 : 2) * u;
      }
    }
  };

  return {
    /** A bubble over a speaker; resolves when it has been read (or dropped). */
    bubble(speaker: string, text: string, opts: BubbleOpts = {}): Promise<void> {
      return new Promise((done) => {
        if (!items.has(`bubble|${speaker}`)) return showBubble(speaker, text, opts, done);
        const q = waiting.get(speaker) ?? [];
        q.push({ text, opts, done });
        while (q.length > MAX_WAITING) q.shift()!.done();
        waiting.set(speaker, q);
      });
    },
    tell(text: string, anchor: Anchor, tone?: Tone): void {
      place('tell', anchor, text, tone === 'hard' ? 'hard' : '', readMs(text));
    },
    tip(text: string, anchor: Anchor): void {
      place('tip', anchor, text, '', readMs(text, 5000));
    },
    /** True while this speaker has a bubble showing or waiting. */
    busy: (speaker: string): boolean => items.has(`bubble|${speaker}`) || !!waiting.get(speaker)?.length,
    update(dtMs: number): void {
      clock += dtMs;
      layer.sync();
      layout();
      for (const [id, it] of [...items]) {
        if (onScreen.has(id)) it.left -= dtMs;
        if (it.left <= 0 || clock >= it.cap) retire(id, it);
      }
    },
    clear(): void {
      for (const q of waiting.values()) for (const w of q) w.done();
      waiting.clear();
      for (const [id, it] of [...items]) retire(id, it);
    },
    shown: (): ShownItem[] => [...items].map(([id, it]) => ({ kind: it.kind, key: it.key, text: it.text, onScreen: onScreen.has(id) })),
  };
}
