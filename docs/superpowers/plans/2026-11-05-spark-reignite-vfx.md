# Spark / Reignite VFX Prototype Plan

> Inline Prism executor.

**Goal:** Presentation-only spark/reignite VFX (particles, bloom, color wash, hit-stop, shake, cost-to-self) driven by bus events + warmth; FEEL tunables; UI_JUICE_SPEC; frame capture; build green.

**Architecture:** Expand `feel.ts` + `spark-fx.ts`; optional player feedback hook; demo player marker in WanderScene; Pillow PNG sequence for docs.

**Tech:** Phaser 3, Vitest, Pillow

## Tasks
1. Expand FEEL config (wash, costSelf, reignite hitStop)
2. Enhance spark-fx (wash, cost-to-self, bloom)
3. WanderScene player marker + spark bar HUD demo
4. Vitest for FEEL shape
5. UI_JUICE_SPEC.md
6. Capture frame sequence PNGs
7. Build/test, CREDITS, schedule, commit Prism files only
