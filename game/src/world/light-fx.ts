/**
 * The world's light as one camera post-FX pass (WebGL): daylight from the clock as a per-pixel multiply,
 * warm pools around hearths at night, and each town's despair as a per-pixel palette shift around it
 * (desaturate + cool bias; a warm town gets chroma + warm push, and a reignite briefly brightens it).
 * Never an overlay (docs/art/STYLE_SPEC_2.5D.md). Canvas renderer: no-op.
 */
import Phaser from 'phaser';

export const MAX_TOWNS = 8;
export const MAX_LIGHTS = 8;

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
uniform vec4 uView;
uniform vec4 uTowns[${MAX_TOWNS}];
uniform vec3 uLights[${MAX_LIGHTS}];
uniform vec3 uDay;
uniform float uNight;
uniform vec2 uTownR;
uniform vec3 uSeason;
void main() {
  vec4 col = texture2D(uMainSampler, outTexCoord);
  vec2 w = vec2(uView.x + outTexCoord.x * uView.z, uView.y + (1.0 - outTexCoord.y) * uView.w);
  float desp = 0.0;
  float warm = 0.0;
  for (int i = 0; i < ${MAX_TOWNS}; i++) {
    vec4 t = uTowns[i];
    float d = length((w - t.xy) * vec2(1.0, 1.2));
    float k = 1.0 - smoothstep(uTownR.x, uTownR.x + uTownR.y, d);
    desp = max(desp, k * t.z);
    warm = max(warm, k * t.w);
  }
  vec3 c = col.rgb;
  // The season on the land: only greenery (green above red and blue) turns, so roofs, paths and people keep
  // their colour. x: snow lying, y: autumn rust, z: summer's dry gold.
  float green = clamp((c.g - max(c.r, c.b)) * 4.0, 0.0, 1.0);
  c = mix(c, vec3(0.80, 0.50, 0.22) * (0.55 + c.g * 0.7), green * uSeason.y * 0.75);
  c = mix(c, c * vec3(1.08, 1.0, 0.82), green * uSeason.z * 0.5);
  float ls = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(0.86, 0.9, 0.97) * (0.75 + ls * 0.35), green * uSeason.x * 0.85);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 cool = vec3(l) * vec3(0.9, 0.96, 1.1);
  c = mix(c, cool, desp * 0.82);
  c = mix(c, vec3(l * 0.85 + 0.05), desp * 0.18);
  vec3 rich = vec3(l) + (c - vec3(l)) * 1.35;
  c = mix(c, rich * vec3(1.07, 1.0, 0.88), warm);
  float glow = 0.0;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec3 L = uLights[i];
    if (L.z <= 0.0) continue;
    float d = length((w - L.xy) * vec2(1.0, 1.3));
    glow = max(glow, 1.0 - smoothstep(L.z * 0.25, L.z, d));
  }
  vec3 lit = mix(uDay, vec3(1.08, 0.94, 0.78), glow * uNight);
  gl_FragColor = vec4(c * lit, col.a);
}`;

class WorldLightPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  viewRect: number[] = [0, 0, 640, 360];
  towns: number[] = new Array(MAX_TOWNS * 4).fill(-1e4);
  lights: number[] = new Array(MAX_LIGHTS * 3).fill(0);
  day: [number, number, number] = [1, 1, 1];
  night = 0;
  townR: [number, number] = [320, 260];
  season: [number, number, number] = [0, 0, 0];
  constructor(game: Phaser.Game) {
    super({ game, name: 'WorldLightFX', fragShader: FRAG });
  }
  onPreRender(): void {
    this.set4f('uView', this.viewRect[0]!, this.viewRect[1]!, this.viewRect[2]!, this.viewRect[3]!);
    // Fresh arrays: Phaser skips a uniform whose array reference has not changed.
    this.set4fv('uTowns', new Float32Array(this.towns));
    this.set3fv('uLights', new Float32Array(this.lights));
    this.set3f('uDay', this.day[0], this.day[1], this.day[2]);
    this.set1f('uNight', this.night);
    this.set2f('uTownR', this.townR[0], this.townR[1]);
    this.set3f('uSeason', this.season[0], this.season[1], this.season[2]);
  }
}

export type TownTone = { x: number; y: number; despair: number; warm: number };
export type LightFrame = {
  day: [number, number, number];
  night: number;
  towns: TownTone[];
  lights: { x: number; y: number; radius: number }[];
  /** Inner radius and falloff of a town's tone (px). */
  townR?: [number, number];
  /** Snow lying, autumn rust, summer gold, each 0..1 (world/season-fx). Indoors: omit. */
  season?: [number, number, number];
};
export type LightFx = { apply(frame: LightFrame): void; destroy(): void };

/** Attach the light pass to the scene's main camera; null on the canvas renderer. */
export function createLightFx(scene: Phaser.Scene): LightFx | null {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  if (!renderer.pipelines.getPostPipeline('WorldLightFX')) renderer.pipelines.addPostPipeline('WorldLightFX', WorldLightPipeline);
  const cam = scene.cameras.main;
  cam.setPostPipeline(WorldLightPipeline);
  const got = cam.getPostPipeline(WorldLightPipeline);
  const fx = (Array.isArray(got) ? got[0] : got) as unknown as WorldLightPipeline | undefined;
  if (!fx) return null;
  return {
    apply(f) {
      const v = cam.worldView;
      // Camera-relative: the shader works in px from the view's corner, so mediump floats keep their
      // precision anywhere in a realm millions of px wide.
      fx.viewRect = [0, 0, v.width, v.height];
      const near = [...f.towns].sort((a, b) => Math.hypot(a.x - v.centerX, a.y - v.centerY) - Math.hypot(b.x - v.centerX, b.y - v.centerY)).slice(0, MAX_TOWNS);
      const towns = new Array(MAX_TOWNS * 4).fill(0);
      for (let i = 0; i < MAX_TOWNS; i++) {
        const t = near[i];
        towns.splice(i * 4, 4, t ? t.x - v.x : -1e4, t ? t.y - v.y : -1e4, t?.despair ?? 0, t?.warm ?? 0);
      }
      fx.towns = towns;
      const lights = new Array(MAX_LIGHTS * 3).fill(0);
      f.lights.slice(0, MAX_LIGHTS).forEach((l, i) => lights.splice(i * 3, 3, l.x - v.x, l.y - v.y, l.radius));
      fx.lights = lights;
      fx.day = f.day;
      fx.night = f.night;
      if (f.townR) fx.townR = f.townR;
      fx.season = f.season ?? [0, 0, 0];
    },
    destroy() { cam.removePostPipeline('WorldLightFX'); },
  };
}
