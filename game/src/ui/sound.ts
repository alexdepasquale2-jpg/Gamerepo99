/**
 * Sound on/off for the pause menu. The voice area owns the cues; this keeps the one preference
 * (localStorage `hf.sfx.muted`, the key the old game's sfx used) and applies it to Phaser's sound
 * manager and, when the voice API offers one, to `setMuted`.
 */
import type { GameContext } from '../app/contracts';

const KEY = 'hf.sfx.muted';

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Push the stored preference into a run (on attach and after a toggle). */
export function applyMuted(ctx: GameContext | null): void {
  if (!ctx) return;
  const muted = isMuted();
  try {
    ctx.scene.sound.mute = muted;
  } catch {
    /* no sound manager */
  }
  // TODO(voice): VoiceApi has no mute yet; if voice adds `setMuted(on)`, this already calls it.
  (ctx.voice as unknown as { setMuted?: (on: boolean) => void } | undefined)?.setMuted?.(muted);
}

export function setMuted(on: boolean, ctx: GameContext | null): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: still applies for this run */
  }
  if (ctx) {
    try {
      ctx.scene.sound.mute = on;
    } catch {
      /* no sound manager */
    }
    (ctx.voice as unknown as { setMuted?: (on: boolean) => void } | undefined)?.setMuted?.(on);
  }
}
