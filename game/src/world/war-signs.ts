/**
 * War, seen from the street: while the district you stand in is at war with a neighbour (civic/district-war)
 * or a town is in one of the towns' own wars (economy/polity), the town flies a dark war banner by its
 * signpost and smoke rises past its edge where the fighting is; a town whose folk marched with the levy
 * has a muster post by the hearth hung with one spear-ribbon per absent soul. Peace takes them down.
 * Only towns near the camera are drawn; the sim is only read.
 */
import type Phaser from 'phaser';
import { polityIfAny, liveId } from '../sim/civic/district-relations';
import type { SimState } from '../sim/types/runtime';
import { TILE_PX } from '../sim/map/constants';
import { countVisual } from '../dev/visual-counts';
import { ART_SCALE, makeTex } from './art/px';
import { PUFF_TEX } from './assets';
import type { TownSpots } from './town-spots';

const NEAR = TILE_PX * 36;
const BANNER = 'w-war-banner';

type View = { townId: string; objs: Phaser.GameObjects.GameObject[]; banner: Phaser.GameObjects.Image; sig: string };
export type WarSigns = { update(timeSec: number, cam: Phaser.Cameras.Scene2D.Camera): void; list(): { townId: string; why: string; levied: number }[]; destroy(): void };

/** Why each town is at war now (district war: every live town; polity war: its two towns), and its levy. */
export function warTowns(s: SimState, townIds: string[]): Map<string, { why: string; levied: number }> {
  const out = new Map<string, { why: string; levied: number }>();
  const live = polityIfAny(s) ? liveId(s) : undefined;
  // The stored relations only (liveRelations would create missing ones; render never writes the sim).
  const districtWar = Object.values(polityIfAny(s)?.relations ?? {}).some((r) => (r.a === live || r.b === live) && r.state === 'war');
  const levies = (polityIfAny(s)?.levies ?? []).filter((l) => l.district === live);
  for (const id of townIds) {
    const polity = (s.polity?.wars ?? []).find((w) => w.status === 'active' && (w.aggressor === id || w.defender === id));
    if (!districtWar && !polity) continue;
    out.set(id, { why: polity ? `town war ${polity.aggressor}→${polity.defender}` : 'district war', levied: levies.filter((l) => l.townId === id).length });
  }
  return out;
}

export function createWarSigns(scene: Phaser.Scene, getState: () => SimState | undefined, towns: TownSpots[]): WarSigns {
  makeTex(scene, BANNER, 12, 26, (p) => {
    p.rect(1, 0, 1, 26, '#4a3020').rect(0, 0, 3, 1, '#c8a040');
    p.rect(2, 2, 9, 9, '#5a1a1a').rect(2, 2, 9, 1, '#7a2a24').rect(2, 11, 4, 2, '#5a1a1a').rect(7, 11, 4, 2, '#5a1a1a');
    p.rect(5, 5, 3, 3, '#1a1010').px(6, 4, '#1a1010');
  });
  const views = new Map<string, View>();
  let last = 0;
  let info = new Map<string, { why: string; levied: number }>();

  const build = (t: TownSpots, levied: number): View => {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const bx = t.signpost.x + 22, by = t.signpost.y + 2;
    const banner = scene.add.image(bx, by, BANNER).setOrigin(0.2, 1).setScale(ART_SCALE * 1.5).setDepth(by);
    objs.push(banner);
    // Smoke where the fighting is: a dark column standing past the town's north-east edge.
    const smoke = scene.add.particles(t.centre.x + TILE_PX * 6, t.centre.y - TILE_PX * 5, PUFF_TEX, {
      speedY: { min: -26, max: -14 }, speedX: { min: 2, max: 10 }, lifespan: 6000, scale: { start: 1.6, end: 5 },
      tint: [0x3a3430, 0x524a44], alpha: { start: 0.55, end: 0 }, frequency: 160,
    }).setDepth(t.centre.y - TILE_PX * 5);
    objs.push(smoke);
    if (levied > 0) {
      // The muster post: a pole by the hearth with a red ribbon for each one gone to the levy.
      const g = scene.add.graphics().setDepth(t.hearth.y + 30);
      const px = t.hearth.x - 40, py = t.hearth.y + 30;
      g.fillStyle(0x4a3020, 1).fillRect(px, py - 34, 3, 34);
      for (let i = 0; i < Math.min(8, levied); i++) g.fillStyle(i % 2 ? 0x8a2a24 : 0xa83a2a, 1).fillRect(px + 3, py - 32 + i * 4, 7 + (i % 3), 2);
      objs.push(g);
    }
    return { townId: t.town.id, objs, banner, sig: `${levied}` };
  };

  return {
    update(timeSec, cam) {
      const s = getState();
      const v = cam.worldView;
      const near = towns.filter((t) => Math.hypot(t.centre.x - v.centerX, t.centre.y - v.centerY) < NEAR);
      if (s && timeSec - last > 1) { last = timeSec; info = warTowns(s, near.map((t) => t.town.id)); }
      for (const t of near) {
        const w = info.get(t.town.id);
        let view = views.get(t.town.id);
        if (view && (!w || view.sig !== `${w.levied}`)) { view.objs.forEach((o) => o.destroy()); views.delete(t.town.id); view = undefined; }
        if (w && !view) views.set(t.town.id, (view = build(t, w.levied)));
        // The banner stirs in the wind.
        if (view) view.banner.setScale(ART_SCALE * 1.5 * (0.92 + Math.sin(timeSec * 3 + t.centre.x) * 0.08), ART_SCALE * 1.5);
      }
      for (const [id, view] of views) if (!near.some((t) => t.town.id === id)) { view.objs.forEach((o) => o.destroy()); views.delete(id); }
      countVisual('warSigns', views.size);
    },
    list: () => [...views.keys()].map((id) => ({ townId: id, ...(info.get(id) ?? { why: '', levied: 0 }) })),
    destroy() { for (const view of views.values()) view.objs.forEach((o) => o.destroy()); views.clear(); },
  };
}
