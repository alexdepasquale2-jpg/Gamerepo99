# 05 — Forge handoff

**Prerequisite:** [M4 packet-01](../../plans/m4/packet-01.md) merged (dawn economy LOD).  
**Then:** social graph as packet-02 (suggested), TDD.

## Suggested files

| Action | Path |
|--------|------|
| Create | `src/sim/social/social-graph.ts` — load edges, shortestPath, walkCascade |
| Create | `src/sim/social/centrality.ts` — read-only table access |
| Create | `src/sim/social/worldgen-weave.ts` — edge weave hook called from worldgen (or pure fn Loom prebakes) |
| Create | `tests/sim/social/social-graph.test.ts` |
| Modify | `src/sim/interaction/interactions.ts` or play-session bridge — post-resolve cascade |
| Modify | `src/sim/load-data.ts` — edges + centrality + propagation tables |
| Modify | `scripts/validate/*` — hop-mean band, edge kind enum, centrality refs |

Prefer **prebaked edges per seed** in data when worldgen stays Loom-side; Forge still needs runtime walk + introduction edge add.

## Failing tests first

1. Mean hop distance on fixture web ∈ **[4, 6]**.  
2. Favor at A reaches friend-of-friend B with strength ≈ `falloff^2`, not equal to hop 1.  
3. `introduce` creates A↔B edge; path length A–B becomes 1.  
4. promise_break spawns rival and bad cascade hits kin without touching unrelated component.  
5. Centrality file marks ≥1 `influential`; rumor picker prefers them (deterministic tie-break).  
6. No import of ML runtime; tables only.

## Acceptance

- Deterministic cascades; hop band enforced in validate.  
- Good + bad both implemented with shared walker.  
- Fabric anchors denser than gap-poles on fixture.  
- Interactions listed in 04 fire graph effects.  
- Economy LOD despair caps respected when both tick.  
- Zero runtime AI.

## Out of scope

- Packet-01 re-implementation  
- Training pipelines in-repo (document bake command only)  
- Phaser visualization of edges (Prism event ids later)  
- Retuning Hybrid-C strain (see packet-01 appendix)  
- Full Task B/C/D features beyond hooks

## Loom follow-ups

Author propagation + edge-templates; bake centrality for default seeds; extend kinship kinds; keep files &lt; 400 lines.
