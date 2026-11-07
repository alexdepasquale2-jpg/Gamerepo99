# M7 balance run summary

Run: `npm run balance` (4 playstyles x 3 archetypes x 5 seeds x 60 dawns). Measurement only; no src or tuning changes.
Note: "harsh" is the savage-family bot. "hoarder" ends partly in `ash_hoard` (3 of 5 seeds per archetype).

## Stuck (burnout rate >= 0.8)
- harsh x marrow: burnout 1.0, median 36 dawns
- harsh x basilisk_brood: burnout 1.0, median 27 dawns

## Trivially winning (burnout 0, spark never below 60, non-neglect)
- kind x marrow, kind x ivy_quill, kind x basilisk_brood
- harsh x ivy_quill (survives 60 dawns, mean despair 0.81, highest of all cells)
- hoarder x marrow, ivy_quill, basilisk_brood (3/5 end `ash_hoard`, 2/5 survive)
- neglect survives all 60 dawns in every archetype (0 reignited, 0 hollow)

## Non-determinism
- None. Two consecutive runs gave identical matrix JSON apart from `generatedAt`.
- Swallowed act errors across all cells: 0.

## basilisk_brood x savage (harsh) pocket
- Still reproduced: burnout 1.0 over 5 seeds, median 27 dawns, mean despair 0.41.
- Lowest spark floors in the matrix: 18.33 (harsh x marrow) and 24.45 (harsh x basilisk_brood).
- The pocket is no longer unique to basilisk_brood: marrow burns out the same way, only ivy_quill survives savage play.

## Drift vs the committed report
- Results differ from the committed `m7-balance.md` / `_m7-balance-matrix.json`, so more than `generatedAt` changed.
- Harsh median dawns went from 6 to 36 (marrow) and 6 to 27 (basilisk_brood).
- Mean reignited rose from about 11 to about 21-61, and mean despair from 0.1 to about 0.4-0.8.
- The committed report predates the current sim, so it looks stale.
- I reverted the regenerated JSON and md so the commit holds only this summary.
- Rerun `npm run balance` and commit the output if the new baseline should replace the old.
