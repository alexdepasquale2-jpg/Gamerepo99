# 2.5D Task 2 brief — WorldLayout at minutes-scale spacing

Plan: docs/superpowers/plans/2026-11-05-m3-25d-overworld-foundation.md
Spec: docs/superpowers/specs/2026-11-05-m3-25d-overworld-foundation-design.md
Base tip: c91755e (Task 1 @ 40c6b73 + Prism sheets @ c91755e)

## Global constraints (binding)
- Pure sim: `src/sim/map/**` imports no Phaser and no `dyn/`.
- Square ortho: `q=x`, `r=y`.
- Soft cap 200 / hard 400 lines per file; split before merge.
- No `archetypeId ===` in `src/sim/`.
- Do not touch Prism `docs/art/` or `assets/vendor/` unless Prism greenlights.
- Defaults: `CHUNK_SIZE=32`, `TILES_PER_MINUTE=120`, `WALK_MINUTES_SPINE=3`.
- Work ONLY in `/workspace/hearthfall`; TDD; commit when green.
- Honor docs/STRUCTURE.md.

### Task 2: WorldLayout — settlement positions at walk scale

**Files:**
- Create: `src/sim/map/world-layout.ts`, `src/sim/map/constants.ts`
- Test: `tests/sim/map/world-layout.test.ts`

**Interfaces:**
- Consumes: `FabricWorld`, `generateWorld` (from `src/sim/gen/world` or fabric facade)
- Produces: `layoutWorld(world, seed): WorldLayout` with `settlements: {id,q,r}[]`, `routes: {id,from,to}[]`

SettlementGen has `id`, `name`, `gap01`, `politySize` (no q/r yet — layout assigns them).
RouteGen has `id`, `fromId`, `toId`, `days`, `biomeIds` — map to `{id,from,to}` using fromId/toId.

- [ ] **Step 1: Failing test** — spine neighbors Manhattan or corridor length ≥ `0.8 * WALK_MINUTES_SPINE * TILES_PER_MINUTE`

```ts
const world = generateWorld({ seed: 7, peopleCount: 8 });
const layout = layoutWorld(world, 7);
const [a, b] = layout.settlements;
const d = Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
expect(d).toBeGreaterThanOrEqual(Math.floor(0.8 * 3 * 120));
```

Also assert: same seed → same layout; settlements count ≥ 3; every route from/to resolves to a settlement id.

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/sim/map/world-layout.test.ts`)

- [ ] **Step 3: Implement layout** — place settlements along gap01 axis with spacing `WALK_MINUTES_SPINE * TILES_PER_MINUTE`, light seeded perpendicular jitter. Export constants from `constants.ts`. Use Mulberry32 / existing `createRng` from `src/sim/rng`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat(map): world layout at minutes-scale spacing`

Do NOT implement Tasks 3–6. Do NOT touch Phaser, play-session, or Prism art.
