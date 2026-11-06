# Design Backlog Establishment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a prioritized `docs/BACKLOG.md` Forge can execute without waiting on Loom.

**Architecture:** Single markdown table (decision C from `specs/2026-11-05-design-backlog-design.md`). Items point at locked plans/specs. Loom sheet gets a log row; backlog file is source of pull order.

**Tech Stack:** Markdown in-repo; Loom `SCHEDULE.xlsx` for status log only.

## Global Constraints

- Columns required: Pri, Item, Milestone, Size, Status, Notes.
- Status ∈ {todo, ready, in_progress, done, blocked}; Size ∈ {S, M, L}.
- No per-archetype code items; feel/writing/M3 references must match existing specs.
- Validator must still pass after doc-only changes.

---

### Task 1: Write BACKLOG.md from decision C

**Files:**
- Create/overwrite: `docs/BACKLOG.md`
- Reference: `docs/superpowers/specs/2026-11-05-design-backlog-design.md`
- Reference: `docs/superpowers/plans/2026-11-05-last-spark-m2.md`

**Interfaces:**
- Consumes: milestone map in DESIGN §10; M2/M3/M4/M5 specs
- Produces: prioritized table Pri 1…N

- [ ] **Step 1: Write the failing check**

```bash
# tests/docs/backlog-format.test.sh (or node assert in validate later)
test -f docs/BACKLOG.md || exit 1
rg -q '^\| 1 \|' docs/BACKLOG.md
rg -q 'Milestone' docs/BACKLOG.md
rg -q '\| M2 \|' docs/BACKLOG.md
```

- [ ] **Step 2: Run check to verify it fails** (if file empty/missing)

Run: `test -f docs/BACKLOG.md && rg -q '^\| Pri \|' docs/BACKLOG.md`
Expected: may fail before write

- [ ] **Step 3: Write BACKLOG.md**

Populate rows for M2 (plan tasks 1–10 / feel / lines / juice), M3 (kinship, LOD, letters, Hollow Ford, tests), M4, M5, post — each with milestone, size, status.

- [ ] **Step 4: Re-run check**

Run: `rg -n '^\| [0-9]+ \|' docs/BACKLOG.md | wc -l`
Expected: ≥15 item rows

- [ ] **Step 5: Commit**

```bash
git add docs/BACKLOG.md docs/superpowers/specs/2026-11-05-design-backlog-design.md docs/superpowers/plans/2026-11-05-design-backlog.md
git commit -m "docs: prioritized design backlog for Forge"
```

