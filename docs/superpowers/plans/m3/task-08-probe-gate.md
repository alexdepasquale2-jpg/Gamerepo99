> Part of [M3 First Playable World Implementation Plan](./index.md). Move-only split from `2026-11-05-m3-first-playable-world.md`.

# Task 8: Probe quality gate

**Files:**
- `tests/bots/*` (Probe); Forge ensures export
- Create: `docs/qa/reports/m3-worth-playing.md` (Probe writes)

**Interfaces:**
- Live `connectBotSession()` → matrix; thresholds in `tests/bots/thresholds.json`

- [ ] **Step 1: Failing check** — matrix not `API_PENDING`

```bash
npm run test:bots
# expect cells with real metrics, not API_PENDING
```

- [ ] **Step 2:** If API_PENDING → Task 1 incomplete; stop

- [ ] **Step 3:** Probe fills matrix + worth-playing verdict (SHIP / SHIP-WITH-FIXES / NO-SHIP)

- [ ] **Step 4:** Cite special-bar seeds + one Playwright/manual note

- [ ] **Step 5:** Probe handoff to Niblet (Forge does not fake SHIP)

**Depends on:** Tasks 1–7.  
**Acceptance:** Per `QUALITY_GATE.md`.

---

