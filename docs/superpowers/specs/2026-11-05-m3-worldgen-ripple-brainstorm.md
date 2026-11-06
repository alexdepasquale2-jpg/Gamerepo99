# M3 World-Gen & Ripple Deepen — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Target spec:** `docs/superpowers/specs/2026-11-05-last-spark-m3-design.md`

## Context
M2 feel/writing locked. M3 must be buildable straight from spec: formulas, baker-cousin & shamed-pen-pal examples, LOD rates, history steps, discovery UI, tests. No archetype code branches.

## Options
**A — Prose-only deepen** — clearer English, no numbers. **−** Forge still guesses.  
**B — Formula appendix only** — math without UI/data checklist. **−** Incomplete.  
**C — Full build contract** *(recommended)*: exact formulas + worked examples with numeric chances + LOD table + history steps + letters UI contract + data file checklist + automated test cases + half-day implementation plan. Seed `kinship.json` / `letters.json` stubs so validation can catch missing edges.

## Decision
**C.** Ratify and harden `last-spark-m3-design.md`; add stub data; write `plans/2026-11-05-last-spark-m3.md`.

## Self-review
Must include both worked examples with arithmetic (0.4+0.25×0.7=0.575). LOD soft factor 0.85 explicit. Authored people never overwritten.
