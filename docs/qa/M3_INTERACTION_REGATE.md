# M3 interaction-model re-gate checklist (HOLD → go)

**Authority:** Alex via Niblet — Probe is the quality gate.  
**Rubric:** `docs/qa/QUALITY_GATE.md` (M3 Hybrid-C).  
**Status:** **GATED @ `ddd546f`** — HOLD lifted (Forge green: `2a912b1` juice bridge + `ddd546f` default-ON / legacy act spark path removed). Probe verdict: **SHIP** — see `docs/qa/reports/m3-worth-playing.md`.  
Historical: do not treat tip `a8bcf43` alone as a final gate (compat opt-in / recipe map only; hollow/reignite still 0 in that smoke).

Prior committed worth-playing: **SHIP-WITH-FIXES** @ `ca882cd` era.  
This gate @ `ddd546f`: burnoutRate ≈ **0.111** (3/27), stuck/bored/dominance clean, hollow/reignite **190/231**, 24/27 @ maxTicks 200.

---

## Go trigger (only)

Re-gate **only** after Forge → Probe ping that:

1. special-bar + ripple side effects are ported under the interaction model, **and**
2. `interactionCompat` default is **ON** (or the flag is gone / always-on), **and**
3. legacy `spark.spend` success path for method acts is deleted, **and**
4. Forge cites special-bar + ripple + interaction + bots green.

Ignore earlier “re-gate on `a8bcf43`” pings until that default-on green message lands.

---

## Preflight (after Forge green ping)

| Check | How | Expect |
|-------|-----|--------|
| Tip SHA | `git rev-parse --short HEAD` + `git log -1 --oneline` | Record exact SHA in verdict; clean Probe worktree for Probe paths (leave Forge render dirt alone) |
| `interactionCompat` default ON | Read `createPlaySession` / `CreatePlaySessionOpts` + bots opts | Default true **or** flag removed; bots still pass / tolerate ON |
| No live `spark.spend` on method success | `npx vite-node scripts/m3-interaction-evidence.mts` + interaction play-session tests | Success-path method acts → `interaction` / mapped recipe (e.g. inspire→`talk_gentle`); **no** `spark.spend` on that path |
| special-bar green | `npx vitest run tests/sim/scenario/special-bar-gen.test.ts` | All pass (cite Forge/Probe) |
| ripple green | `npx vitest run tests/sim/ripple-play.test.ts` (and any Forge-named ripple suite) | All pass; look for `packet.emit` / deliver when scenario fires |
| interaction + bots green | Forge cite + `npm run test:bots` | Green before matrix verdict |

---

## Exact command order (Probe at go-time)

Conserve: skip full `npm test` / e2e unless Niblet asks. Prefer this order:

```bash
# 0) Record tip
git rev-parse HEAD && git log -1 --oneline && git status -sb

# 1) Interaction evidence probe (fast; histogram + spark.spend check)
npx vite-node scripts/m3-interaction-evidence.mts

# 2) Hybrid-C matrix → docs/qa/reports/_m3-matrix-raw.json
npx vite-node scripts/run-playthrough-matrix.mts

# 3) Bot unit harness
npm run test:bots

# 4) Special-bar
npx vitest run tests/sim/scenario/special-bar-gen.test.ts

# 5) Ripple (interaction-model side effects)
npx vitest run tests/sim/ripple-play.test.ts

# 6) Build
npm run build
```

**Conserve note:** Do **not** run full `npm test` or `npm run test:e2e:m3` on the first go-time pass unless matrix/bots/special-bar/ripple/build disagree or Niblet escalates. Prior e2e green cites are enough for conserve.

---

## Metrics table (interaction model)

| Metric | Pass | Harsh fail | Interaction-model note |
|--------|------|------------|------------------------|
| matrix status | `OK`, 0 `API_PENDING`, 0 `ERROR` | pending/errors | Session must boot with interaction default-ON |
| stuck | 0 OK cells stuck (`stuckTicks`=10) | any stuck | Unchanged |
| bored | 0 OK cells bored (`boredomTicks`=10) | any bored | Unchanged |
| method_dominance | 0 breaches (cap 0.65) | any breach | Dominant ids may be mapped recipes (`talk_gentle`, …) or still method ids in traces — record both |
| **burnout_rate** | Loom **&lt; 1.0**; prefer **≤ 0.85** | **= 1.0** | Compat-only smoke @ `a8bcf43` was ≈0.111 — re-check after default-ON + side-effect ports |
| hollow_vs_reignited | Observe; prefer both **&gt; 0** and a sensible H/R story | both **0** with long ticks = hollow world | Compat recipe map alone left H/R at 0 — default-ON + special-bar/ripple should restore reignite/hollow signal |
| rest/travel | Listed + some picks (if cheap to tally from traces) | never listed when expected | Not a hard ship blocker if burnout/H/R otherwise healthy |

**Worth-playing bar:** stuck/bored/dominance clean **and** burnout &lt; 1.0 (prefer ≤0.85) **and** interaction evidence shows real interaction events (not legacy spark-only). Hollow/reignite both-zero with maxTicks survival is a strong **SHIP-WITH-FIXES** / **NO-SHIP** smell (alive clock, dead stakes).

---

## Interaction-model evidence to capture

`scripts/run-playthrough-matrix.mts` **does not** currently aggregate `session.events()` — metrics come from traces/snapshots only. At go-time:

1. Run **`scripts/m3-interaction-evidence.mts`** (standalone short probe using `BOT_PLAY_SESSION_OPTS` / `connectBotSession`).
2. Capture into the verdict (and optionally paste summary into `_m3-matrix-raw.json` notes by hand):

| Signal | Expect under interaction default-ON |
|--------|-------------------------------------|
| Event types | Counts for `interaction` (and/or mapped `talk_gentle`), `site.kindle`, `mark.applied`, `packet.emit`, `refusal.*` / `refusal.coal_flicker` when scenarios fire |
| `spark.spend` | **Absent** on method **success** path; refusal may still emit juice — note which |
| Rest/travel | If cheap: whether `advance:*` / `travel:*` appear in picks during evidence probe or matrix traces |
| Compat / default | Document whether bots still pass `interactionCompat: true` or default is ON without flag |

Do **not** deepen `run-matrix.ts` mid-Forge WIP unless go-time proves the standalone probe insufficient.

---

## Verdict outputs

1. Update **`docs/qa/reports/m3-worth-playing.md`** — SHIP / SHIP-WITH-FIXES / NO-SHIP; tip SHA; matrix table; interaction evidence; special-bar + ripple cites; conserve note.
2. Update **Probe** tab row in **`docs/SCHEDULE.xlsx`** (office-xlsx) with gate result + SHA.
3. Report **Niblet + Forge** via SendToAgent, **priority: false**, with verdict + paths + SHA.
4. Commit **Probe-only** paths (reports, this checklist, Probe harness/scripts/docs). Never stage Forge `src/render/**` / unrelated WIP.

---

## Hard stop rules

- **Never** `StopSubagent` with `all: true`. Stop only Probe’s own child **by id**.
- Do **not** commit non-Probe dirt (render/feel, Forge WIP, foreign untracked).
- Do **not** gate solely on `a8bcf43` / opt-in compat tip.
- Do **not** kill `claude` processes or edit `src/sim/**` / `src/render/**` / `artifacts/**` during HOLD or go-time (Forge owns those).
- HOLD remains until Forge’s **default-on green** ping — prep only before then.

---

## Prep artifacts (this HOLD pass)

| Path | Role |
|------|------|
| `docs/qa/M3_INTERACTION_REGATE.md` | This checklist |
| `scripts/m3-interaction-evidence.mts` | Short session probe → event histogram + `spark.spend` check |
| `docs/qa/PLAYTHROUGH_BOTS.md` | Status blurb → HOLD + pointer here |
| `docs/qa/QUALITY_GATE.md` | M3 section links this checklist |

Matrix raw at go-time: `npx vite-node scripts/run-playthrough-matrix.mts` → `docs/qa/reports/_m3-matrix-raw.json`.
