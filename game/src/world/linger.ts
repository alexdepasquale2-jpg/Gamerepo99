/**
 * Lingering, the scene side: no "Rest in shade" chip. Stop by a tree, a rock, a log, a fire, a tent or a
 * shrine (props.json `linger` tags) and stand still for a few seconds: the player sits down (or stands quiet
 * at a shrine), a small line says how it feels, and every few seconds the sitting is counted into the sim
 * (session.linger → sim/linger.ts), where spark trickles in under the daily prop cap. Any step stands you up.
 *
 * Dev: `__hearth.dev.linger(kindOrTag, seconds?)` sits by the nearest such prop (or a stand-in) and returns
 * the spark it gave.
 */
import type { FacilityRenderView } from '../sim/map/types';
import type { GameContext, Pt } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { setPlayerPose } from '../app/pose';
import { LINGER_TAGS, lingerLine, lingerSpent, lingerTagOf, lingerTypesOf, type LingerTag } from '../sim/linger';

type PropsNear = (near: Pt, radius: number) => { prop: FacilityRenderView; x: number; y: number }[];
type Spot = { key: string; tag: LingerTag; x: number; y: number };

/** Seconds standing still before you sit. */
const STILL_SECS = 3;
/** How close to the prop's foot counts as by it (a little past the ring's reach: you sit beside it). */
const REACH = 46;
/** Seconds sat between counts into the sim (fewer session calls; the remainder is flushed on standing). */
const COUNT_SECS = 5;
/** At least this long between flavour lines while sitting on. */
const LINE_GAP_SECS = 25;
const SCAN_SECS = 0.25;

const nearby = new WeakMap<GameContext, PropsNear>();

/** The nearest linger prop within `radius` of a point (optionally of one type or tag). */
function nearest(props: PropsNear, at: Pt, radius: number, want?: string): Spot | null {
  let best: Spot | null = null, bestD = Infinity;
  for (const { prop, x, y } of props(at, radius)) {
    const tag = lingerTagOf(prop.type);
    if (!tag || (want && want !== tag && want !== prop.type)) continue;
    const d = Math.hypot(x - at.x, y - at.y);
    if (d < bestD) { bestD = d; best = { key: `prop:${prop.type}@${prop.position.x},${prop.position.y}`, tag, x, y }; }
  }
  return best;
}

export function attachLinger(ctx: GameContext, props: PropsNear): () => void {
  nearby.set(ctx, props);
  let spot: Spot | null = null;
  let still = 0, scan = 0, pending = 0, sinceLine = 0, lines = 0;
  let seated = false;
  let last: Pt | null = null;
  let spentDay = -1;

  const say = (line: string): void => {
    if (!line) return;
    try { ctx.voice.say('player', line); } catch { /* voice not attached yet */ }
    sinceLine = 0;
    lines += 1;
  };
  const count = (): void => {
    if (!spot || pending <= 0) return;
    const secs = pending;
    pending = 0;
    ctx.session.linger(spot.key, secs);
    const st = ctx.session.getState();
    // Once a day, say so when sitting stops paying: the road is waiting.
    if (st && lingerSpent(st) && spentDay !== st.day) {
      spentDay = st.day;
      say(lingerLine(st, spot.tag, spot.key, true));
    }
  };
  const standUp = (): void => {
    if (seated) count();
    seated = false;
    still = 0;
    pending = 0;
    setPlayerPose(ctx, null);
  };
  const blocked = (): boolean => {
    try { return !!ctx.world.room() || ctx.ui.blocking() || ctx.interact.isOpen(); } catch { return true; }
  };

  const update = (_time: number, deltaMs: number): void => {
    const dt = Math.min(0.25, deltaMs / 1000);
    const player = ctx.actors?.player;
    if (!player) return;
    const at = player.pos();
    const moved = !!last && Math.hypot(at.x - last.x, at.y - last.y) > 0.5;
    last = at;
    if (moved || blocked()) { standUp(); spot = null; return; }
    scan -= dt;
    if (!seated && scan <= 0) {
      scan = SCAN_SECS;
      const next = nearest(props, at, REACH);
      if (next?.key !== spot?.key) still = 0;
      spot = next;
    }
    if (!spot) return;
    still += dt;
    if (!seated) {
      if (still < STILL_SECS) return;
      seated = true;
      lines = 0;
      setPlayerPose(ctx, LINGER_TAGS[spot.tag].pose);
      const st = ctx.session.getState();
      if (st) say(lingerLine(st, spot.tag, `${spot.key}|sit`, lingerSpent(st)));
      if (st && lingerSpent(st)) spentDay = st.day;
      return;
    }
    pending += dt;
    sinceLine += dt;
    if (pending >= COUNT_SECS) {
      const st = ctx.session.getState();
      const before = st?.player.spark ?? 0;
      count();
      // A gain earns a fresh line now and then, so the sitting is felt without a running commentary.
      if (st && st.player.spark > before && sinceLine >= LINE_GAP_SECS) say(lingerLine(st, spot.tag, `${spot.key}|${lines}`));
    }
  };

  ctx.scene.events.on('update', update);
  const offs = [ctx.events.on('state-replaced', () => { standUp(); spot = null; })];
  return () => {
    ctx.scene.events.off('update', update);
    offs.forEach((off) => off());
    nearby.delete(ctx);
  };
}

registerDevHook('linger', (ctx) => (kind: string, seconds = 30) => {
  const props = nearby.get(ctx);
  const player = ctx.actors.player;
  const found = props ? nearest(props, player.pos(), 1600, kind) : null;
  if (found) player.setPos({ x: found.x, y: found.y + 12 });
  // No such prop drawn near you: a stand-in key of that tag (or type) still exercises the sim side.
  const type = found ? null : (LINGER_TAGS[kind as LingerTag] ? lingerTypesOf(kind as LingerTag)[0] : kind);
  const key = found?.key ?? `prop:${type}@0,0`;
  const gain = ctx.session.linger(key, seconds);
  return { key, tag: found?.tag ?? lingerTagOf(type ?? ''), gain, spark: ctx.session.getState()?.player.spark ?? 0, drawn: !!found };
});
