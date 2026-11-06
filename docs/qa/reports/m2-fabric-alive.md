# M2 Fabric alive — generator quality report

**Generated:** 2026-11-05 11:13 PM (America/New_York)  
**Harness:** `tests/bots/fabric/` via `connectFabricApi()` → `src/sim/fabric.ts` (+ `fabric-bake.ts`)  
**Status:** `OK` (live matrix; API present; all metric floors green)  
**Candidate HEAD:** `dfc2b62` (`test(sim): assert bake prefix/trail keys match score penalties`; stack includes Task E variance, bake novelty, prefix/trail within-world penalties, includeAnchors, settlements/routes/doctrines/facilities/biomes, dumpWorld, inspect-only createPlaySession)  
**Skills cited:** `using-superpowers`, `verification-before-completion` (fresh `npm test` / `test:bots` / fabric suite / build / feel dump this turn — no claim from Forge self-run alone)

## Verdict
**Call: SHIP**

**Question:** Does the fabric make people (and worlds) feel unique and alive?  
**Answer:** **Yes — enough to clear M2.** Worlds are no longer clone scaffolds. Within a town, people speak distinct exact lines with no shared 5-word prefixes or shared trailing clauses. Cross-seed blend-tail chorus remains audible (polish, not a scaffold fail). Caps unchanged. Playthrough-town matrix stays **M3** (`createPlaySession` is inspect-only; `connectBotSession` still null).

### Weighing layers at `dfc2b62`
| Layer | Evidence | Alive? |
|-------|----------|--------|
| World shape (Task E) | History beat tables vary (seed1×3 loss/founding/feud vs seed4×6 +departure/mill/drift vs seed7×5 +port/ferry); gaps not fixed poles (counts 3–5, gap01 spread); kin 7–13 with kin/friend/pen_pal mix; settle/route/doc/fac/biome differ (1: 3/1/2/1/1 vs 7: 4/2/3/3/4) | **Yes** — prior scaffold NO-SHIP cleared |
| Fingerprints | Distinct family: `wf-9827ed64-8`, `wf-d54ae1d8-8`, `wf-a0d078dd-8`, `wf-84e4264e-8`, … (not old `wf-008231e5-8` clones) | **Yes** |
| Within-world voice | sharedPref **0**, sharedTrail **0** on all 12 seeds after `75eed58`/`9a18e87` | **Yes** |
| Cross-matrix lines | **94/96** unique exact; 2 cross-seed exact dups (seeds 11↔19, 13↔19) | Mostly yes |
| Assertions / stubs | AVR **0**; stub-voice **0**; repeatLineRate **0** | Pass |
| Cross-seed trail chorus | Top trails hit many seeds: "Grief isn't done with me yet." **10/12**; "I keep the notice." **9/12**; "That word already lives in my mouth." **8/12**; ink/hole/soft-room **7/12** | **Polish** — walking town→town you still hear the same endings |

Automated floors are necessary and green. Feel pass now agrees worlds are not the same town with different dialogue. Cross-seed clause deck is the remaining voice debt — **non-blocking for M2** (same optional polish called out at `faa9ff2`), still worth Forge shrinking the blend-tail pool before calling voice *done*.

### Concrete evidence (fresh `generateWorld`, peopleCount 8)
| Seed | Fingerprint | History / gap / kin | s/r/d/f/b | Sample lines |
|------|-------------|---------------------|-----------|--------------|
| 1 | `wf-9827ed64-8` | hist×3 (`hb_loss_quiet_birth`/`hb_founding_desk`/`hb_feud_shelf`); gap×5; kin×10 (3/6/1) | 3/1/2/1/1 | `Call me a washed-up tune…` / `I've heard that word at funerals.` / `Correct me properly or sit down…` |
| 4 | `wf-d54ae1d8-8` | hist×6 (+departure/mill/notice/drift); gap×5; kin×12 (6/3/3) | 3/1/3/1/2 | `This isn't a tab you keep forever.` / `Seasons shame everyone. Replant.` / `Sure, I'm fine. Fine's a setting on the stove…` |
| 7 | `wf-a0d078dd-8` | hist×5 (+port/ferry/notice); gap×4; kin×10 (4 pen_pal) | 4/2/3/3/4 | `I've got ash, not sparks.` / `Argue in triplicate or not at all.` / `Call me a failed season…` |
| 23 | `wf-84e4264e-8` | hist×5; gap×4; kin×7 (friend/kin only) | 3/1/2/2/1 | `I've polished that guilt daily…` / `Give me the sack of almost-given-up…` / `Pass the weight. My shoulders remember crates…` |

**Within-world exact-dup seeds:** none. **Within-world prefix/trail twins:** none (0 shared groups on 12×8).  
**Cross-seed exact dups (2):** `One more loaf…` (11,19); `Don't shout near the quiet…` (13,19).

## Live matrix (12 seeds)
Seeds: `1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29` (`fabric-thresholds.json` — **unchanged**)

| Metric | Threshold | Live aggregate | Pass? |
|--------|-----------|----------------|-------|
| world_diversity | ≥ 0.9 | **1** | yes |
| history_coherence | ≥ 0.95 | **1** | yes |
| kin_connectedness | ≥ 0.5 | **1** | yes |
| gap_spread | ≥ 0.55 | **0.947** | yes |
| assertion_violation_rate | ≤ 0 | **0** | yes |
| people_diversity | ≥ 0.75 | **1** | yes |
| determinism | true | **true** | yes |
| repeat_line_rate | ≤ 0.15 | **0** | yes |

All 12 cells `OK`. Per-seed AVR 0; per-seed repeatLineRate 0.

## Automated truth (this turn @ `dfc2b62`)
| Command | Result |
|---------|--------|
| `npm run test:bots` | **54/54** pass |
| `npx vite-node scripts/run-fabric-suite.mts` | status OK; aggregates above |
| `npm test` | **189/189** pass (includes Loom variety-audit read-only) |
| `npm run build` | **OK** (`tsc --noEmit` + vite build) |

## M3 deferral (explicit)
- `createPlaySession` exported but **inspect-only** (`mode:'inspect'` → dump/snapshot). No-arg → null.
- `connectBotSession` correctly null until BotSession-shaped play API exists.
- Hybrid-C playthrough matrix **not** required to clear M2; awaits playable world.

## Caps
`tests/bots/fabric/fabric-thresholds.json` **unchanged**. No harness retune.

## Delta vs prior report (`faa9ff2` / NO-SHIP)
| | `faa9ff2` | `dfc2b62` |
|-|-----------|-----------|
| stub-voice / AVR / repeat | 0 / 0 / 0 | 0 / 0 / 0 |
| unique / 96 | 96 | **94** (2 cross-seed exact) |
| history/gap/kin | scaffold | **seed-varying** |
| fingerprints | `wf-008231e5-8` family | new distinct family |
| within-world prefix/trail | mild echo | **0 shared** |
| cross-seed trail chorus | noted | still loud (polish) |
| Verdict | **NO-SHIP** (samey worlds) | **SHIP** |

## Follow-ups (non-blocking)
1. Forge: shrink cross-seed blend-tail deck (grief/notice/ink/hole/soft-room) so towns don't share endings.  
2. Tidy sign-off on structure, then Niblet marks M2 Done / kicks M3.  
3. Probe: M3 playthrough matrix when BotSession play API lands.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-fabric-suite.mts
npm test
npm run build
```
