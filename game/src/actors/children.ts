/**
 * The households' young (economy/households, kin.children still 'child'): not people of the sim yet, but
 * born, named and raised in a house, so they are seen — a small figure trotting at a parent's heels, a
 * babe of under a season held close (drawn right at the parent's side). When they come of age they become
 * a person and people.ts gives them their own body. Only children whose parent is drawn on screen exist.
 */
import type { GameContext, Pt } from '../app/contracts';
import type { SettlementKind } from '../sim/map/world-layout';
import { TILE_PX } from '../sim/map/constants';
import { countVisual } from '../dev/visual-counts';
import { Figure } from './figure';
import { villagerLook } from './looks';
import { hash } from './paint';

const MAX_DRAWN = 24;

type Kid = { id: string; fig: Figure; x: number; y: number; seen: boolean; moving: boolean };
export type ParentView = { x: number; y: number; kind: SettlementKind; moving: boolean };

export type ChildrenCtl = { update(dt: number, timeSec: number, parentOf: (id: string) => ParentView | undefined): void; list(): { id: string; given: string; x: number; y: number }[]; destroy(): void };

export function createChildren(ctx: GameContext): ChildrenCtl {
  const kids = new Map<string, Kid>();
  const given = new Map<string, string>();
  return {
    update(dt, timeSec, parentOf) {
      const st = ctx.session.getState();
      for (const k of kids.values()) k.seen = false;
      let drawn = 0;
      for (const c of st?.kin?.children ?? []) {
        if (c.status !== 'child' || (c.personId && st?.people[c.personId]) || drawn >= MAX_DRAWN) continue;
        // Follow whichever parent is out and drawn (the first, else the second).
        const p = parentOf(c.parents[0]) ?? parentOf(c.parents[1]);
        if (!p) continue;
        drawn++;
        given.set(c.id, c.given);
        const h = hash(c.id);
        const side = h % 2 ? 1 : -1;
        const want: Pt = { x: p.x + side * TILE_PX * 0.55, y: p.y + 6 + (h % 3) };
        let k = kids.get(c.id);
        if (!k) {
          const look = villagerLook({ id: c.id, age: Math.max(3, Math.min(12, (st!.day - c.born) / 4 + 4)) }, p.kind, ctx.seed);
          k = { id: c.id, fig: new Figure(ctx.scene, look, want.x, want.y), x: want.x, y: want.y, seen: true, moving: false };
          kids.set(c.id, k);
        }
        k.seen = true;
        // A child lags a step behind, then hurries to catch up.
        const dx = want.x - k.x, dy = want.y - k.y, d = Math.hypot(dx, dy);
        k.moving = d > 3;
        if (d > TILE_PX * 6) { k.x = want.x; k.y = want.y; }
        else if (k.moving) { const step = Math.min(d, (d > TILE_PX ? 70 : 40) * dt); k.x += (dx / d) * step; k.y += (dy / d) * step; k.fig.face(dx, dy); }
        k.fig.place(k.x, k.y);
        k.fig.animate(dt, k.moving, timeSec, 1.3);
        k.fig.setVisible(true);
      }
      for (const [id, k] of kids) if (!k.seen) { k.fig.destroy(); kids.delete(id); }
      countVisual('children', kids.size);
    },
    list: () => [...kids.values()].map((k) => ({ id: k.id, given: given.get(k.id) ?? '', x: Math.round(k.x), y: Math.round(k.y) })),
    destroy() { for (const k of kids.values()) k.fig.destroy(); kids.clear(); },
  };
}
