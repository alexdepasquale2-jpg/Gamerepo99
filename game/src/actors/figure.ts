/**
 * One walking figure on screen (player, sibling, villager): sprite + ground shadow, 4-way facing, a
 * step cycle at the figure's own tempo, an idle breath, and the posture its marks give it.
 */
import type Phaser from 'phaser';
import { frameOf, type Dir } from './draw-person';
import { ensureShadow, lookTexture, type PersonLook } from './looks';
import { UPRIGHT, type Posture } from './marks';

export class Figure {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  dir: Dir = 0;
  private flip = false;
  private animT = 0;
  private scale: number;
  private fps: number;
  private bob: number;
  private posture: Posture = UPRIGHT;
  private extraTint = 0xffffff;

  constructor(private scene: Phaser.Scene, look: PersonLook, x: number, y: number) {
    this.scale = look.scale;
    this.fps = look.fps;
    this.bob = look.bob;
    this.shadow = scene.add.image(x, y, ensureShadow(scene)).setOrigin(0.5, 0.5);
    this.sprite = scene.add.sprite(x, y, lookTexture(scene, look.look), frameOf(0, 1)).setOrigin(0.5, 1);
    this.applyScale(0);
    this.place(x, y);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }

  setLook(look: PersonLook): void {
    this.scale = look.scale;
    this.fps = look.fps;
    this.sprite.setTexture(lookTexture(this.scene, look.look), frameOf(this.dir, 1));
    this.applyScale(0);
  }

  setPosture(p: Posture): void {
    this.posture = p;
    this.applyTint();
  }

  /** A second tint multiplied on top of the posture (brood sibling hues). */
  setTint(t: number): void {
    this.extraTint = t;
    this.applyTint();
  }

  place(x: number, y: number): void {
    this.sprite.setPosition(x, y).setDepth(y);
    this.shadow.setPosition(x, y - 1).setDepth(y - 0.5).setScale((this.scale / 2) * 1.1, this.scale / 2);
  }

  /** Face the way of travel (4-way; side frames face right and flip for left). */
  face(dx: number, dy: number): void {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.1) { this.dir = 2; this.flip = dx < 0; } else { this.dir = dy < 0 ? 1 : 0; this.flip = false; }
  }

  /** Advance the step cycle (or settle to standing and breathe). `tempo` scales the stride rate. */
  animate(dtSec: number, moving: boolean, timeSec: number, tempo = 1): void {
    let step = 1;
    if (moving) {
      this.animT += dtSec * this.fps * tempo * this.posture.tempo;
      const k = Math.floor(this.animT) % 4; // 0,1,2,1 stride
      step = k === 0 ? 0 : k === 2 ? 2 : 1;
    } else this.animT = 0;
    const f = frameOf(this.dir, step);
    if (this.sprite.frame.name !== f) this.sprite.setFrame(f);
    this.sprite.setFlipX(this.flip);
    const breath = moving ? 0 : Math.sin(timeSec * 1.6 + this.bob) * 0.025 * this.posture.breath;
    this.applyScale(breath);
    this.sprite.setRotation(this.posture.lean * (this.flip ? -1 : 1));
  }

  setVisible(v: boolean): void {
    this.sprite.setVisible(v);
    this.shadow.setVisible(v);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }

  private applyScale(breath: number): void {
    this.sprite.setScale(this.scale, this.scale * (this.posture.scaleY + breath));
  }

  private applyTint(): void {
    const a = this.posture.tint, b = this.extraTint;
    const mul = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
    const t = mul(16) | mul(8) | mul(0);
    if (t === 0xffffff) this.sprite.clearTint(); else this.sprite.setTint(t);
  }
}
