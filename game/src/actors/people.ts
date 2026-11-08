/**
 * Everyone in the session, living their day: homes, schedules, going in and out of doors, names and marks
 * over heads, the doctrine leader's pennant. Only towns near the camera are awake (drawn and walking);
 * a town that wakes up puts its people where the schedule says they are. Newcomers, births and the dead
 * are settled at sync().
 */
import type { GameContext, Pt, Thing } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';
import { isIndoorsAt, DOOR_ARRIVE_PX, DOOR_GIVE_UP_MS } from '../sim/map/residency';
import type { Building } from '../sim/map/interiors';
import { Figure } from './figure';
import { doorStep, findSpots, makeFolk, makeVillager, rehouse, scheduleSpot, wantInside, type Folk, type PersonRow, type Villager } from './folk';
import { headHeight, lookTexture } from './looks';
import { doctrineLeaders, postureOf, strongestMarkTell } from './marks';
import type { NameLayer } from './name-layer';
import { hash } from './paint';
import { safe } from './player';
import { inRect, viewRect, type TownIndex } from './towns';

const ROUTES_PER_FRAME = 4;
const NEAR_NAME = 96;
const WANDER = TILE_PX * 1.1;

export type PeopleCtl = {
  sync(): void;
  update(dt: number, timeSec: number, player: Pt, names: NameLayer): void;
  things(near: Pt, radius: number): Thing[];
  headOf(id: string): Pt | undefined;
  residentsOf(buildingId: string): string[];
  lookOf(id: string): { texture: string; frame: string; scale: number; tint: number } | undefined;
  /** Dev: everyone, with where they are. */
  list(): { id: string; name: string; townId: string; x: number; y: number; inside: string | null; mark: string | null; leader: boolean; drawn: boolean }[];
  destroy(): void;
};

export function createPeople(ctx: GameContext, towns: TownIndex): PeopleCtl {
  const folkByTown = new Map<string, Folk>();
  const byId = new Map<string, Villager>();
  const active = new Set<Folk>();
  let routes = 0;

  const rows = (): PersonRow[] => {
    const st = ctx.session.getState();
    return ctx.session.listPeople().map((p) => ({ ...p, age: st?.people[p.id]?.age }));
  };
  const folkFor = (townId: string | undefined, id: string): Folk | undefined => {
    const t = (townId && towns.byId.get(townId)) || towns.all[hash(id) % Math.max(1, towns.all.length)];
    if (!t) return undefined;
    let f = folkByTown.get(t.id);
    if (!f) folkByTown.set(t.id, (f = makeFolk(t)));
    return f;
  };

  const phase = () => safe(() => ctx.world.phase(), 0.3);

  // ---------- bodies ----------

  const show = (v: Villager, folk: Folk): void => {
    if (v.fig || !folk.active) return;
    v.fig = new Figure(ctx.scene, v.pl, v.x, v.y);
    v.fig.setPosture(postureOf(v.tell));
    v.fig.setVisible(!v.inside);
  };
  const hide = (v: Villager): void => { v.fig?.destroy(); v.fig = undefined; };

  const goIn = (v: Villager, b: Building): void => {
    v.inside = b;
    v.entering = null;
    v.path = [];
    const d = doorStep(b);
    v.x = d.x; v.y = d.y;
    v.fig?.place(d.x, d.y);
    v.fig?.setVisible(false);
  };
  const comeOut = (v: Villager): void => {
    const b = v.inside;
    v.inside = null;
    v.entering = null;
    if (b) { const d = doorStep(b); v.x = d.x; v.y = d.y; v.target = { ...d }; }
    v.path = [];
    v.nextPick = 0;
    v.fig?.place(v.x, v.y);
    v.fig?.setVisible(true);
  };

  /** Put everyone in a town where the schedule says they are right now. */
  const settle = (folk: Folk): void => {
    const ph = phase();
    for (const v of folk.people) {
      const w = wantInside(folk, v, ph);
      if (w) { goIn(v, w); continue; }
      if (v.inside) comeOut(v);
      const s = scheduleSpot(folk, v, ph);
      const h = hash(v.id);
      v.x = s.x + ((h % 9) - 4) * 3;
      v.y = s.y + (((h >> 5) % 7) - 3) * 3;
      v.target = { x: v.x, y: v.y };
      v.path = [];
      v.fig?.place(v.x, v.y);
    }
  };

  const wake = (folk: Folk): void => {
    folk.active = true;
    active.add(folk);
    findSpots(ctx, folk);
    settle(folk);
    for (const v of folk.people) show(v, folk);
  };
  const sleep = (folk: Folk): void => {
    folk.active = false;
    active.delete(folk);
    for (const v of folk.people) hide(v);
  };

  // ---------- roster ----------

  const refreshMarks = (onlyId?: string): void => {
    const leaders = onlyId ? null : doctrineLeaders(ctx.session.getState());
    for (const p of ctx.session.listPeople()) {
      if (onlyId && p.id !== onlyId) continue;
      const v = byId.get(p.id);
      if (!v) continue;
      v.tell = strongestMarkTell(p.marks);
      if (leaders) v.leader = leaders.has(p.id);
      v.fig?.setPosture(postureOf(v.tell));
    }
  };

  function sync(): void {
    const now = rows();
    const alive = new Set(now.map((p) => p.id));
    const touched = new Set<Folk>();
    // The dead and the departed leave.
    for (const [id, v] of byId) {
      if (alive.has(id)) continue;
      hide(v);
      byId.delete(id);
      const f = folkByTown.get(v.townId);
      if (f) { f.people = f.people.filter((p) => p.id !== id); touched.add(f); }
    }
    for (const row of now) {
      const v = byId.get(row.id);
      const folk = folkFor(row.townId, row.id);
      if (!folk) continue;
      if (v && v.townId === folk.town.id) { if (row.name && row.name !== v.name) { v.name = row.name; v.first = row.name.split(' ')[0]!; } continue; }
      if (v) { // moved town
        hide(v);
        const old = folkByTown.get(v.townId);
        if (old) { old.people = old.people.filter((p) => p.id !== v.id); touched.add(old); }
      }
      // Newcomers and births get a body in their town.
      const nv = makeVillager(ctx, row, folk, folk.people.length);
      byId.set(nv.id, nv);
      folk.people.push(nv);
      touched.add(folk);
    }
    for (const f of touched) rehouse(f);
    refreshMarks();
    for (const f of active) { settle(f); for (const v of f.people) show(v, f); }
  }

  sync();
  const offJuice = ctx.session.onJuice((id, payload) => {
    if (id !== 'mark.applied') return;
    const pid = (payload as { personId?: unknown } | undefined)?.personId;
    if (typeof pid === 'string') refreshMarks(pid);
  });

  // ---------- walking ----------

  function stepVillager(folk: Folk, v: Villager, dt: number, timeSec: number, ph: number): void {
    const fig = v.fig;
    if (!fig) return;
    const want = wantInside(folk, v, ph);
    if (v.inside && want?.id !== v.inside.id) comeOut(v);
    if (v.inside) return;
    if (want) {
      if (v.entering !== want.id) { v.entering = want.id; v.enteringMs = 0; v.nextPick = 0; }
      v.enteringMs += dt * 1000;
      const d = doorStep(want);
      if (Math.hypot(d.x - v.x, d.y - v.y) <= DOOR_ARRIVE_PX || v.enteringMs > DOOR_GIVE_UP_MS) return goIn(v, want);
    } else v.entering = null;
    v.nextPick -= dt;
    if (v.nextPick <= 0 && routes < ROUTES_PER_FRAME) {
      routes++;
      const r = hash(v.id + Math.floor(timeSec));
      const c = want ? doorStep(want) : scheduleSpot(folk, v, ph);
      const aim = want || r % 3 === 0 ? { ...c } : { x: c.x + ((r % 200) / 100 - 1) * WANDER, y: c.y + (((r >> 8) % 200) / 100 - 1) * WANDER * 0.6 };
      v.nextPick = 2.5 + (r % 5000) / 1000;
      const way = ctx.world.nav.route({ x: v.x, y: v.y }, aim, 1500);
      v.path = way ?? [];
      v.target = way?.length ? { ...way[way.length - 1]! } : { x: v.x, y: v.y };
    }
    const goal = v.path[0] ?? v.target;
    const dx = goal.x - v.x, dy = goal.y - v.y, d = Math.hypot(dx, dy);
    v.moving = false;
    if (d > 2) {
      const rest = Math.hypot(v.target.x - v.x, v.target.y - v.y);
      const base = v.entering ? 52 : rest > TILE_PX * 3 ? 34 : 16;
      const step = Math.min(d, base * v.pl.speed * dt);
      const nx = v.x + (dx / d) * step, ny = v.y + (dy / d) * step;
      if (!ctx.world.nav.walkableAt(nx, ny)) { v.path = []; v.target = { x: v.x, y: v.y }; }
      else { v.x = nx; v.y = ny; v.moving = true; fig.face(dx, dy); }
    } else if (v.path.length) v.path.shift();
    fig.place(v.x, v.y);
    fig.animate(dt, v.moving, timeSec);
  }

  const folkNear = (p: Pt, radius: number): Folk[] =>
    towns.inRect({ x0: p.x - radius, y0: p.y - radius, x1: p.x + radius, y1: p.y + radius }).map((t) => folkByTown.get(t.id)).filter((f): f is Folk => !!f?.active);

  return {
    sync,
    update(dt, timeSec, player, names) {
      routes = 0;
      const vr = viewRect(ctx.scene, 160);
      const indoors = !!safe(() => ctx.world.room(), null);
      const awake = new Set(indoors ? [] : towns.inRect(vr).map((t) => folkByTown.get(t.id)).filter((f): f is Folk => !!f));
      for (const f of [...active]) if (!awake.has(f)) sleep(f);
      for (const f of awake) if (!f.active) wake(f);
      const ph = phase();
      const focus = safe(() => ctx.interact.focus()?.key, undefined);
      const lr = viewRect(ctx.scene, 8);
      const shown: { v: Villager; d: number }[] = [];
      for (const f of active) {
        for (const v of f.people) {
          stepVillager(f, v, dt, timeSec, ph);
          if (v.inside || !v.fig || !inRect(lr, v.x, v.y) || focus === `person:${v.id}`) continue;
          shown.push({ v, d: Math.hypot(player.x - v.x, player.y - v.y) });
        }
      }
      // Nearest first, so in a crowd the people beside you keep their names.
      shown.sort((a, b) => a.d - b.d);
      shown.forEach(({ v, d }, i) => {
        const near = d < NEAR_NAME && i < 3;
        names.put(`p:${v.id}`, v.x, v.y - headHeight(v.pl.scale) - 1, {
          text: near ? v.name : v.first,
          glyph: v.tell ? { char: v.tell.glyph, color: v.tell.color } : undefined,
          leader: v.leader,
          alpha: near ? 1 : Math.max(0.45, 1 - d / 420),
          muted: !near,
        });
      });
    },
    things(near, radius) {
      if (safe(() => ctx.world.room(), null)) return [];
      const out: Thing[] = [];
      for (const f of folkNear(near, radius)) for (const v of f.people) {
        if (v.inside || !v.fig || Math.hypot(v.x - near.x, v.y - near.y) > radius) continue;
        out.push({ key: `person:${v.id}`, kind: 'person', id: v.id, x: v.x, y: v.y, label: v.first, target: { kind: 'person', id: v.id }, reach: 48 });
      }
      return out;
    },
    headOf(id) {
      const v = byId.get(id);
      return v ? { x: v.x, y: v.y - headHeight(v.pl.scale) } : undefined;
    },
    residentsOf(buildingId) {
      const townId = buildingId.slice(0, buildingId.lastIndexOf(':'));
      const folk = folkByTown.get(townId);
      if (!folk) return [];
      const ph = phase();
      return folk.people.filter((v) => { const b = folk.homes.get(v.id); return b?.id === buildingId && isIndoorsAt(b.kind, ph); }).map((v) => v.id);
    },
    lookOf(id) {
      const v = byId.get(id);
      return v ? { texture: lookTexture(ctx.scene, v.pl.look), frame: '1', scale: v.pl.scale, tint: postureOf(v.tell).tint } : undefined;
    },
    list: () => [...byId.values()].map((v) => ({ id: v.id, name: v.name, townId: v.townId, x: Math.round(v.x), y: Math.round(v.y), inside: v.inside?.id ?? null, mark: v.tell?.markId ?? null, leader: v.leader, drawn: !!v.fig && !v.inside })),
    destroy() {
      offJuice();
      for (const v of byId.values()) hide(v);
    },
  };
}
