/**
 * The season and the day's weather (sim/season), painted: the light pass turns greenery to snow or rust
 * (light-fx uSeason), daylight cools in winter and warms in summer, and a screen-wide fall of snow, rain or
 * leaves drifts over the camera. One emitter per kind, moved with the camera, so the cost is flat however
 * far the player walks. Reads only state.day and the seed.
 */
import Phaser from 'phaser';
import { countVisual } from '../dev/visual-counts';
import { seasonOf, seasonPart, weatherOf, type Season, type Weather } from '../sim/season';
import { PUFF_TEX } from './assets';

const STREAK_TEX = 'season-streak';
const LEAF_TEX = 'season-leaf';

/** [snow, rust, gold] at a season's heart; the next season's look eases in over its last two days. */
const LOOK: Record<Season, [number, number, number]> = {
  spring: [0, 0, 0], summer: [0, 0, 0.8], autumn: [0, 0.9, 0], winter: [1, 0, 0],
};
/** Daylight multiplier per season (winter pale and blue, summer warm). */
const LIGHT: Record<Season, [number, number, number]> = {
  spring: [1, 1.02, 1], summer: [1.05, 1.0, 0.92], autumn: [1.03, 0.96, 0.88], winter: [0.94, 0.98, 1.08],
};
const NEXT: Record<Season, Season> = { spring: 'summer', summer: 'autumn', autumn: 'winter', winter: 'spring' };

export type SeasonFx = {
  /** The light pass's season vector and daylight multiplier for today. */
  look(): { season: [number, number, number]; light: [number, number, number] };
  update(cam: Phaser.Cameras.Scene2D.Camera, indoors: boolean): void;
  state(): { season: Season; weather: Weather; day: number };
  destroy(): void;
};

function ensureTextures(scene: Phaser.Scene): void {
  const t = scene.textures;
  if (!t.exists(STREAK_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 7);
    g.generateTexture(STREAK_TEX, 1, 7);
    g.destroy();
  }
  if (!t.exists(LEAF_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(1, 0, 2, 1).fillRect(0, 1, 4, 1).fillRect(1, 2, 2, 1);
    g.generateTexture(LEAF_TEX, 4, 3);
    g.destroy();
  }
}

export function createSeasonFx(scene: Phaser.Scene, getDay: () => number, seed: number): SeasonFx {
  ensureTextures(scene);
  // Spawn across a band wider than any view (zoomed out on a wide screen) and a little to windward.
  const band = new Phaser.Geom.Rectangle(0, 0, 2600, 12);
  const cfg = (o: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
    scene.add.particles(0, 0, o.texture as string, { ...o, emitting: false, emitZone: { type: 'random', source: band, quantity: 0 } as Phaser.Types.GameObjects.Particles.EmitZoneData }).setDepth(1e7);
  const emit = {
    snow: cfg({ texture: PUFF_TEX, speedY: { min: 18, max: 36 }, speedX: { min: -8, max: 8 }, lifespan: 20000, scale: { min: 0.25, max: 0.55 }, alpha: { start: 0.9, end: 0.6 }, tint: 0xf4f8ff, frequency: 45, quantity: 2 }),
    rain: cfg({ texture: STREAK_TEX, speedY: { min: 300, max: 380 }, speedX: { min: -50, max: -30 }, lifespan: 1500, scale: { min: 1.2, max: 1.8 }, alpha: { start: 0.45, end: 0.25 }, tint: 0xa8c0e0, frequency: 12, quantity: 3, rotate: 8 }),
    leaves: cfg({ texture: LEAF_TEX, speedY: { min: 14, max: 30 }, speedX: { min: 10, max: 40 }, lifespan: 18000, scale: { min: 1.5, max: 2.2 }, rotate: { min: 0, max: 360 }, tint: [0xc8642a, 0xd8902a, 0xa84a22, 0xe0b040], frequency: 220, quantity: 1 }),
    petals: cfg({ texture: LEAF_TEX, speedY: { min: 8, max: 18 }, speedX: { min: 6, max: 20 }, lifespan: 24000, scale: { min: 1.2, max: 1.6 }, rotate: { min: 0, max: 360 }, tint: [0xf8d8e8, 0xffffff, 0xf0c0d8], frequency: 500, quantity: 1 }),
  };
  type Kind = keyof typeof emit;
  let memoDay = -1, memo: { season: Season; weather: Weather; look: [number, number, number]; light: [number, number, number] } | null = null;
  const today = () => {
    const day = getDay();
    if (day !== memoDay || !memo) {
      memoDay = day;
      const s = seasonOf(day), part = seasonPart(day);
      // Ease toward the next season over the last stretch, so the land does not flip overnight.
      const k = Math.max(0, (part - 0.7) / 0.3) * 0.6;
      const a = LOOK[s], b = LOOK[NEXT[s]], la = LIGHT[s], lb = LIGHT[NEXT[s]];
      const mix = (x: number[], y: number[]) => x.map((v, i) => v + (y[i]! - v) * k) as [number, number, number];
      memo = { season: s, weather: weatherOf(seed, day), look: mix(a, b), light: mix(la, lb) };
    }
    return memo;
  };
  const kindsFor = (s: Season, w: Weather): Kind[] => {
    if (w === 'snow') return ['snow'];
    if (w === 'rain') return ['rain'];
    if (s === 'autumn') return ['leaves'];
    if (s === 'spring' && w !== 'wind') return ['petals'];
    if (w === 'wind') return ['leaves'];
    return [];
  };
  return {
    look: () => { const t = today(); return { season: t.look, light: t.light }; },
    update(cam, indoors) {
      const t = today();
      const on = new Set(indoors ? [] : kindsFor(t.season, t.weather));
      const v = cam.worldView;
      let alive = 0;
      for (const [k, e] of Object.entries(emit) as [Kind, Phaser.GameObjects.Particles.ParticleEmitter][]) {
        const want = on.has(k);
        if (e.emitting !== want) e.emitting = want;
        e.setPosition(v.centerX - 1300, v.y - 20);
        alive += e.getAliveParticleCount();
        e.setVisible(!indoors);
      }
      countVisual('weather', alive);
      countVisual('seasonTint', indoors ? 0 : Math.round((t.look[0] + t.look[1] + t.look[2]) * 100));
    },
    state: () => { const t = today(); return { season: t.season, weather: t.weather, day: getDay() }; },
    destroy() { for (const e of Object.values(emit)) e.destroy(); },
  };
}
