# TRACE Pilot Quality Thresholds

These are release gates, not achieved measurements until the curated evaluation suite is populated and run.

| Metric | Pilot threshold | Gate behavior |
|---|---:|---|
| Fabricated file/symbol references | 0 | Block semantic publication |
| Unsupported high-severity semantic claims | <= 1% | Disable semantic findings |
| Default published findings per PR | <= 5 | Enforce publication cap |
| Deterministic detector precision | >= 90% on labeled fixtures | Keep deterministic check; review failures |
| Compatible-change conflict false positives | <= 10% | Disable semantic conflict publication |
| Report evidence coverage | >= 95% of factual bullets | Block report delivery |
| Stale analysis shown as current | 0 | Block dashboard publication |
| Individual-performance output | 0 | Block release |

Live-provider evaluation requires explicit credentials, budget, and a reviewable fixture set. Ordinary CI uses fake providers only.
