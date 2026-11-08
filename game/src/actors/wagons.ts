/**
 * Traffic on the roads: trade wagons (the sim's caravans, drawn with their ox and status, and Things of
 * kind 'wagon'), village carts carrying goods to a short town, and couriers walking letters. Caravans
 * roll on in real time (advanceCaravanTravel); carts and couriers move a stage per dawn and ease there.
 * Only traffic inside the camera has sprites.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt, Thing } from '../app/contracts';
import { advanceCaravanTravel } from '../sim/caravans';
import { caravanStatus } from '../sim/caravan-visit';
import { cartPosition } from '../sim/economy/logistics';
import { couriersOnRoad } from '../sim/letter-replies';
import type { RoadPosition } from '../sim/road-journey';
import type { LayoutRoute } from '../sim/map/world-layout';
import type { CaravanMobile } from '../sim/caravans-types';
import { ART_SCALE, ensureShadow, vehicleTexture } from './looks';
import type { NameLayer } from './name-layer';
import { safe } from './player';
import { footOf, inRect, viewRect } from './towns';

/** Real ms per game day of caravan travel (as the old living world). */
const DAY_MS = 120_000;
const SLOW_EVERY = 0.25;

type Mover = { x: number; y: number; dx: number; seen: boolean; parts: Phaser.GameObjects.GameObject[] };

export type WagonsCtl = {
  update(dt: number, timeSec: number, names: NameLayer): void;
  things(near: Pt, radius: number): Thing[];
  list(): { id: string; kind: 'wagon' | 'cart' | 'courier'; x: number; y: number }[];
  destroy(): void;
};

export function createWagons(ctx: GameContext): WagonsCtl {
  const scene = ctx.scene;
  const routes = new Map<string, LayoutRoute>(ctx.layout.routes.map((r) => [r.id, r]));
  const pos = new Map<string, { kind: 'wagon' | 'cart' | 'courier'; x: number; y: number; dx: number; label?: string }>();
  const movers = new Map<string, Mover>();
  let slow = 0;

  const roadPx = (routeId: string, f: number): Pt | null => {
    const r = routes.get(routeId);
    if (!r) return null;
    const p = ctx.world.nav.roadPoint(r.path, Math.max(0, Math.min(1, f)));
    return footOf(p.q, p.r);
  };
  const along = (rp: RoadPosition): { p: Pt; dx: number } | null => {
    const r = routes.get(rp.routeId);
    if (!r) return null;
    const f = r.from === rp.from ? rp.f : 1 - rp.f;
    const dir = r.from === rp.from ? 1 : -1;
    const p = roadPx(rp.routeId, f), q = roadPx(rp.routeId, f + dir * 0.01);
    return p && q ? { p, dx: q.x - p.x } : null;
  };

  /** Which caravan the player is dealing with (it halts while you trade). */
  const stopped = (): string | undefined => {
    const f = safe(() => ctx.interact.focus(), null);
    if (f?.kind !== 'wagon') return undefined;
    return safe(() => ctx.interact.isOpen() || ctx.panels.anyOpen(), false) ? f.id : undefined;
  };

  const caravanAt = (m: CaravanMobile): { p: Pt; dx: number } | null => {
    const f = m.heading === 'outbound' ? m.progress01 : 1 - m.progress01;
    const p = roadPx(m.routeId, f);
    const q = roadPx(m.routeId, f + (m.heading === 'outbound' ? 0.004 : -0.004));
    if (!p || !q) return null;
    const turned = m.phase === 'departing';
    return { p, dx: (q.x - p.x) * (turned ? -1 : 1) };
  };

  const build = (id: string, kind: 'wagon' | 'cart' | 'courier', x: number, y: number): Mover => {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const shadow = scene.add.image(x, y, ensureShadow(scene)).setScale(kind === 'wagon' ? 3 : 1.4, 1.2);
    parts.push(shadow);
    if (kind === 'wagon') {
      parts.push(scene.add.sprite(x, y, vehicleTexture(scene, 'wagon'), '0').setOrigin(0.5, 1).setScale(ART_SCALE));
      parts.push(scene.add.sprite(x, y, vehicleTexture(scene, 'ox'), '0').setOrigin(0.5, 1).setScale(ART_SCALE));
    } else parts.push(scene.add.sprite(x, y, vehicleTexture(scene, kind), '0').setOrigin(0.5, 1).setScale(ART_SCALE));
    const m: Mover = { x, y, dx: 1, seen: true, parts };
    movers.set(id, m);
    return m;
  };

  function refreshSlow(): void {
    const st = ctx.session.getState();
    for (const [id, p] of pos) if (p.kind !== 'wagon') pos.delete(id);
    if (!st) return;
    for (const c of st.logistics?.carts ?? []) {
      const rp = cartPosition(c);
      const a = rp && along(rp);
      if (a) pos.set(`cart:${c.id}`, { kind: 'cart', x: a.p.x, y: a.p.y, dx: a.dx, label: `${c.qty} ${c.itemId.replace(/_/g, ' ')}` });
    }
    for (const c of couriersOnRoad(st)) {
      const a = along(c.pos);
      if (a) pos.set(`courier:${c.id}`, { kind: 'courier', x: a.p.x, y: a.p.y, dx: a.dx, label: c.kind === 'reply' ? 'A reply' : 'Your letter' });
    }
  }

  return {
    update(dt, timeSec, names) {
      const st = ctx.session.getState();
      if (!st) return;
      advanceCaravanTravel(st, (dt * 1000) / DAY_MS, stopped());
      const live = new Set<string>();
      for (const m of st.caravans ?? []) {
        const a = caravanAt(m);
        if (!a) continue;
        live.add(m.id);
        pos.set(m.id, { kind: 'wagon', x: a.p.x, y: a.p.y, dx: a.dx, label: caravanStatus(m) });
      }
      for (const [id, p] of pos) if (p.kind === 'wagon' && !live.has(id)) pos.delete(id);
      slow -= dt;
      if (slow <= 0) { slow = SLOW_EVERY; refreshSlow(); }

      const vr = viewRect(scene, 96);
      const lr = viewRect(scene, 8);
      const indoors = !!safe(() => ctx.world.room(), null);
      for (const m of movers.values()) m.seen = false;
      if (!indoors) for (const [id, p] of pos) {
        if (!inRect(vr, p.x, p.y)) continue;
        const m = movers.get(id) ?? build(id, p.kind, p.x, p.y);
        m.seen = true;
        const ease = p.kind === 'wagon' ? 1 : Math.min(1, dt * 1.5);
        const ox = m.x;
        m.x += (p.x - m.x) * ease;
        m.y += (p.y - m.y) * ease;
        if (Math.abs(p.dx) > 0.2) m.dx = p.dx;
        const rolling = Math.abs(m.x - ox) > 0.05 || (p.kind === 'courier' && Math.hypot(p.x - m.x, p.y - m.y) > 1);
        const frame = rolling ? String(Math.floor(timeSec * 5) % 2) : '0';
        const left = m.dx < 0;
        const [shadow, body, ox2] = m.parts as [Phaser.GameObjects.Image, Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite | undefined];
        shadow.setPosition(m.x, m.y - 1).setDepth(m.y - 0.5);
        body.setPosition(m.x, m.y).setDepth(m.y).setFlipX(left).setFrame(frame);
        if (ox2) {
          const oxX = m.x + (left ? -1 : 1) * 46;
          ox2.setPosition(oxX, m.y).setDepth(m.y + 0.1).setFlipX(left).setFrame(frame);
        }
        if (p.label && inRect(lr, m.x, m.y)) {
          names.put(`w:${id}`, m.x, m.y - (p.kind === 'wagon' ? 50 : 36), { text: p.kind === 'wagon' ? `Trader · ${p.label}` : p.label, alpha: 0.85, muted: p.kind !== 'wagon' });
        }
      }
      for (const [id, m] of movers) if (!m.seen) { m.parts.forEach((o) => o.destroy()); movers.delete(id); }
    },
    things(near, radius) {
      const out: Thing[] = [];
      for (const [id, p] of pos) {
        if (p.kind !== 'wagon') continue;
        const m = movers.get(id);
        const x = m?.x ?? p.x, y = m?.y ?? p.y;
        if (Math.hypot(x - near.x, y - near.y) > radius) continue;
        out.push({ key: `wagon:${id}`, kind: 'wagon', id, x, y, label: 'Trader', target: { kind: 'wagon', id }, reach: 64 });
      }
      return out;
    },
    list: () => [...pos.entries()].map(([id, p]) => ({ id, kind: p.kind, x: Math.round(p.x), y: Math.round(p.y) })),
    destroy() { for (const m of movers.values()) m.parts.forEach((o) => o.destroy()); movers.clear(); },
  };
}
