# Overworld Asset Manifest Implementation Plan

> Inline Prism executor.

**Goal:** OVERWORLD_ASSET_MAP.md + typed asset-manifest + JSON mirror; heading helpers; gap list; CREDITS/schedule; build green; optional reduced-motion in feel.ts.

**Architecture:** Read data JSON ids → document map → `src/render/asset-manifest.ts` + `assets/manifest/overworld-assets.json` → vitest for key coverage & heading.

**Tech:** TypeScript, Vitest, CC0 shortlist

## Tasks
1. Write OVERWORLD_ASSET_MAP.md
2. Implement asset-manifest.ts + JSON
3. Vitest coverage of data ids + heading
4. Optional FEEL.reducedMotion
5. CREDITS + schedule; build/test; commit Prism-only
