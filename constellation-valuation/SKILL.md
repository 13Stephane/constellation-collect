---
name: constellation-valuation
description: Constellation house method for turning a single listed company's public financials into a provenance-stamped schema-v2 dataset that drives the 4-slice front-end model, plus the W1 Market WACC construction (CAPM, band-not-number), the locked accounting conventions (NOPLAT, ROIC on prior-year invested capital, capex-incl, net-debt, invested-capital balance), and the honesty rules. Use whenever collecting data for or valuing a listed company for Constellation.
---

# Constellation valuation — house method

You collect a listed company's public financials, map them to the **schema-v2** contract, enforce the balance identity, construct the **W1 Market WACC** as a band, and emit a snapshot workbook. The front-end computes everything downstream from schema-v2 — so the JSON must be exactly right and must balance.

## 1 · The schema-v2 contract (exact keys)

Emit `<TICKER>_schema-v2.json` with these keys and array lengths equal to `years.length`:

```json
{
  "schemaVersion": 2,
  "company": "<legal name>",
  "unit": "EUR millions",
  "years": [ ... 5 ascending fiscal years ... ],
  "income": {
    "revenue": [], "costOfSales": [], "depreciation": [], "sga": [],
    "interestIncome": [], "interestExpense": [], "incomeTaxes": []
  },
  "balance": {
    "operatingCash": [], "otherCurrentAssets": [], "ppe": [], "otherOperatingAssets": [],
    "accountsPayable": [], "otherNonInterestLiab": [], "longTermDebt": [], "equity": []
  },
  "assumptions": { "taxRate": 0.0, "wacc": 0.0 },
  "sharesOutstanding": [],
  "valuationMultiples": { "industry": "", "evRevenue": [lo, hi], "evEbitda": [lo, hi], "evEbit": [lo, hi], "pe": [lo, hi], "growth": [lo, hi] },
  "labels": { "costOfSales": "", "depreciation": "", "sga": "" }
}
```

### Field mapping (reported statement → schema-v2 key)

| schema-v2 key | What goes in it |
|---|---|
| `income.revenue` | Net sales / total revenue |
| `income.costOfSales` | Production / cost of sales, **excluding** the D&A sitting in it (move D&A to `depreciation`) |
| `income.depreciation` | Total D&A for the year (from the cash-flow statement) |
| `income.sga` | R&D + selling + G&A + other operating expense, **ex-D&A** |
| `income.interestIncome` / `interestExpense` | Finance income / finance cost |
| `income.incomeTaxes` | Income tax expense |
| `balance.operatingCash` | Cash & equivalents (operating) |
| `balance.otherCurrentAssets` | All other current assets (receivables, inventory, contract assets, …) |
| `balance.ppe` | Net PP&E (+ right-of-use if lease-inclusive) |
| `balance.otherOperatingAssets` | Non-current operating assets: goodwill, intangibles, R&D-related, other |
| `balance.accountsPayable` | Payables + accrued, **non-interest**, current |
| `balance.otherNonInterestLiab` | All other non-interest liabilities (current + non-current: deferred revenue, provisions, deferred tax, …) |
| `balance.longTermDebt` | **All interest-bearing debt** (short + long, lease-inclusive) |
| `balance.equity` | Total shareholders' equity |
| `sharesOutstanding` | Weighted or period-end shares, millions |
| `assumptions.taxRate` | Effective or statutory rate used for NOPLAT (state which) |

`labels` overrides the display names for `costOfSales` / `depreciation` / `sga` when the firm's own wording differs (e.g. ASML: "Production costs (ex. D&A)", "R&D, sales, admin., other op. expenses (ex. D&A)").

### The balance identity — non-negotiable

For **every** year, the two sides must be equal within rounding:

```
operatingCash + otherCurrentAssets + ppe + otherOperatingAssets
  ==  accountsPayable + otherNonInterestLiab + longTermDebt + equity
```

This is how the front-end's "balance check" reads zero. If it doesn't balance, your mapping is wrong (usually a misclassified liability or a missing asset bucket) — fix it before emitting. Do not force it with a plug.

## 2 · Locked accounting conventions (must match the front-end exactly)

The slices compute these; your workbook and any derived figures must reproduce them:

- **Gross profit** = revenue − costOfSales · **EBITDA** = GP − sga · **EBIT** = EBITDA − depreciation
- **NOPLAT** = EBIT × (1 − taxRate)
- **Invested capital (assets side)** = operating working capital + ppe + otherOperatingAssets, where **OWC** = (operatingCash + otherCurrentAssets) − (accountsPayable + otherNonInterestLiab). **Financing side** = equity + longTermDebt. The two must match (that's the balance identity restated).
- **ROIC** = NOPLAT / **prior-year** invested capital (year 1 is blank — no prior base).
- **Capex (incl. dep)** = Δ(net ppe) + depreciation · **FOCF** = NOPLAT + depreciation − ΔOWC − capex-incl − Δ(otherOperatingAssets).
- **EVA** = (ROIC − WACC) × prior-year invested capital.
- **DuPont:** ROIC = EBIT-margin × capital-turnover × (1 − tax), on prior-year IC.
- **Health:** interest coverage = EBIT / interestExpense · debt/EBITDA = longTermDebt / EBITDA · cost of debt = interestExpense / longTermDebt · debt/equity = longTermDebt / equity.
- **Valuation bridge:** **net debt** = longTermDebt − operatingCash. Equity-basis methods bridge to EV as EV = equity value + net debt. DCF headline (Gordon) = NOPLAT × (1 + g) / (WACC − g).

## 3 · W1 Market WACC (the value-add over the placeholder)

The front-end takes `assumptions.wacc` as a single input (the sample ships `0.1` as a placeholder). Your job is to **construct it properly** and replace the placeholder. Listed name ⇒ **W1 only** — never compute or blend W2 (imputed) or W3 (regulated).

CAPM, Koller construction, every parameter a stated field with **source + date**:

- **Risk-free rate:** 10y sovereign in the reporting currency (Bund for EUR names), spot at cutoff.
- **Equity risk premium:** one stated convention, band **4.5–5.5%**, point declared.
- **Beta:** single-name stated beta (5y monthly vs a broad local index), with source + date. *(Full peer unlever/relever arena beta is a later version — not v0.)*
- **Cost of equity** = rf + beta × ERP.
- **Cost of debt:** effective rate from filings (interestExpense / average gross debt, lease-inclusive), cross-checked to a traded yield where one exists; after-tax at the statutory rate.
- **Weights:** market value of equity; lease-inclusive net debt.

**Output WACC as a POINT and a BAND** (rf and ERP at the band edges). Write the point into `assumptions.wacc`; carry the band + all parameters in `sources.json` and the workbook. **Rule: WACC is a band, not a number.** The ROIC−WACC spread is always judged against the band — a spread inside the band is reported as *indistinguishable from zero*.

Set `valuationMultiples` for the company's real arena (peer EV/Revenue, EV/EBITDA, EV/EBIT, P/E ranges + terminal growth) with sources — not the shipped `tech-saas` placeholder.

## 4 · Provenance & honesty (non-negotiable)

- Every schema-v2 figure has an entry in `sources.json`: `{value, source_url, as_of_date, cross_checked}`. No number without a source and a date.
- Cross-check load-bearing numbers (revenue, debt, equity, shares, the WACC inputs) against a second source; record the check.
- Web-sourced figures are weaker than filing-page extraction — say so. This is the v0 provenance caveat; the data-API/filings route is the documented next step.
- Put an honesty block on the workbook: CAPM-on-single-name-beta is a convention, not a truth; the read's claims are **relative** (a shared ERP-level error cancels across comparisons); ROIC uses prior-year invested capital; net debt = interest-bearing debt − operating cash.

## 5 · Deliverables

1. `<TICKER>_schema-v2.json` — valid schema-v2, balances to zero, loads into the front-end unchanged.
2. `<TICKER>_valuation.xlsx` — **snapshot** workbook (use the `xlsx` skill): statements · performance (ROIC/EVA/DuPont) · health · valuation football-field, computed with §2 conventions, plus a provenance sheet and an integrity block (row-level sources, cutoff date). Snapshot grade — **not** a formula-emitting recompute workbook.
3. `sources.json` — provenance per figure + the full WACC parameter set.

Write all three to `/mnt/session/outputs/`.
