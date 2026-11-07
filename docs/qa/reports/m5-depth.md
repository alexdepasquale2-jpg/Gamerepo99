# M5 depth evidence

- Status: **FAIL** (seed 7, 30 dawns, deterministic; regenerate with `npm run evidence:m5`)
- Verdict is Alex's: see `docs/qa/M5_GATE.md` (Go/Hold unchecked).

## A hoarder / notoriety

| Check | Result | Detail |
|---|---|---|
| 30-dawn hoarder run (0 reignites) ends with ash_hoard | pass | ending=ash_hoard peakCoin=60 reignites=0 |
| run is not a loss | pass | ended=null lost=false |
| Let it rest is a warm ending | pass | ok=true ended=rest |
| notoriety raises encounter weights and rolls | pass | low={"bonus":{"att_thief":0},"rolls":0} high={"bonus":{"att_thief":43.2},"rolls":22} |
| neglect raises despair, never fails | FAIL | totalTownDespair 0.5->0.5 |
| deterministic double-run | pass | same seed twice |

## B patrons

| Check | Result | Detail |
|---|---|---|
| patron deal opens at notoriety 0.5 | pass | open=deal_mill_tithe_coin,deal_mill_deny_reignite |
| deal accepted via interaction | pass | deals={"deal_mill_deny_reignite":{"dealId":"deal_mill_deny_reignite","patronId":"patron_mill_trust","acceptedDay":1,"dueDay":6,"status":"betrayed","reigniteAtAccept":0,"exposureAtAccept":0}} |
| notoriety shifts | pass | delta=0.2782 |
| doctrine meters shift | pass | {"propaganda":0.08,"perceived":-0.06,"real":0,"exposure":0,"legitimacy":-0.0395} |
| same seed twice -> equal | pass | deep-equal |

## C legacy

| Check | Result | Detail |
|---|---|---|
| burnout -> Carry it on yields an heir | pass | heir=clara_whitby heirSpark=100 |
| exportWorld -> importWorld on fresh state | pass | v1 hash=a7364cdc |
| grave + legend present after import | pass | graves=1 npcs=1 legends=2 |
| same seed -> identical file | pass | hash=a7364cdc |

## Gaps

- A hoarder / notoriety: neglect raises despair, never fails [totalTownDespair 0.5->0.5]
