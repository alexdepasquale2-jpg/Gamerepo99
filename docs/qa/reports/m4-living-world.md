# M4 living world — verdict: GO

- **Decision:** GO by Alex, 2026-11-07. Code under test: `61ff35f`.
- **Gate:** `npm run validate && npm test && npm run build` green (383 tests).
- **Evidence:** `npx vite-node scripts/m4-living-world-evidence.mts` → `_m4-living-world-evidence.json`, all modules OK (LOD, caravans, doctrine, letters, Blessings and Burdens), `gaps: []`, seed-42 runs deterministic.
- **Caveat:** all shipped towns are `economyOptIn: false`; the LOD check opts in lowmere + city_reach (same as tests).
- **Open risk (unchanged):** basilisk_brood × savage burnout pocket — not a re-HOLD.
- **Not done:** `docs/SCHEDULE.xlsx` Probe row not updated (binary file).
