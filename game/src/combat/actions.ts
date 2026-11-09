/**
 * What you do in a fight: the basic attack (a swing in an arc, or a shot for a bow or staff, aimed at the
 * nearest foe in front of you), the dodge (a quick dash you cannot be hurt in), and the skills: cleave,
 * whirl, lunge, bolt, mend, nova, cry, bulwark and volley. Skills cost spark and have cooldowns. Damage
 * rolls between the weapon's numbers with crits; leech and spark-on-hit from gear. The front end owns
 * timing (real time); the numbers come from sim/hero.
 */
import type { GameContext, Pt } from '../app/contracts';
import { atRank, skillRow } from '../sim/hero/data';
import { heal, heroOf, statsOf } from '../sim/hero/hero';
import type { Stats } from '../sim/hero/types';
import type { Foe } from './foe';
import type { Fx } from './fx';

export type Moves = {
  attack(at?: Pt): void;
  dodge(): void;
  skill(slot: number): void;
  /** Ongoing moves (dash, lunge, whirl, mend, buffs) and cooldowns, one frame. */
  update(dt: number): void;
  invulnerable(): boolean;
  /** Harm multiplier from Bulwark. */
  guard(): number;
  cooldowns(): { attack: number; dodge: number; slots: { id: string | null; left: number; total: number; cost: number }[] };
  /** Strike a foe (hits from shots land here too). */
  strike(f: Foe, dmg: number, opts?: { crit?: boolean; push?: Pt; stun?: number }): void;
  reset(): void;
};

const DODGE_CD = 0.8, DODGE_T = 0.18, DODGE_PX = 120, IFRAMES = 0.3;

export function createMoves(ctx: GameContext, foes: () => Foe[], fx: Fx, onKill: (f: Foe) => void): Moves {
  let attackCd = 0, dodgeCd = 0;
  const cds = new Map<string, number>();
  let iframes = 0;
  let dash: { t: number; dir: Pt; len: number; hit?: Set<string>; mult?: number } | null = null;
  let whirl: { t: number; next: number; mult: number; radius: number } | null = null;
  let mend: { t: number; perSec: number } | null = null;
  let bulwark: { t: number; mul: number } | null = null;

  const me = (): Pt => ctx.actors.player.pos();
  const st = () => ctx.session.getState();
  const stats = (): Stats => statsOf(st()!);
  const live = (): Foe[] => foes().filter((f) => !f.dead);
  const roll = (s: Stats, mult = 1): { dmg: number; crit: boolean } => {
    const crit = Math.random() < s.crit;
    const dmg = Math.round((s.dmg[0] + Math.random() * (s.dmg[1] - s.dmg[0])) * mult * (crit ? 1.6 : 1));
    return { dmg: Math.max(1, dmg), crit };
  };
  /** The way to strike: toward a point, else the nearest foe within `range` ahead, else where you face. */
  const aimAt = (range: number, at?: Pt): { ang: number; dir: Pt } => {
    const p = me();
    let tx: number, ty: number;
    if (at) { tx = at.x - p.x; ty = at.y - p.y; } else {
      const near = live().map((f) => ({ f, d: Math.hypot(f.x - p.x, f.y - p.y) })).filter((x) => x.d < range).sort((a, b) => a.d - b.d)[0];
      if (near) { tx = near.f.x - p.x; ty = near.f.y - p.y; } else { const fc = ctx.actors.player.facing(); tx = fc.dx; ty = fc.dy; }
    }
    const d = Math.max(0.001, Math.hypot(tx, ty));
    return { ang: Math.atan2(ty, tx), dir: { x: tx / d, y: ty / d } };
  };
  const inArc = (f: Foe, ang: number, arc: number, reach: number): boolean => {
    const p = me();
    const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy);
    if (d > reach + f.row.size) return false;
    if (d < 18) return true;
    let diff = Math.abs(Math.atan2(dy, dx) - ang);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff <= (arc * Math.PI) / 360;
  };
  const spend = (cost: number): boolean => {
    const s = st();
    if (!s || s.player.spark < cost) { ctx.voice?.tell('Not enough spark.', 'player'); ctx.voice?.sfx?.('refuse'); return false; }
    s.player.spark -= cost;
    return true;
  };

  const strike: Moves['strike'] = (f, dmg, opts = {}) => {
    if (f.dead) return;
    const s = stats();
    f.hp -= dmg;
    f.flash = 0.12;
    f.aggro = true;
    if (opts.push) f.push(opts.push, 26);
    if (opts.stun) f.stun = Math.max(f.stun, opts.stun);
    fx.number({ x: f.x, y: f.y - f.height - 4 }, String(dmg), opts.crit ? '#ffd060' : '#f0ece4', !!opts.crit);
    const state = st();
    if (state) {
      if (s.leech) heal(state, s.leech);
      if (s.sparkHit) state.player.spark = Math.min(state.player.sparkMax ?? 100, state.player.spark + s.sparkHit);
    }
    if (f.hp <= 0) { f.kill(); onKill(f); }
  };

  const swing = (ang: number, arc: number, reach: number, mult: number, color?: number): void => {
    const s = stats();
    fx.slash(me(), ang, arc, reach, color);
    for (const f of live()) if (inArc(f, ang, arc, reach)) { const r = roll(s, mult); strike(f, r.dmg, { crit: r.crit }); }
  };
  const bolt = (dir: Pt, mult: number, range: number, color = 0xffc060, tag = ''): void => {
    const p = me();
    const r = roll(stats(), mult);
    fx.shoot({ x: p.x, y: p.y - 16 }, { x: p.x + dir.x * 100, y: p.y - 16 + dir.y * 100 }, 380, r.dmg, true, { color, range, tag });
  };

  return {
    attack(at) {
      if (attackCd > 0 || dash) return;
      const s = stats();
      attackCd = 1 / s.rate;
      const { ang, dir } = aimAt(s.shot ? s.reach : s.reach + 70, at);
      ctx.actors.player.nudge(dir.x * 0.01, dir.y * 0.01); // turn to face it
      if (s.shot) bolt(dir, 1, s.reach, 0xe8d8a0);
      else swing(ang, s.arc, s.reach, 1);
    },
    dodge() {
      if (dodgeCd > 0 || dash) return;
      const { dir } = aimAt(0);
      const fc = ctx.actors.player.facing();
      const d = Math.hypot(fc.dx, fc.dy) ? { x: fc.dx, y: fc.dy } : dir;
      dash = { t: DODGE_T, dir: d, len: DODGE_PX };
      dodgeCd = DODGE_CD;
      iframes = IFRAMES;
    },
    skill(slot) {
      const state = st();
      if (!state) return;
      const h = heroOf(state);
      const id = h.slots[slot];
      const row = id ? skillRow(id) : undefined;
      const rank = id ? h.skills[id] ?? 0 : 0;
      if (!row || !rank) { ctx.voice?.tell(`Nothing on ${'QRF'[slot]}. Learn a skill (C).`, 'player'); return; }
      if ((cds.get(row.id) ?? 0) > 0 || dash) return;
      if (!spend(row.spark)) return;
      cds.set(row.id, row.cd);
      const mult = atRank(row.mult, rank, 1);
      const s = stats();
      const { ang, dir } = aimAt(row.reach ?? 200);
      switch (row.kind) {
        case 'cleave': swing(ang, 180, row.reach ?? 58, mult, 0xffd090); break;
        case 'whirl': whirl = { t: 0.66, next: 0, mult, radius: row.radius ?? 70 }; break;
        case 'lunge': dash = { t: 0.2, dir, len: row.reach ?? 160, hit: new Set(), mult }; iframes = 0.25; break;
        case 'bolt': bolt(dir, mult, row.reach ?? 300, 0xffa040, 'spark'); break;
        case 'volley': for (let k = -2; k <= 2; k++) { const a = ang + k * 0.18; bolt({ x: Math.cos(a), y: Math.sin(a) }, mult, row.reach ?? 300, 0xff7a3a); } break;
        case 'mend': mend = { t: atRank(row.dur, rank, 3), perSec: (s.maxHp * atRank(row.heal, rank, 0.25)) / atRank(row.dur, rank, 3) }; fx.ring(me(), 40, 0x7ae070); break;
        case 'nova': {
          const radius = row.radius ?? 110;
          fx.ring(me(), radius, 0xe8602a);
          for (const f of live()) if (Math.hypot(f.x - me().x, f.y - me().y) < radius + f.row.size) { const r = roll(s, mult); strike(f, r.dmg, { crit: r.crit, push: me() }); }
          break;
        }
        case 'cry': {
          const radius = row.radius ?? 140;
          fx.ring(me(), radius, 0x9aa8ff);
          for (const f of live()) if (Math.hypot(f.x - me().x, f.y - me().y) < radius) { f.stun = Math.max(f.stun, atRank(row.dur, rank, 1.5)); f.aggro = true; }
          break;
        }
        case 'bulwark': bulwark = { t: atRank(row.dur, rank, 4), mul: mult }; fx.ring(me(), 30, 0xc8c8e0); break;
      }
    },
    update(dt) {
      attackCd = Math.max(0, attackCd - dt);
      dodgeCd = Math.max(0, dodgeCd - dt);
      iframes = Math.max(0, iframes - dt);
      for (const [k, v] of cds) cds.set(k, Math.max(0, v - dt));
      if (dash) {
        const step = (dash.len / (dash.hit ? 0.2 : DODGE_T)) * dt;
        ctx.actors.player.nudge(dash.dir.x * step, dash.dir.y * step);
        if (dash.hit) for (const f of live()) {
          if (dash.hit.has(f.uid) || Math.hypot(f.x - me().x, f.y - me().y) > 28 + f.row.size) continue;
          dash.hit.add(f.uid);
          const r = roll(stats(), dash.mult ?? 1);
          strike(f, r.dmg, { crit: r.crit, push: me() });
        }
        dash.t -= dt;
        if (dash.t <= 0) dash = null;
      }
      if (whirl) {
        whirl.t -= dt; whirl.next -= dt;
        if (whirl.next <= 0) {
          whirl.next = 0.22;
          fx.ring(me(), whirl.radius, 0xf0e0c0);
          for (const f of live()) if (Math.hypot(f.x - me().x, f.y - me().y) < whirl.radius + f.row.size) { const r = roll(stats(), whirl.mult); strike(f, r.dmg, { crit: r.crit }); }
        }
        if (whirl.t <= 0) whirl = null;
      }
      if (mend) { const s = st(); if (s) heal(s, mend.perSec * dt); mend.t -= dt; if (mend.t <= 0) mend = null; }
      if (bulwark) { bulwark.t -= dt; if (bulwark.t <= 0) bulwark = null; }
    },
    invulnerable: () => iframes > 0,
    guard: () => bulwark?.mul ?? 1,
    cooldowns() {
      const s = st();
      const slots = s ? heroOf(s).slots : [null, null, null];
      return {
        attack: attackCd, dodge: dodgeCd,
        slots: slots.map((id) => { const r = id ? skillRow(id) : undefined; return { id, left: id ? cds.get(id) ?? 0 : 0, total: r?.cd ?? 1, cost: r?.spark ?? 0 }; }),
      };
    },
    strike,
    reset() { cds.clear(); dash = whirl = mend = bulwark = null; attackCd = dodgeCd = iframes = 0; },
  };
}
