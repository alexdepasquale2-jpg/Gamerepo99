# Probe quality gate (M2+)

**Authority:** Alex via Niblet — quality outranks deadlines. Probe is the quality gate.  
**Rule:** Green unit/build tests are **necessary, not sufficient**. M2 does **not** pass without (1) bot matrix evidence and (2) a written playtest verdict.

## M2 ship gate (all required)

1. **Automated truth**
   - `npm test` and `npm run build` pass on the candidate SHA.
   - Playwright M1/M2 UI smoke pass (no console errors; scene boots).
   - Live bot matrix (`npm run test:bots` + matrix runner) is **not** `API_PENDING`.
2. **Bot matrix bar** (harsh defaults in `tests/bots/thresholds.json`)
   - Stuck rate and boredom rate must not dominate the matrix (style×archetype cells).
   - Method dominance must stay under cap unless DESIGN explicitly wants a signature opener (call it out; do not wave it through).
   - Burnout rate: some burnout is expected; near-100% or near-0% across styles is a fail until justified.
   - Hollow vs reignited: savage clears that only hollow, or kind clears that never cost spark, fail the feel bar.
3. **Written verdict** — file `docs/qa/reports/m2-worth-playing.md` on the candidate SHA:
   - One-line call: **SHIP** / **NO-SHIP** / **SHIP-WITH-FIXES** (fixes listed, blocking vs non-blocking).
   - Answer literally: *Is this worth playing, and why or why not?*
   - Cite matrix cells and at least one manual/Playwright observation.
   - Be honest and harsh. “Technically works” ≠ worth playing.

## Verdict voice
- No cushioning. If Ashford loop is dry, say dry.
- Praise only what a cold player would feel in the first 10 minutes.
- If data/systems are clever but the loop is dull, **NO-SHIP**.

## Process
1. Forge pings when `createPlaySession` lands → Probe runs matrix same turn.
2. Probe writes / updates the worth-playing report.
3. Probe sends Niblet: pass/fail + report path + skills used.
4. Only Niblet (or Alex) can override a Probe **NO-SHIP**; overrides must be written.

## Skills
using-superpowers, verification-before-completion, systematic-debugging, test-driven-development, brainstorming (for new feel metrics), run-smoke-tests / control-ui as needed.
