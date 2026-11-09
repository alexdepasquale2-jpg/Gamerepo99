import type Phaser from 'phaser';
import type { BookOfEnds } from './home/types';
import { bootHomeGame, runHomeFlow } from './ui/home-flow';

let game: Phaser.Game | null = null;

function stop(): void {
  game?.destroy(true);
  game = null;
}

runHomeFlow({
  stop,
  start(book) {
    stop();
    game = bootHomeGame('game', book);
  },
  setPaused(paused) {
    if (!game) return;
    for (const scene of game.scene.getScenes(false)) {
      if (paused && game.scene.isActive(scene.scene.key)) scene.scene.pause();
      else if (!paused && game.scene.isPaused(scene.scene.key)) scene.scene.resume();
    }
  },
  readBook() {
    if (!game) return null;
    return (game.registry.get('book') as BookOfEnds | undefined) ?? null;
  },
});
