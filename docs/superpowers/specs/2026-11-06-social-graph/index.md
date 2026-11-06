# Social Graph — Spine of Dynamism & Worldgen

**Date:** 2026-11-06  
**Status:** Loom design (pre-Forge implement)  
**Constraints:** Deterministic · offline · prebaked tables · **no runtime AI/LLM** · no `archetypeId` branches  
**Depends / feeds:** [interaction-model](../2026-11-06-interaction-model.md) · [fabric](../2026-11-05-m2-dynamic-fabric-design.md) · [M4 index](../../plans/m4/index.md) · [packet-01](../../plans/m4/packet-01.md) *(ship first)*  
**Skill:** brainstorming

## Why this is the spine

People and places change because of **who is tied to whom**. The web is not flavor on top of towns — **worldgen starts from the web**: kin, debts, loves, and hates decide where people live, what they work, how settlements cohere, and why doctrines spread. Interactions touch nodes; ripples walk edges; M4 economy/caravans/letters ride the same paths.

## Sibling docs

| File | Topic |
|------|--------|
| [01-model.md](./01-model.md) | Nodes, edge types, hop target, centrality (precomputed) |
| [02-propagation.md](./02-propagation.md) | Good/bad cascades, falloff, introductions, rumors |
| [03-worldgen.md](./03-worldgen.md) | Web-first generation: homes, jobs, settlements, doctrines |
| [04-integration.md](./04-integration.md) | Map fabric · interactions · M4 → web (what changes) |
| [05-forge-handoff.md](./05-forge-handoff.md) | Files, tests-first, acceptance, out of scope |
| [06-blessings-and-burdens.md](./06-blessings-and-burdens.md) | Alex core: unspoken → comes to pass as Blessing or Burden |
| [07-inspirations.md](./07-inspirations.md) | RimWorld / DF / Songs of Syx → web · unspoken · fabric |

## Non-negotiables

1. Average path length between people ≈ **4–6 hops** (authored + validate).  
2. Any ML (embeddings, learned centrality priors) is **trained offline** and baked into JSON; runtime is table lookup + deterministic walk.  
3. Packet-01 (dawn economy LOD) lands before graph runtime work.
4. **Blessings and Burdens** (06): meaningful acts leave unspoken weights; they come to pass later through people, never UI popups.
