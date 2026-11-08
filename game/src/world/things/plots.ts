/**
 * Building plots (sim/economy/build-plans claims): a claimed plot is staked and roped out; while goods are
 * gathered a timber pile grows on it, then the frame rises with the building work, and a small bar on the
 * front stake fills with the plan's progress. A finished plot shows its building. Things: `plot:<claimId>`.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { BUILDING_BY_ID, type Claim } from '../../sim/economy/build-plans';
import { claimRect } from '../../sim/economy/borders';
import { townEconomyView } from '../../sim/economy/economy-view';
import { TILE_PX } from '../../sim/map/constants';
import { ART_SCALE, strHash } from '../art/px';
import { thingTex } from '../art/thing-art';
import { buildingTex } from '../art/building-art';
import { DECAL_DEPTH, type Pt } from '../depth';

const REACH = 56;

/** What a plot Thing carries as target data. */
export type PlotData = {
  claimId: string; planId: string; townId: string; ownerId: string; kind: string;
  status: 'claimed' | 'built'; progress: number; stage?: 'gathering' | 'building'; missing: { itemId: string; qty: number }[];
};
type View = { data: PlotData; front: Pt; label: string; objs: Phaser.GameObjects.GameObject[]; sig: string };

export type PlotsLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  list(): PlotData[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createPlots(scene: Phaser.Scene, getState: () => SimState | undefined): PlotsLayer {
  const views = new Map<string, View>();
  let visible = true;

  const dataOf = (s: SimState, c: Claim): PlotData => {
    const plan = c.status === 'claimed' ? townEconomyView(s, c.townId).plans.find((p) => p.id === c.planId) : undefined;
    return {
      claimId: c.id, planId: c.planId, townId: c.townId, ownerId: c.ownerId, kind: c.kind, status: c.status,
      progress: c.status === 'built' ? 1 : plan?.progress ?? 0, ...(plan ? { stage: plan.stage } : {}), missing: plan?.missing ?? [],
    };
  };

  const draw = (s: SimState, c: Claim, d: PlotData): View | null => {
    const r = claimRect(s, c);
    if (!r) return null;
    const x = r.q0 * TILE_PX, y = r.r0 * TILE_PX, w = (r.q1 - r.q0) * TILE_PX, h = (r.r1 - r.r0) * TILE_PX;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const img = (px: number, py: number, key: string, depth = py) => {
      const o = scene.add.image(px, py, key).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(depth);
      objs.push(o);
      return o;
    };
    const front = { x: x + w / 2, y: y + h };
    const g = scene.add.graphics().setDepth(DECAL_DEPTH);
    objs.push(g);
    if (d.status === 'built') {
      g.fillStyle(0x6a5a40, 0.35).fillRect(x + 4, y + 4, w - 8, h - 8);
      img(front.x, front.y - 6, buildingTex('cottage', strHash(c.id)));
    } else {
      g.fillStyle(0x7a5a34, 0.25).fillRect(x + 2, y + 2, w - 4, h - 4);
      g.lineStyle(2, 0xd8c08a, 0.85).strokeRect(x + 2, y + 2, w - 4, h - 4);
      for (const [px, py] of [[x + 3, y + 4], [x + w - 3, y + 4], [x + 3, y + h - 2], [x + w - 3, y + h - 2]] as const) img(px, py, thingTex('stake'));
      const p = d.progress;
      // Gathering: the timber pile grows. Building: posts rise and a beam goes on at the top.
      const pile = Math.min(4, Math.ceil(Math.min(0.5, p) / 0.125));
      for (let i = 0; i < pile; i++) img(x + w / 2 - 34 + (i % 2) * 4, y + h - 10 - i * 7, thingTex('timber'), y + h - 10);
      if (d.stage === 'building' || p > 0.5) {
        const rise = Math.max(0.15, (p - 0.5) * 2);
        for (const dx of [-20, 20]) img(front.x + dx + 14, y + h - 14, thingTex('frame-post'), y + h - 14).setScale(ART_SCALE, ART_SCALE * rise);
        if (rise >= 0.95) img(front.x + 14, y + h - 14 - 46, thingTex('timber'), y + h - 13).setScale(ART_SCALE * 4, ART_SCALE);
      }
      // Progress bar on the front-left stake.
      const bar = scene.add.graphics().setDepth(y + h + 0.5);
      bar.fillStyle(0x1b1612, 0.85).fillRect(x + 8, y + h - 26, 26, 6);
      bar.fillStyle(0xf2b84b, 1).fillRect(x + 9, y + h - 25, Math.round(24 * p), 4);
      objs.push(bar);
    }
    for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    const owner = (s.people[c.ownerId]?.name ?? c.ownerId).split(' ')[0]!;
    return { data: d, front, label: `${owner}'s ${BUILDING_BY_ID.get(c.kind)?.name?.toLowerCase() ?? 'plot'}`, objs, sig: '' };
  };

  const refresh = (): void => {
    const s = getState();
    const claims = s?.build?.claims ?? [];
    const live = new Set(claims.map((c) => c.id));
    for (const [id, v] of views) if (!live.has(id)) { v.objs.forEach((o) => o.destroy()); views.delete(id); }
    if (!s) return;
    for (const c of claims) {
      const d = dataOf(s, c);
      const sig = `${d.status}:${Math.round(d.progress * 20)}:${d.stage ?? ''}`;
      const cur = views.get(c.id);
      if (cur && cur.sig === sig) { cur.data = d; continue; }
      cur?.objs.forEach((o) => o.destroy());
      const v = draw(s, c, d);
      if (!v) { views.delete(c.id); continue; }
      v.sig = sig;
      views.set(c.id, v);
    }
  };

  return {
    things(near, radius) {
      const out: Thing[] = [];
      for (const v of views.values()) {
        if (Math.hypot(v.front.x - near.x, v.front.y - near.y) > radius) continue;
        out.push({ key: `plot:${v.data.claimId}`, kind: 'plot', id: v.data.claimId, x: v.front.x, y: v.front.y, reach: REACH, label: v.label, target: { kind: 'plot', id: v.data.claimId, data: v.data } });
      }
      return out;
    },
    refresh,
    list: () => [...views.values()].map((v) => v.data),
    setVisible(on) { visible = on; for (const v of views.values()) for (const o of v.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on); },
    destroy() { for (const v of views.values()) v.objs.forEach((o) => o.destroy()); views.clear(); },
  };
}
