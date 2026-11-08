import Phaser from 'phaser';
import type { EventBus } from '../../sim';
import { FEEL, feelHitStopMs } from '../feel';
import { playBurnout } from './burnout';
import { playReignite } from './reignite';
import { playSfx } from '../sfx';
import { playRefusal } from './refusal';
import {
  ensureSparkTextures,
  type BurnoutPayload,
  type RefusalPayload,
  type ReignitePayload,
  type SparkFxHandle,
  type SparkFxOptions,
  type SparkSpentPayload,
} from './shared';
import { playSparkSpent } from './spend';

export type {
  BurnoutPayload,
  RefusalPayload,
  ReignitePayload,
  SparkFxHandle,
  SparkFxOptions,
  SparkSpentPayload,
};

/**
 * Attach spark/reignite/refusal/burnout presentation to a scene.
 * Listens on the world's EventBus — sim must only emit plain payloads (no feel numbers).
 */
export function attachSparkFx(
  scene: Phaser.Scene,
  bus: EventBus,
  opts: SparkFxOptions = {},
): SparkFxHandle {
  ensureSparkTextures(scene);

  let hitStopUntil = 0;

  const unsubs = [
    bus.on<SparkSpentPayload>('vfx.spark_spent', (p) => {
      const player = opts.getPlayerPos?.() ?? null;
      const enriched: SparkSpentPayload = {
        ...p,
        playerX: p.playerX ?? player?.x ?? p.x,
        playerY: p.playerY ?? player?.y ?? p.y,
      };
      playSparkSpent(scene, enriched, () => {
        hitStopUntil = scene.time.now + feelHitStopMs(FEEL.spark.hitStopMs);
      });
      opts.onSparkSpentHud?.(p.amount01 ?? 0.15);
    }),
    bus.on<ReignitePayload>('vfx.reignite', (p) => {
      hitStopUntil = Math.max(
        hitStopUntil,
        scene.time.now + feelHitStopMs(FEEL.reignite.hitStopMs),
      );
      playReignite(scene, p);
      playSfx('reignite');
    }),
    bus.on<RefusalPayload>('vfx.refusal', (p) => playRefusal(scene, p)),
    bus.on<BurnoutPayload>('vfx.burnout', (p) => { playBurnout(scene, p, opts.getPlayerPos); playSfx('despair'); }),
  ];

  const originalUpdate = scene.update.bind(scene);
  scene.update = (time: number, delta: number) => {
    const scaled = time < hitStopUntil ? delta * 0.15 : delta;
    originalUpdate(time, scaled);
  };

  return {
    detach: () => {
      for (const u of unsubs) u();
      scene.update = originalUpdate;
    },
  };
}
