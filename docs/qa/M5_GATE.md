# M5 depth gate checklist (DRAFT)

**Authority:** Alex via Niblet — Probe is the quality gate.
**Rubric:** `docs/qa/QUALITY_GATE.md` — green unit/build tests are **necessary, not sufficient**. M5 adds a conceptual **depth** row: *does the hoarder path, patron leverage, and a life that outlives its player make the world feel deeper?*
**Status:** **Go (Niblet, on Alex's delegation).** Evidence: `docs/qa/reports/m5-depth.md` (+ `_m5-depth.json`). 
**Inputs:** `docs/superpowers/plans/m5/index.md` · `task-a-hoarder-notoriety.md` · `task-b-kingdom-patrons.md` · `task-c-generational-legacy.md`.

> **Do not flip M3 SHIP or M4 GO.** M5 reads them as baselines only. Succession UI, pickers, toasts, art and audio are **M6**; balance bots are **M7**.

---

## Verdict (Alex)

- [x] **GO** (Niblet, on Alex's delegation)
- [ ] **HOLD**

Decided by: Niblet (delegated by Alex)  Date: 2026-11-06  Code under test SHA: 98ce756 + neglect/balance commit

---

## Go trigger

Gate only after Forge lists all three tasks landed (hoard `src/sim/hoard/`, patrons `src/sim/patrons/`, legacy `src/sim/legacy/`) and cites `npm run validate && npm test && npm run build` green on that tip. Phaser/render is not part of acceptance.

## Exact command order

```bash
git rev-parse HEAD && git log -1 --oneline && git status -sb
npm run validate
npm test
npm run build
npm run evidence:m5      # = npx vite-node scripts/m5-depth-evidence.mts
# -> docs/qa/reports/_m5-depth.json and docs/qa/reports/m5-depth.md (run twice: byte-identical)
grep -rn "archetypeId ===" src/sim/     # expect 0 hits
grep -rn "Math.random" src/sim/hoard src/sim/patrons src/sim/legacy   # expect 0 hits
```

## Metrics table (depth)

| Metric | Pass | Harsh fail | Source |
|--------|------|------------|--------|
| **Hoarder ending** | 30 dawns, 0 reignites, peak coin ≥ `hoardLegacy.peakCoinMin` ⇒ `detectEnding` = `ash_hoard`; no loss flag | Loss state, or no ending | Task A |
| **Let it rest** | `letItRest` ends warmly (`ended: rest`), no shame branch | Shaming/lose path | Task A / C |
| **Notoriety drives encounters** | `attractorRoadBonus` and `rollAttractors('road')` rise with notoriety, zero at 0 | Flat weights | Task A |
| **Neglect** | Neglect raises town despair via LOD but never fails the run | Lose state from neglect | Task A / M4 LOD |
| **Patron deal** | Accept via interaction shifts notoriety **and** doctrine meters; two runs equal | One side only, or non-deterministic | Task B |
| **Carry it on** | Burnout ⇒ heir continues (ember gift, own traits) | No heir path / crash | Task C |
| **World file round trip** | `exportWorld` → `importWorld` on fresh state: grave + legend present; same seed ⇒ identical file/`contentHash` | Hash drift, missing legend | Task C |
| **No archetype branching / no `Math.random`** | 0 hits per greps above | Any hit | Global rules |
| **Determinism** | Evidence script twice ⇒ identical outputs | Any drift | Global rules |

## Evidence caveats

- All shipped towns have `economyOptIn: false`; the evidence script opts in `lowmere` + `city_reach` (as M4 does) for the neglect check.
- Evidence uses seed 7, archetype `marrow`, a scripted (non-bot) hoarder: two `stash_hide` acts, then 30 dawns with no reignites.
- Any failed check is listed under **Gaps** in `m5-depth.md` and printed as `gaps: [...]`; sim code is not patched by the evidence script.

## Hard stop rules

- Do not edit `src/sim/**`, `src/render/**`, `src/data/**` from the gate. Commit Probe-only paths.
- Do not gate on UI/render/audio (M6) or balance (M7).
