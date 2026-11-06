# M2 Writing Pass — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** superpowers brainstorming  
**Pass:** Writing only (feel pass already locked). Stop after this pass.

---

## 1. Context

- 11 authored people in Ashford/Lowmere; 3 M2 archetypes (Marrow, Ivy, Brood).
- Draft `lines.json` exists with voice / woundLine / tellGivenUp / methods×5 / marks×5 — needs ratification, refusal-by-archetype lines, and `people.json` fields Forge can read without joining if desired.
- Tone: **savage but human** — no cartoon cruelty, no pep-talk fluff.
- Validator already checks method+mark coverage; must explicitly require **every person × every method** and add **archetype refusal lines**.

**Success:** Every handwritten person has vivid voice, wound, give-up tell; distinct reactions per method and mark; each archetype has refusal lines (at least shame-vs-child; brood gaze); data in `lines.json` + `people.json`; validator enforces method-line completeness; Loom row logged.

---

## 2. Options

### A — All copy only in `people.json`
Fat person records. **+** One file. **−** Huge diffs; hard to share templates; refusal/archetype lines don't belong on NPCs.

### B — All copy only in `lines.json` *(lean people)*
People stay mechanical; lines keyed by id. **+** Clean. **−** UI might expect tell on person; dual read.

### C — Split: canonical `lines.json` + mirrored voice/wound/tell on `people.json` *(recommended)*
`lines.json` owns methods, marks, archetype refusals. `people.json` duplicates `voice`, `woundLine`, `tellGivenUp` (and keeps firstLine/reigniteLine/backstory) for inspect UI without join. Validator checks both sides match or that people fields are non-empty and lines complete.  
**+** Forge ergonomics + single canonical reaction table. **−** Two places for voice — validator must keep them in sync.

---

## 3. Decision

**Choose C.**  

Refusal lines live under `lines.json.archetypeRefusals[archetypeId][refusalHookId]` (and optional `default`), not disabled-button copy. Shame-child required for all three archetypes; gaze-child required for brood.

Mark/method reactions stay per-person under `lines.json.people[id]`.

---

## 4. Self-review

- No cutscene scripts.  
- Jonah still has a shame *line* for completeness; runtime refusal uses archetype refusal text.  
- No TBD. Savage-but-human checklist: concrete nouns, cost, no mockery of kids.

---

## 5. Handoff

Implement data + validator; verify with `node scripts/validate-data.mjs`; Loom row; do **not** start backlog/M3 in this pass.
