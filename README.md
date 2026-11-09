# The Last Spark

Walk into towns that have lost the will to live and reignite people one by one.
Every method you use costs some of your own spark.

- **A hundred districts with up to 100,000 dawns of baked history.** Choose the world's age at New game; every district lives all of it first.
- **A storyteller paces the tale.** Old Ember, the Weaver or the Gale: calm, omens, a crisis sized to what you own, and trouble you can answer.
- **A world that runs without you.** Work, trade, families, feuds, pacts and wars, all NPC-run and deterministic.

## Run the game

```bash
npm ci
npm run game:dev      # http://localhost:5174
```

The game is in `game/` (TypeScript, Vite, Phaser 3). `game/README.md` has the feature list, the architecture and the rules for working on it.

```bash
npm run game:check    # type check + unit tests
npm run game:build    # production build into game/dist
npm run game:e2e      # browser tests against the build
```

## The old prototype

`src/`, `tests/` and the root scripts are the first version of the game. It still runs (`npm run dev`, port 5173; `npm run check`) and is kept until `game/` fully replaces it. New work goes in `game/`.
