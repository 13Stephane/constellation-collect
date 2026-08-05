# Schema v3 specification, v0.2

*Constellation Track B step B1. Additive over schema-v2. Successor to v0.1.*
*Reconciled to `constellation-valuation/SKILL.md` section 2. 22 July 2026.*

## 1. Rule of the version

Schema v3 adds two top-level blocks, `drivers` and `scenarios`, and changes nothing else. Every schema-v2 key keeps its name, type, and meaning. Front-end slices 1 to 4 read a v3 file without modification. Slice 5 gates on `schemaVersion >= 3 && scenarios.computed != null`.

## 2. `drivers` (the registry)

Keyed by arena, shared with Track A2's arena registry. One registry per arena, not per name.

| Key | Type | Meaning |
|---|---|---|
| `arena` | string | Registry key. ASML: `semiconductor-capital-equipment` |
| `registryVersion` | string | Version of the registry, independent of `schemaVersion`. Now 0.2 |
| `horizonYears` | int | Length of every driver path. 5 for v1 |
| `revenueModel` | object | `type` is `components` (unit tree) or `growth`. `components` carries `terms[]` of kind `units_x_asp` or `direct` |
| `depreciationModel` | object | `kind` in {`pct_prior_ppe`, `pct_revenue`, `explicit`} plus the driver id it reads |
| `definitions[]` | array | One per driver: `id`, `appliesTo`, `unit`, `label`. 14 for the ASML arena |

Driver ids join the registry, the case paths, the sources, and the tornado. A driver defined but not pathed is a hard stop.

**ASML arena drivers (14).** Revenue: `euv_units`, `euv_asp`, `highna_units`, `highna_asp`, `duv_units`, `duv_asp`, `ibm_revenue`. Margin: `gross_margin_pct`, `opex_pct_revenue`, `tax_rate`. Capital: `dep_pct_prior_ppe`, `capex_incl_pct_revenue`, `owc_pct_revenue`, `other_op_assets_pct_revenue`.

## 3. `scenarios`

| Key | Type | Meaning |
|---|---|---|
| `method` | string | `explicit-forecast-dcf`. Supersedes the single-year Gordon in slice 4 |
| `discount` | object | `waccLow/Mid/High` from the W1 band, `terminalGrowth`, `terminalMethod`, `fadeYears`, `midYearDiscounting`, `waccByCase`, `source` |
| `netDebt` | object | **Optional override.** Left null, the engine derives `longTermDebt - operatingCash` |
| `cases` | object | Exactly `bear`, `base`, `bull`. Each carries `narrative`, `paths`, `sources` |
| `triggers[]` | array | `id`, `observable`, `threshold`, `direction`, `flipsTo`, `playbook`, `resolutions[]` |
| `computed` | object | Engine output. Never hand-edited |

## 4. Arithmetic, transcribed from SKILL.md section 2

```
grossProfit     = revenue - costOfSales
ebitda          = grossProfit - sga
ebit            = ebitda - depreciation
noplat          = ebit * (1 - taxRate)
owc             = (operatingCash + otherCurrentAssets) - (accountsPayable + otherNonInterestLiab)
investedCapital = owc + ppe + otherOperatingAssets
capexIncl       = delta(net ppe) + depreciation
ppe[t]          = ppe[t-1] + capexIncl[t] - depreciation[t]
focf            = noplat + depreciation - deltaOWC - capexIncl - deltaOtherOperatingAssets
                = noplat - delta(investedCapital)
roic            = noplat / prior-year investedCapital
eva             = (roic - wacc) * prior-year investedCapital
netDebt         = longTermDebt - operatingCash
ev              = sum(PV of explicit FOCF) + PV of terminal value
equity          = ev - netDebt
```

The FOCF identity is asserted in the smoke test and holds to floating-point tolerance.

## 5. Resolved against SKILL.md section 2

- **C1 gross margin.** House GP is `revenue - costOfSales` with depreciation on its own line. The engine already matched. Closed.
- **C2 opex.** `sga` is the only line between GP and EBITDA, so R&D sits inside `sga`. Closed.
- **C3 OWC.** Engine formula matches the house OWC exactly. Closed.
- **C4 net debt.** `longTermDebt - operatingCash`. Now derived, not required as input. Closed.

## 6. Open, carried into every computed output

- **X1 `operatingCash` is used twice in opposite senses.** SKILL section 2 places it inside OWC and therefore inside invested capital (operating cash), and also nets it against `longTermDebt` in the valuation bridge (excess cash). Both formulas are implemented as written, so ROIC and EV are not mutually consistent while this holds. Three ways out: drop `operatingCash` from OWC; or set net debt to `longTermDebt` alone; or split the line into operating and excess. This affects ROIC, EVA, and every per-share number.
- **X2 departure recorded, deliberate.** Slice 4 capitalises NOPLAT: `NOPLAT * (1+g) / (WACC-g)`. Track B capitalises FOCF after five explicit years. The two will not agree and must not be compared naively. This is the B3 upgrade.
- **E1 extraction rule.** House `costOfSales` must be depreciation-free. Most reported cost of sales carries production depreciation. If the /collect agent lifts reported COGS as-is and also puts total depreciation on the depreciation line, depreciation is double-counted and EBIT is understated. Needs an eval assertion in `evals/`.
- **E2 scope of the projected block.** Only `revenue`, `costOfSales`, `depreciation`, `sga` are driven. `interestIncome`, `interestExpense`, `incomeTaxes` are not, so slices 1 to 3 must not be pointed at projected years and slice 5 reads `scenarios.computed` only.
- **C5 WACC across cases.** Not addressed by SKILL. Default holds the mid band constant across all three cases and swings WACC only in the tornado, to avoid double-counting risk in both the cash flows and the rate.
- **C6 discounting timing.** Not addressed by SKILL. End-year by default.

X1 is the one that changes published numbers. It should clear before ASML values are filled.

## 7. Fill discipline

The engine validates the schema-v2 balance identity on every historical year, then refuses to compute while any required field is null, reporting each gap by dotted path. Null `source` fields block by default; `--allow-missing-sources` downgrades them to warnings for prototype runs. Null trigger fields report as unarmed and never block. The unfilled ASML stub reports 89 gaps.

## 8. Not in v0.2

- Slice 5 React component (B6). Needs this spec ratified and the four live slice files in hand.
- Memory store for trigger resolutions. `resolutions[]` is the forward hook.
- Arenas beyond semicap. Financials and REITs stay out of scope with a stated guard, per Track A2.
