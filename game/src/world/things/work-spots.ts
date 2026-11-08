/**
 * Work spots (sim/tasks): where someone is at work today — a cook pot, a log pile, an ore seam, a millstone,
 * a building frame, a road break, a stuck wheel. Each is a small code-drawn thing beside the work and a
 * Thing of kind 'prop' keyed `prop:work@<taskId>`; holding E at it is helping (interact/hold.ts).
 * The sim places what it can (plots, sites, facilities); roads, wagons and hearths are placed here.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { tasksOf, type Task } from '../../sim/tasks';
import { pointOnRoad, type LayoutRoute, type MapPoint, type WorldLayout } from '../../sim/map/world-layout';
import { ART_SCALE, makeTex, type Px } from '../art/px';
import { tileFoot, type Pt } from '../depth';
import type { TownSpots } from '../town-spots';

const REACH = 44;
/** Beside the wheel, behind the wagon's own focus point; beside the hearth, clear of it. */
const WAGON_OFF = { x: -22, y: 4 }, HEARTH_OFF = { x: 30, y: 6 }, ROAD_OFF = { x: 0, y: 0 };

const LOOKS: Record<string, [number, number, (p: Px) => void]> = {
  pot: [16, 14, (p) => {
    p.shadow(8, 6, 2).rect(3, 11, 10, 2, '#5a3a24').rect(5, 10, 2, 2, '#e07a2a').rect(9, 10, 2, 2, '#f0a040');
    p.disc(8, 7, 5, 3.5, '#3a3a3e').rect(3, 4, 10, 2, '#4a4a50').rect(5, 2, 1, 2, '#c8c8c8', 0.6).rect(9, 1, 1, 3, '#c8c8c8', 0.5);
  }],
  mill: [16, 12, (p) => {
    p.shadow(8, 7, 2).disc(8, 8, 7, 3, '#7a756c').disc(8, 6.5, 7, 3, '#a8a49a').disc(8, 6.5, 1.5, 0.8, '#5a5650').rect(2, 9, 2, 2, '#e8dcb0');
  }],
  logs: [18, 12, (p) => {
    p.shadow(9, 8, 2);
    for (const [x, y] of [[2, 8], [8, 8], [5, 5]] as const) p.rect(x, y, 8, 3, '#7a5232').rect(x, y, 1, 3, '#c8a070').rect(x + 1, y, 6, 1, '#9a6a3e');
    p.rect(14, 3, 1, 8, '#5a3a24').rect(12, 3, 5, 1, '#5a3a24');
  }],
  seam: [16, 12, (p) => {
    p.shadow(8, 7, 2).disc(8, 8, 7, 4, '#4e443c').disc(7, 6, 5, 2.4, '#5e5248').rect(4, 6, 2, 2, '#c88a4a').rect(10, 7, 2, 1, '#f2c080');
    p.rect(12, 2, 1, 7, '#7a5232').rect(10, 2, 5, 1, '#8a8a8a');
  }],
  frame: [18, 16, (p) => {
    p.shadow(9, 8, 2).rect(2, 4, 2, 11, '#8a6438').rect(14, 4, 2, 11, '#8a6438').rect(2, 4, 14, 2, '#a8743e').rect(4, 12, 10, 2, '#7a5a34');
    p.rect(6, 6, 1, 6, '#8a6438', 0.8).rect(11, 6, 1, 6, '#8a6438', 0.8);
  }],
  anvil: [16, 12, (p) => {
    p.shadow(8, 6, 2).rect(6, 7, 4, 4, '#3a3a3e').rect(3, 4, 10, 3, '#4a4a50').rect(1, 4, 3, 2, '#4a4a50').rect(4, 4, 8, 1, '#7a7a80');
  }],
  sheaf: [14, 14, (p) => {
    p.shadow(7, 5, 2);
    for (let i = 0; i < 5; i++) p.rect(3 + i * 2, 2 + (i % 2), 1, 10, '#d8b84a');
    p.rect(3, 7, 9, 1, '#8a6a30').rect(2, 1, 11, 2, '#e8cc6a');
  }],
  road: [18, 10, (p) => {
    p.disc(9, 6, 8, 3, '#5a4a30', 0.6).rect(3, 4, 3, 3, '#8a8a82').rect(7, 5, 4, 3, '#9a9a92').rect(12, 4, 3, 3, '#7a7a72').rect(15, 1, 1, 7, '#7a5232').rect(14, 1, 3, 1, '#8a8a8a');
  }],
  wheel: [14, 14, (p) => {
    p.shadow(7, 6, 2).disc(7, 7, 6, 6, '#5a3a24').disc(7, 7, 4.5, 4.5, '#3a2a1c', 0.6).rect(6, 2, 2, 10, '#7a5232').rect(2, 6, 10, 2, '#7a5232').disc(7, 12, 6, 1.5, '#5a4a30', 0.8);
  }],
};
const texOf = (scene: Phaser.Scene, look: string): string => {
  const [w, h, draw] = LOOKS[look] ?? LOOKS.frame!;
  return makeTex(scene, `w-work-${LOOKS[look] ? look : 'frame'}`, w, h, draw);
};

export type WorkSpotsLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  update(): void;
  /** Every work spot drawn now (dev). */
  list(): { key: string; taskId: string; kind: string; goal: string; x: number; y: number; workers: string[] }[];
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createWorkSpots(o: {
  scene: Phaser.Scene;
  getState: () => SimState | undefined;
  layout: WorldLayout;
  towns: TownSpots[];
  /** The nav's road point (snapped to walkable ground); pointOnRoad when absent. */
  roadPoint?: (path: MapPoint[], f: number) => MapPoint;
}): WorkSpotsLayer {
  const { scene, getState } = o;
  const routes = new Map<string, LayoutRoute>(o.layout.routes.map((r) => [r.id, r]));
  const hearths = new Map(o.towns.map((t) => [t.town.id, t.hearth]));
  const roadAt = (routeId: string, f: number): Pt | null => {
    const r = routes.get(routeId);
    if (!r) return null;
    const p = (o.roadPoint ?? pointOnRoad)(r.path, Math.max(0, Math.min(1, f)));
    return tileFoot(Math.round(p.q), Math.round(p.r));
  };
  const views = new Map<string, { task: Task; img: Phaser.GameObjects.Image; pos: Pt }>();
  let visible = true;

  /** Where a task's spot stands now (wagons roll, so they are placed every frame). */
  const place = (t: Task): Pt | null => {
    const s = t.spot;
    if (s.x !== undefined && s.y !== undefined) return { x: s.x, y: s.y };
    if (s.road) { const p = roadAt(s.road.routeId, s.road.f); return p && { x: p.x + ROAD_OFF.x, y: p.y + ROAD_OFF.y }; }
    if (s.hearth) { const h = hearths.get(s.hearth); return h ? { x: h.x + HEARTH_OFF.x, y: h.y + HEARTH_OFF.y } : null; }
    if (s.wagon) {
      const c = getState()?.caravans?.find((x) => x.id === s.wagon);
      if (!c) return null;
      const p = roadAt(c.routeId, c.heading === 'outbound' ? c.progress01 : 1 - c.progress01);
      return p && { x: p.x + WAGON_OFF.x, y: p.y + WAGON_OFF.y };
    }
    return null;
  };

  const refresh = (): void => {
    const st = getState();
    const live = new Set<string>();
    for (const t of st ? tasksOf(st) : []) {
      const pos = place(t);
      if (!pos) continue;
      live.add(t.id);
      const v = views.get(t.id);
      if (v) { v.task = t; v.pos = pos; v.img.setPosition(pos.x, pos.y).setDepth(pos.y); continue; }
      const img = scene.add.image(pos.x, pos.y, texOf(scene, t.spot.look)).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(pos.y).setVisible(visible);
      views.set(t.id, { task: t, img, pos });
    }
    for (const [id, v] of views) if (!live.has(id)) { v.img.destroy(); views.delete(id); }
  };

  return {
    things(near, radius) {
      const out: Thing[] = [];
      for (const v of views.values()) {
        if (Math.hypot(v.pos.x - near.x, v.pos.y - near.y) > radius) continue;
        const t = v.task, id = `work@${t.id}`;
        out.push({ key: t.spot.key, kind: 'prop', id, x: v.pos.x, y: v.pos.y, reach: REACH, label: t.spot.name, target: { kind: 'prop', id, data: { type: 'work_spot', workSpot: t.id } } });
      }
      return out;
    },
    refresh,
    update() {
      // Wagons roll between the slow refreshes: their wheel goes with them.
      for (const v of views.values()) {
        if (!v.task.spot.wagon) continue;
        const p = place(v.task);
        if (p) { v.pos = p; v.img.setPosition(p.x, p.y).setDepth(p.y); }
      }
    },
    list: () => [...views.values()].map((v) => ({ key: v.task.spot.key, taskId: v.task.id, kind: v.task.kind, goal: v.task.goal, x: Math.round(v.pos.x), y: Math.round(v.pos.y), workers: [...v.task.workers] })),
    setVisible(on) { visible = on; for (const v of views.values()) v.img.setVisible(on); },
    destroy() { for (const v of views.values()) v.img.destroy(); views.clear(); },
  };
}
