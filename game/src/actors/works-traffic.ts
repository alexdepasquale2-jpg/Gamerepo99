/**
 * The Works in the world (sim/works/where): your convoys rolling the roads with their load, an airship
 * high over them, vehicles parked by your yards, and the war band, either as a column marching behind its
 * banner (soldiers by name, war machines leading) or as a camp of tents in the town it holds. Positions
 * move a stage per dawn in the sim and ease there here, as the village carts do. Only what is inside the
 * camera has sprites. When who is away with the band changes, `onAway` re-syncs the people layer, which
 * leaves such soldiers out of their own town's streets.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import type { RoadPosition } from '../sim/road-journey';
import type { LayoutRoute } from '../sim/map/world-layout';
import { firstNameOf } from '../sim/names';
import { goodName } from '../sim/works/data';
import { townName } from '../sim/works/state';
import { awayWithBand, bandView, convoysOnRoad, parkedVehicles } from '../sim/works/where';
import { airshipStrip, bannerStrip, landshipStrip, steamWagonStrip, tentStrip, warCartStrip } from './draw-works';
import { Figure } from './figure';
import { addStrip, ART_SCALE, ensureShadow, headHeight, vehicleTexture, villagerLook, type PersonLook } from './looks';
import type { NameLayer } from './name-layer';
import { safe } from './player';
import { footOf, inRect, viewRect } from './towns';
import { TILE_PX } from '../sim/map/constants';

const REFRESH_S = 0.25;
/** An airship flies this high (world px) over its shadow. */
const AIR_LIFT = 90;
/** Soldiers walk this far apart along the road (world px), and war machines lead by this much. */
const FILE_GAP_PX = 26;
const LEAD_PX = 90;
const MAX_FIGURES = 12;

type Spot = { key: string; kind: 'vehicle' | 'banner' | 'tent' | 'soldier'; design?: string; personId?: string; x: number; y: number; dx: number; label?: string; muted?: boolean; air?: boolean };
type Sprite = { parts: Phaser.GameObjects.GameObject[]; fig?: Figure; x: number; y: number; dx: number; seen: boolean };

const DESIGN_TEX: Record<string, [string, () => import('./draw-critters').Strip] | 'cart' | 'wagon'> = {
  handcart: 'cart', ox_wagon: 'wagon',
  war_cart: ['works-war-cart', warCartStrip], steam_wagon: ['works-steam', steamWagonStrip],
  landship: ['works-landship', landshipStrip], airship: ['works-airship', airshipStrip],
};

export type WorksTraffic = { update(dt: number, timeSec: number, names: NameLayer): void; list(): Spot[]; destroy(): void };

export function createWorksTraffic(ctx: GameContext, onAway: () => void): WorksTraffic {
  const scene = ctx.scene;
  const routes = new Map<string, LayoutRoute>(ctx.layout.routes.map((r) => [r.id, r]));
  const sprites = new Map<string, Sprite>();
  const looks = new Map<string, PersonLook>();
  let spots: Spot[] = [];
  let wait = 0;
  let awayKey = '';

  // A road's length in world px (its tile path), to space a column in pixels rather than shares of the road.
  const lengths = new Map<string, number>();
  const lengthOf = (routeId: string): number => {
    let n = lengths.get(routeId);
    if (n === undefined) {
      const path = routes.get(routeId)?.path ?? [];
      n = 0;
      for (let i = 1; i < path.length; i++) n += Math.hypot(path[i]!.q - path[i - 1]!.q, path[i]!.r - path[i - 1]!.r) * TILE_PX;
      lengths.set(routeId, (n = Math.max(1, n)));
    }
    return n;
  };
  const px = (routeId: string, d: number): number => d / lengthOf(routeId);
  const roadPx = (routeId: string, f: number): Pt | null => {
    const r = routes.get(routeId);
    if (!r) return null;
    const p = ctx.world.nav.roadPoint(r.path, Math.max(0, Math.min(1, f)));
    return footOf(p.q, p.r);
  };
  /** A point `back` shares behind a road position (toward where it came from), and the way it faces. */
  const onRoad = (rp: RoadPosition, back = 0): { p: Pt; dx: number } | null => {
    const r = routes.get(rp.routeId);
    if (!r) return null;
    const fwd = r.from === rp.from ? 1 : -1;
    const f = (r.from === rp.from ? rp.f : 1 - rp.f) - fwd * back;
    const p = roadPx(rp.routeId, f), q = roadPx(rp.routeId, f + fwd * 0.01);
    return p && q ? { p, dx: q.x - p.x || fwd } : null;
  };
  /** Dry, passable ground near a town's yard (its stores, else where travellers arrive), fanned out by index. */
  const yardSpot = (townId: string, index: number, ring = 0): Pt | null => {
    const base = safe(() => ctx.world.storesAt?.(townId) ?? null, null) ?? safe(() => ctx.world.spawnPoint(townId), null);
    if (!base) return null;
    const offs: Pt[] = [];
    for (let k = 0; k < 24; k++) offs.push({ x: (1 + ring + Math.floor((k % 6) / 2) * 2) * 70 * (k % 2 ? -1 : 1), y: 50 + Math.floor(k / 6) * 60 });
    let found = 0;
    for (const o of offs) {
      const p = { x: base.x + o.x, y: base.y + o.y };
      if (!safe(() => ctx.world.passable(p), false)) continue;
      if (found++ === index) return p;
    }
    return { x: base.x + 60 + index * 40, y: base.y + 40 };
  };
  const loadText = (load: Record<string, number>): string =>
    Object.entries(load).filter(([, n]) => n > 0).slice(0, 2).map(([id, n]) => `${n} ${goodName(id).toLowerCase()}`).join(', ') || 'empty';

  const refresh = (): void => {
    const st = ctx.session.getState();
    const out: Spot[] = [];
    if (st) {
      for (const c of convoysOnRoad(st)) {
        const a = onRoad(c.at);
        if (!a) continue;
        out.push({ key: `convoy:${c.id}`, kind: 'vehicle', design: c.design, x: a.p.x, y: a.p.y, dx: a.dx, air: c.flies,
          label: `${c.name} · ${c.dir === 'out' ? loadText(c.load) : 'coming home'} → ${townName(st, c.to)}` });
      }
      for (const v of parkedVehicles(st)) {
        const p = yardSpot(v.townId, v.index);
        if (p) out.push({ key: `parked:${v.vehicleId}`, kind: 'vehicle', design: v.design, x: p.x, y: p.y, dx: 1, label: `${v.name} (yours)`, muted: true });
      }
      const band = bandView(st);
      if (band?.march) {
        const head = band.march.at;
        const lead = onRoad(head);
        band.vehicles.forEach((v, i) => {
          const a = onRoad(head, -px(head.routeId, LEAD_PX * (i + 1)));
          if (a) out.push({ key: `bandveh:${v.id}`, kind: 'vehicle', design: v.design, x: a.p.x, y: a.p.y, dx: a.dx, label: v.name, muted: true });
        });
        if (lead) out.push({ key: 'banner', kind: 'banner', x: lead.p.x + 10, y: lead.p.y, dx: lead.dx,
          label: `Your band, ${band.march.hostile ? 'marching on' : 'bound for'} ${townName(st, band.march.target)} (${band.soldiers.length})` });
        band.soldiers.slice(0, MAX_FIGURES).forEach((id, i) => {
          const a = onRoad(head, px(head.routeId, FILE_GAP_PX * (i + 1)));
          if (a) out.push({ key: `soldier:${id}`, kind: 'soldier', personId: id, x: a.p.x + (i % 2 ? 5 : -5), y: a.p.y, dx: a.dx, label: firstNameOf(st.people[id]?.name ?? id) ?? id, muted: true });
        });
      } else if (band?.townId) {
        const camp = yardSpot(band.townId, 0, 4);
        if (camp) {
          out.push({ key: 'banner', kind: 'banner', x: camp.x, y: camp.y, dx: 1, label: `Your band's camp (${band.soldiers.length})` });
          out.push({ key: 'tent:0', kind: 'tent', x: camp.x - 46, y: camp.y - 8, dx: 1 });
          if (band.soldiers.length > 4) out.push({ key: 'tent:1', kind: 'tent', x: camp.x + 50, y: camp.y - 4, dx: -1 });
          band.vehicles.forEach((v, i) => out.push({ key: `bandveh:${v.id}`, kind: 'vehicle', design: v.design, x: camp.x - 70 + i * 70, y: camp.y + 46, dx: 1, label: v.name, muted: true }));
          // Soldiers away from home stand about the camp (at home, the town's streets have them).
          band.soldiers.filter((id) => awayWithBand(st, id)).slice(0, MAX_FIGURES).forEach((id, i) => {
            const ang = (i / Math.max(1, Math.min(MAX_FIGURES, band.soldiers.length))) * Math.PI * 2;
            out.push({ key: `soldier:${id}`, kind: 'soldier', personId: id, x: camp.x + Math.cos(ang) * 40, y: camp.y + 18 + Math.sin(ang) * 16, dx: Math.cos(ang + 1.5), label: firstNameOf(st.people[id]?.name ?? id) ?? id, muted: true });
          });
        }
      }
      const away = (band?.soldiers ?? []).filter((id) => awayWithBand(st, id)).sort().join(',');
      if (away !== awayKey) { awayKey = away; safe(onAway, undefined); }
    }
    spots = out;
  };

  const lookFor = (id: string): PersonLook => {
    let l = looks.get(id);
    if (!l) {
      const p = ctx.session.getState()?.people[id];
      l = villagerLook({ id, tags: p?.tags, age: p?.age }, 'village', ctx.seed);
      looks.set(id, l);
    }
    return l;
  };

  const build = (s: Spot): Sprite => {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const sp: Sprite = { parts, x: s.x, y: s.y, dx: s.dx, seen: true };
    if (s.kind === 'soldier') {
      sp.fig = new Figure(scene, lookFor(s.personId!), s.x, s.y);
      return sp;
    }
    const shadow = scene.add.image(s.x, s.y, ensureShadow(scene)).setScale(s.kind === 'tent' ? 2.4 : s.air ? 5 : s.design === 'landship' ? 5 : 3, 1.3);
    parts.push(shadow);
    const add = (tex: string) => parts.push(scene.add.sprite(s.x, s.y, tex, '0').setOrigin(0.5, 1).setScale(ART_SCALE));
    if (s.kind === 'banner') add(addStrip(scene, 'works-banner', bannerStrip));
    else if (s.kind === 'tent') add(addStrip(scene, 'works-tent', tentStrip));
    else {
      const t = DESIGN_TEX[s.design ?? 'handcart'] ?? 'cart';
      if (t === 'cart') add(vehicleTexture(scene, 'cart'));
      else if (t === 'wagon') { add(vehicleTexture(scene, 'wagon')); add(vehicleTexture(scene, 'ox')); }
      else {
        add(addStrip(scene, t[0], t[1]));
        if (s.design === 'war_cart') add(vehicleTexture(scene, 'ox'));
      }
    }
    return sp;
  };

  const off = ctx.events.on('state-replaced', () => { for (const s of sprites.values()) { s.parts.forEach((o) => o.destroy()); s.fig?.destroy(); } sprites.clear(); looks.clear(); wait = 0; });
  lists.set(ctx, () => spots);

  return {
    update(dt, timeSec, names) {
      wait -= dt;
      if (wait <= 0) { wait = REFRESH_S; refresh(); }
      const indoors = !!safe(() => ctx.world.room(), null);
      const vr = viewRect(scene, 120);
      const lr = viewRect(scene, 8);
      for (const s of sprites.values()) s.seen = false;
      if (!indoors) for (const s of spots) {
        if (!inRect(vr, s.x, s.y)) continue;
        const sp = sprites.get(s.key) ?? (sprites.set(s.key, build(s)).get(s.key)!);
        sp.seen = true;
        const ox = sp.x, oy = sp.y;
        const ease = Math.min(1, dt * 1.5);
        sp.x += (s.x - sp.x) * ease;
        sp.y += (s.y - sp.y) * ease;
        if (Math.abs(s.dx) > 0.2) sp.dx = s.dx;
        const moving = Math.hypot(sp.x - ox, sp.y - oy) > 0.05;
        const left = sp.dx < 0;
        if (sp.fig) {
          sp.fig.face(sp.dx, 0);
          sp.fig.place(sp.x, sp.y);
          sp.fig.animate(dt, moving, timeSec);
          if (s.label && inRect(lr, sp.x, sp.y)) names.put(`wk:${s.key}`, sp.x, sp.y - headHeight(lookFor(s.personId!).scale) - 2, { text: s.label, alpha: 0.75, muted: true });
          continue;
        }
        const lift = s.air ? AIR_LIFT + Math.sin(timeSec * 1.3) * 3 : 0;
        const always = s.kind === 'banner' || s.air;
        const frame = moving || always ? String(Math.floor(timeSec * (s.kind === 'banner' ? 3 : 5)) % 2) : '0';
        const [shadow, body, beast] = sp.parts as [Phaser.GameObjects.Image, Phaser.GameObjects.Sprite, Phaser.GameObjects.Sprite?];
        shadow.setPosition(sp.x, sp.y - 1).setDepth(sp.y - 0.5);
        body.setPosition(sp.x, sp.y - lift).setDepth(s.air ? sp.y + 10_000 : sp.y).setFlipX(left).setFrame(frame);
        if (beast) beast.setPosition(sp.x + (left ? -1 : 1) * (s.design === 'war_cart' ? 44 : 46), sp.y).setDepth(sp.y + 0.1).setFlipX(left).setFrame(frame);
        if (s.label && inRect(lr, sp.x, sp.y)) {
          const h = body.displayHeight;
          names.put(`wk:${s.key}`, sp.x, sp.y - lift - h - 4, { text: s.label, alpha: 0.85, muted: !!s.muted });
        }
      }
      for (const [k, sp] of sprites) if (!sp.seen) { sp.parts.forEach((o) => o.destroy()); sp.fig?.destroy(); sprites.delete(k); }
    },
    list: () => spots,
    destroy() {
      off();
      lists.delete(ctx);
      for (const s of sprites.values()) { s.parts.forEach((o) => o.destroy()); s.fig?.destroy(); }
      sprites.clear();
    },
  };
}

const lists = new WeakMap<GameContext, () => Spot[]>();
/** Dev: everything of the Works drawn or placed in the world now (`dev.worksTraffic()`). */
registerDevHook('worksTraffic', (ctx) => () => (lists.get(ctx)?.() ?? []).map((s) => ({ key: s.key, kind: s.kind, design: s.design, x: Math.round(s.x), y: Math.round(s.y), label: s.label })));
