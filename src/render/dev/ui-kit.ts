/**
 * `window.__hearth.dev.ui`: UI-kit probes for e2e. Where the HUD sits in CSS px (spark bar, canvas),
 * every open sheet / menu / modal, and direct openers for the trade sheet and the road sheet.
 */
import { registerDevHook } from '../dev-hooks';
import { FEEL } from '../feel';
import { overlays } from '../../ui/kit/overlay-stack';
import { tileFootWorld } from '../depth-sort';

type Box = { left: number; top: number; width: number; height: number };
type SceneLike = {
  game: { canvas: HTMLCanvasElement };
  scale: { width: number; height: number };
  goods: { openTrade: (id?: string) => boolean };
  roads: { signpost: (townId: string) => { q: number; r: number } | null; interact: (p: { x: number; y: number }) => boolean };
};

const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

registerDevHook('ui', ({ scene, session }) => {
  const s = scene as SceneLike;
  const toCss = (x: number, y: number, w: number, h: number): Box => {
    const c = s.game.canvas.getBoundingClientRect();
    const k = c.width / s.scale.width;
    return { left: c.left + x * k, top: c.top + y * k, width: w * k, height: h * k };
  };
  return {
    /** Canvas and spark-bar rects in CSS px. */
    hud: () => {
      const h = FEEL.hud;
      return {
        canvas: box(s.game.canvas.getBoundingClientRect()),
        spark: toCss(h.sparkBarX, h.sparkBarY - h.sparkBarHeight / 2, h.sparkBarWidth, h.sparkBarHeight),
      };
    },
    /** Open overlay-stack entries, top last, with their on-screen rect. */
    open: () => overlays.list().map((e) => {
      const el = document.getElementById(e.id);
      return { id: e.id, kind: e.kind, pause: !!e.pause, rect: el ? box(el.getBoundingClientRect()) : null };
    }),
    openTrade: (caravanId?: string) => s.goods.openTrade(caravanId),
    /** Open the road sheet at the player's town signpost (as E there does). */
    openRoads: () => {
      const town = session.snapshot().townId;
      const post = s.roads.signpost(town);
      if (!post) return false;
      return s.roads.interact(tileFootWorld(post.q, post.r));
    },
  };
});
