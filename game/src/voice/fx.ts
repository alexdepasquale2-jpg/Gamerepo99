/**
 * Spark VFX in the world, repurposed from the old src/render/spark-fx/*: the reignite burst at the person,
 * the refusal coal flicker at a head, the burnout coal guttering at the player, and a small cyan pulse
 * when the player spends spark. Presentation only; feel numbers live here.
 */
import Phaser from 'phaser';
import type { Pt } from '../app/contracts';

const FEEL = {
  gold: 0xf2b84b,
  cyan: 0x5ec8c8,
  warm: 0xd97b3a,
  dim: 0x6a6870,
  reignite: { particles: 22, lifeMs: 700, speedMin: 30, speedMax: 110, bloomRadius: 64, bloomAlpha: 0.4, bloomMs: 520, shake: 0.003, shakeMs: 70 },
  wash: { startRadius: 12, endRadius: 160, ms: 900, startAlpha: 0.55, ringWidth: 3 },
  refusal: { particles: 6, lifeMs: 280, flashAlpha: 0.25, flashMs: 160 },
  burnout: { holdMs: 1100, dimMs: 320, snuffMs: 200, dimAlpha: 0.55 },
  spend: { particles: 8, lifeMs: 380, flashMs: 220, flashAlpha: 0.4 },
};

/** Above every y-sorted sprite (depth = foot y); below nothing the voice layer cares about (bubbles are DOM). */
/** Above every foot-y sorted sprite in the realm (world y reaches about 1.7M px), under the sky layer. */
const FX_DEPTH = 40_000_000;

const TEX = { gold: 'hfv-fx-gold', cyan: 'hfv-fx-cyan', warm: 'hfv-fx-warm', dim: 'hfv-fx-dim' } as const;

function ensureTextures(scene: Phaser.Scene): void {
  const make = (key: string, color: number): void => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1).fillCircle(4, 4, 4);
    g.generateTexture(key, 8, 8);
    g.destroy();
  };
  make(TEX.gold, FEEL.gold);
  make(TEX.cyan, FEEL.cyan);
  make(TEX.warm, FEEL.warm);
  make(TEX.dim, FEEL.dim);
}

function burst(scene: Phaser.Scene, x: number, y: number, texture: string, o: { count: number; life: number; min: number; max: number; scale?: number }): void {
  const em = scene.add.particles(x, y, texture, {
    speed: { min: o.min, max: o.max },
    angle: { min: 0, max: 360 },
    lifespan: o.life,
    quantity: o.count,
    scale: { start: o.scale ?? 1, end: 0 },
    alpha: { start: 0.95, end: 0 },
    blendMode: 'ADD',
    emitting: false,
  });
  em.setDepth(FX_DEPTH + 20);
  em.explode(o.count);
  scene.time.delayedCall(o.life + 60, () => em.destroy());
}

export type Fx = ReturnType<typeof createFx>;

export function createFx(scene: Phaser.Scene) {
  ensureTextures(scene);
  const alive = (): boolean => !!scene.sys?.isActive?.() || !!scene.sys?.isPaused?.();

  return {
    /** The person catches: gold bloom, a warm wash spreading out, embers. */
    reignite(at: Pt): void {
      if (!alive()) return;
      const r = FEEL.reignite;
      scene.cameras.main.shake(r.shakeMs, r.shake);
      const bloom = scene.add.circle(at.x, at.y, 8, FEEL.gold, r.bloomAlpha).setDepth(FX_DEPTH + 18).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: bloom, radius: r.bloomRadius, alpha: 0, duration: r.bloomMs, ease: 'Cubic.easeOut', onComplete: () => bloom.destroy() });
      const w = FEEL.wash;
      const fill = scene.add.circle(at.x, at.y, w.startRadius, FEEL.gold, w.startAlpha * 0.6).setDepth(FX_DEPTH + 17).setBlendMode(Phaser.BlendModes.ADD);
      const ring = scene.add.circle(at.x, at.y, w.startRadius, FEEL.warm, 0).setStrokeStyle(w.ringWidth, FEEL.warm, 0.85).setDepth(FX_DEPTH + 17);
      scene.tweens.add({
        targets: [fill, ring],
        radius: w.endRadius,
        alpha: 0,
        duration: w.ms,
        ease: 'Cubic.easeOut',
        onUpdate: () => ring.setStrokeStyle(w.ringWidth, FEEL.warm, Math.max(0, 0.85 * (1 - (ring.radius - w.startRadius) / (w.endRadius - w.startRadius)))),
        onComplete: () => { fill.destroy(); ring.destroy(); },
      });
      burst(scene, at.x, at.y, TEX.warm, { count: r.particles, life: r.lifeMs, min: r.speedMin, max: r.speedMax });
      burst(scene, at.x, at.y, TEX.gold, { count: 8, life: r.lifeMs, min: 10, max: 40, scale: 0.8 });
    },

    /** A refusal: the coal at the head flickers grey. */
    refusal(at: Pt): void {
      if (!alive()) return;
      const f = FEEL.refusal;
      const flash = scene.add.circle(at.x, at.y, 20, FEEL.dim, f.flashAlpha).setDepth(FX_DEPTH + 18);
      scene.tweens.add({ targets: flash, alpha: 0, duration: f.flashMs, onComplete: () => flash.destroy() });
      burst(scene, at.x, at.y, TEX.dim, { count: f.particles, life: f.lifeMs, min: 10, max: 30, scale: 0.5 });
    },

    /** The player spent spark: a short cyan pulse and a few drifting motes. */
    spend(at: Pt): void {
      if (!alive()) return;
      const s = FEEL.spend;
      const flash = scene.add.circle(at.x, at.y, 14, FEEL.cyan, s.flashAlpha).setDepth(FX_DEPTH + 22).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: s.flashMs, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
      burst(scene, at.x, at.y, TEX.cyan, { count: s.particles, life: s.lifeMs, min: 10, max: 40, scale: 0.55 });
    },

    /** Burnout: the world dims, the player's coal gutters and greys out. Follows the player while it plays. */
    burnout(follow: () => Pt): void {
      if (!alive()) return;
      const b = FEEL.burnout;
      const at = follow();
      const view = scene.cameras.main.worldView;
      const dim = scene.add.rectangle(view.centerX, view.centerY, view.width * 4, view.height * 4, 0x14120f, 0).setDepth(FX_DEPTH - 700);
      scene.tweens.add({ targets: dim, alpha: b.dimAlpha, duration: b.dimMs });
      scene.time.delayedCall(b.holdMs, () => scene.tweens.add({ targets: dim, alpha: 0, duration: 260, onComplete: () => dim.destroy() }));
      const coal = scene.add.circle(at.x, at.y, 7, FEEL.warm, 1).setDepth(FX_DEPTH + 23);
      scene.tweens.add({
        targets: coal,
        radius: 2,
        alpha: 0,
        duration: b.holdMs,
        ease: 'Sine.easeIn',
        onUpdate: () => { const p = follow(); coal.setPosition(p.x, p.y); },
        onComplete: () => coal.destroy(),
      });
      scene.time.delayedCall(b.holdMs * 0.55, () => { if (coal.active) coal.setFillStyle(FEEL.dim, coal.fillAlpha); });
      burst(scene, at.x, at.y, TEX.dim, { count: 8, life: b.holdMs * 0.6, min: 6, max: 18, scale: 0.4 });
      const snuff = scene.add.circle(at.x, at.y, 12, 0x0b0a0f, 0.7).setDepth(FX_DEPTH + 21);
      scene.tweens.add({ targets: snuff, radius: 40, alpha: 0, duration: b.snuffMs, onComplete: () => snuff.destroy() });
    },
  };
}
