# Last Spark — M3 Design (LOCKED schedule: Sat Nov 7 AM · ~½ day)

**Depends on:** M2 closed loop (`docs/superpowers/plans/2026-11-05-last-spark-m2.md`)  
**Status:** Spec for compressed schedule — ruthless scope

## Goal

Make distance and multiplicity feel real without rewriting the sim: Brood can act with **two** active bodies; far towns tick in **LOD**; players discover letters/rumors in a small UI; **one** extra settlement ships from data.

## In scope (only)

1. **Simultaneous multi-body (Brood data bump)**  
   - Raise `body_basilisk_brood.activeBodiesMax` from `1` → `2` in `traits.json` (no code branches on archetype id).  
   - Generic embodiment: dispatch commands to `activeBodyIds[]`; shared spark already.  
   - Strain hook already exists (`cost_brood_strain`) when bodies span towns — tune numbers only.

2. **LOD for distant towns**  
   - Towns not entered this day run `lodTick(town)` once at dawn: relapse rolls collapsed, no pathfinding, vitality ± from packets only.  
   - Data: `towns.json` add `lod: { relapseSamples: 1, skipMovement: true }` defaults.  
   - Entering a town promotes it to full sim for that day.

3. **Letters / rumor discovery UI**  
   - Surface inbound `packets` as a readable list (sender town, proof/pressure, arrival day).  
   - Not a full epistolary system — inbox modal in `src/ui/letters-ui.ts` reading sim packets.  
   - Optional one authored letter template in `src/data/letters.json` (3–5 templates max).

4. **One more settlement**  
   - `hollow_ford` hamlet: 3 people max, 1 link to Ashford, handwritten short backstories.  
   - Unlock: Ashford vitality ≥ 50 **or** packet from Lowmere.

## Out of scope

Full procgen regions, >2 active bodies, combat, audio, save cloud, M4 succession depth.

## Data additions

| File | Change |
|------|--------|
| `traits.json` | `activeBodiesMax: 2` on brood body |
| `towns.json` | `hollow_ford` + LOD fields on all towns |
| `people.json` | ≤3 Hollow Ford people |
| `links.json` | ashford↔hollow_ford |
| `letters.json` | **new** — templates keyed by packetType |
| `hooks.json` | optional `recovery_read_letter` (+1 spark once/day) |

## Acceptance (Sat AM)

- Brood can move 2 bodies same day; spark shared; strain applies.  
- Distant town vitality changes without entering.  
- Packet inbox shows ≥1 delivered rumor/proof.  
- Hollow Ford reachable; `npm test && npm run validate` green.  
- Still **zero** `archetypeId ===` branches in sim.

## Half-day task sketch (for later plan)

1. Embodiment multi-active + tests  
2. LOD dawn pass + tests  
3. letters.json + UI  
4. Hollow Ford content + link  
5. Balance pass + commit

