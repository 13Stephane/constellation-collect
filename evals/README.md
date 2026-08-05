# Evals

The Outcome rubric (`../outcome.md`) is the per-run grader. These cases are the regression check across agent versions.

## case-01 — ASML (golden)

`expected.json` is the hand-verified ASML `SAMPLE` embedded in the Constellation front-end slices. Grade the agent's `ASML_schema-v2.json` against it as follows:

- **Extraction targets (must match within tolerance ~±1%, rounding aside):** `income.*`, `balance.*`, `sharesOutstanding`, `assumptions.taxRate`. These are the founder's verified numbers.
- **Balance check:** for every year, `operatingCash + otherCurrentAssets + ppe + otherOperatingAssets` must equal `accountsPayable + otherNonInterestLiab + longTermDebt + equity`.
- **Judgment layer (NOT graded on equality — graded on defensibility + provenance):** `assumptions.wacc` (expected file holds the `0.1` placeholder; the agent must construct a real W1 CAPM point + band) and `valuationMultiples` (expected holds the `tech-saas` placeholder; the agent must set ASML semiconductor-equipment arena bands with sources).

## Held-back regression set

Add further European names (`AIR.PA`, `SAP`, …) as `case-02+` once each has a verified expected. Re-run `run-evals.sh` against any new agent version before promoting it.
