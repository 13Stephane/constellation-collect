# Outcome — definition of done (per run)

The agent produces a Constellation **schema-v2** valuation dataset for the given European listed ticker, loadable unchanged into the 4-slice front-end. Every run is graded against these binary criteria.

1. **Valid schema-v2.** The output JSON has the exact keys — `years`; `income{revenue, costOfSales, depreciation, sga, interestIncome, interestExpense, incomeTaxes}`; `balance{operatingCash, otherCurrentAssets, ppe, otherOperatingAssets, accountsPayable, otherNonInterestLiab, longTermDebt, equity}`; `assumptions{taxRate, wacc}`; `sharesOutstanding`; `valuationMultiples`; `labels` — and the **balance sheet checks to zero every year** within rounding.

2. **Three-WACC discipline.** Only **W1** (Market WACC) is computed; the CAPM parameters (rf, ERP, beta, cost of debt, tax, weights) are each a **stated field with source URL + date**. No W2/W3 for a listed name; no blending.

3. **WACC is a band, not a number.** Reported as **point + band** (rf and ERP at the band edges); the point is written into `assumptions.wacc`; the ROIC−WACC spread is judged **against the band** (a spread inside the band is indistinguishable from zero).

4. **Provenance on every input.** Each schema-v2 figure carries a **source URL + as-of date** in `sources.json`; load-bearing numbers show a **cross-check** against a second source.

5. **Locked conventions reproduced.** NOPLAT = EBIT×(1−tax); ROIC on **prior-year** invested capital; capex-incl = ΔnetPPE + D&A; net debt = interest-bearing debt − operating cash; invested-capital **assets side = financing side**. The workbook's computed panels match these exactly.

6. **Deliverables complete + honesty block.** `<TICKER>_schema-v2.json` + snapshot `<TICKER>_valuation.xlsx` (values + provenance links + integrity block) + `sources.json`, with the honesty block stated on the workbook (CAPM-on-single-name-beta is a convention; claims are relative; web-sourced figures are weaker than filings). **No formula-recompute claim** — the workbook is a snapshot.
