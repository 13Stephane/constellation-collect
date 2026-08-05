#!/usr/bin/env python3
"""
anchor_sheet_v0_1.py

Constellation Track B, step B4 support.

Reads a schema-v2 model and reports, under constellation-valuation/SKILL.md section 2,
the historical value of every driver in the schema-v3 registry. These are the anchors
the bear/base/bull paths start from. It computes nothing forward and asserts nothing
about the future.

Also reports the base-year state the projection engine will pick up (OWC, PPE, other
operating assets, invested capital, derived net debt) so the handoff can be checked
by eye.

Stdlib only.

Usage
    python3 scenario/anchor_sheet_v0_1.py --model evals/case-01/expected.json
    python3 scenario/anchor_sheet_v0_1.py --model evals/case-01/expected.json \
        --json scenario/asml_anchors.json
"""

import argparse
import json
import sys

VERSION = "0.1"


def die(msg):
    sys.stderr.write("FAIL: " + msg + "\n")
    sys.exit(2)


def pct(x):
    return "      n/a" if x is None else "%8.2f%%" % (100.0 * x)


def num(x):
    return "      n/a" if x is None else "%9.1f" % x


def main():
    ap = argparse.ArgumentParser(description="Historical driver anchors from a schema-v2 model")
    ap.add_argument("--model", required=True)
    ap.add_argument("--json", help="also write the anchors as JSON to this path")
    args = ap.parse_args()

    try:
        m = json.load(open(args.model))
    except Exception as exc:
        die("cannot read %s: %s" % (args.model, exc))

    years = m["years"]
    i, b = m["income"], m["balance"]
    n = len(years)
    unit = m.get("unit", "")

    rows = []
    for t in range(n):
        rev = i["revenue"][t]
        cos = i["costOfSales"][t]
        dep = i["depreciation"][t]
        sga = i["sga"][t]

        gp = rev - cos
        ebitda = gp - sga
        ebit = ebitda - dep
        owc = ((b["operatingCash"][t] + b["otherCurrentAssets"][t])
               - (b["accountsPayable"][t] + b["otherNonInterestLiab"][t]))
        ic = owc + b["ppe"][t] + b["otherOperatingAssets"][t]

        capex_incl = (b["ppe"][t] - b["ppe"][t - 1]) + dep if t > 0 else None
        dep_ratio = dep / b["ppe"][t - 1] if t > 0 and b["ppe"][t - 1] else None

        pretax = ebit + i["interestIncome"][t] - i["interestExpense"][t]
        eff_tax = i["incomeTaxes"][t] / pretax if pretax else None

        prior_ic = rows[t - 1]["investedCapital"] if t > 0 else None
        noplat_stated = ebit * (1.0 - m["assumptions"]["taxRate"])
        roic = noplat_stated / prior_ic if prior_ic else None

        rows.append({
            "year": years[t], "revenue": rev,
            "gross_margin_pct": gp / rev if rev else None,
            "opex_pct_revenue": sga / rev if rev else None,
            "dep_pct_prior_ppe": dep_ratio,
            "capex_incl_pct_revenue": capex_incl / rev if (capex_incl is not None and rev) else None,
            "owc_pct_revenue": owc / rev if rev else None,
            "other_op_assets_pct_revenue": b["otherOperatingAssets"][t] / rev if rev else None,
            "effective_tax_rate_implied": eff_tax,
            "ebitMarginPct": ebit / rev if rev else None,
            "owc": owc, "ppe": b["ppe"][t],
            "otherOperatingAssets": b["otherOperatingAssets"][t],
            "investedCapital": ic, "roic": roic,
        })

    print("anchor_sheet v%s   model: %s   unit: %s" % (VERSION, m.get("company", "?"), unit))
    print("stated taxRate in assumptions: %.4f   stated wacc: %.4f"
          % (m["assumptions"]["taxRate"], m["assumptions"]["wacc"]))
    print("\nDriver anchors (historical, house conventions)")
    hdr = ("  year   gross_margin  opex/rev   dep/priorPPE  capexIncl/rev  "
           "owc/rev   otherOA/rev  effTax(impl)  ebit_margin   roic")
    print(hdr)
    for r in rows:
        print("  %-6s %s %s %s %s %s %s %s %s %s"
              % (r["year"], pct(r["gross_margin_pct"]), pct(r["opex_pct_revenue"]),
                 pct(r["dep_pct_prior_ppe"]), pct(r["capex_incl_pct_revenue"]),
                 pct(r["owc_pct_revenue"]), pct(r["other_op_assets_pct_revenue"]),
                 pct(r["effective_tax_rate_implied"]), pct(r["ebitMarginPct"]), pct(r["roic"])))

    last = rows[-1]
    net_debt = b["longTermDebt"][-1] - b["operatingCash"][-1]
    shares = (m.get("sharesOutstanding") or [None])[-1]
    print("\nBase-year state handed to the engine (%s)" % last["year"])
    print("  revenue               %s %s" % (num(last["revenue"]), unit))
    print("  owc                   %s" % num(last["owc"]))
    print("  ppe                   %s" % num(last["ppe"]))
    print("  otherOperatingAssets  %s" % num(last["otherOperatingAssets"]))
    print("  investedCapital       %s" % num(last["investedCapital"]))
    print("  netDebt (derived)     %s   longTermDebt %s less operatingCash %s"
          % (num(net_debt), num(b["longTermDebt"][-1]), num(b["operatingCash"][-1])))
    print("  sharesOutstanding     %s" % num(shares))

    print("\nNotes")
    print("  Revenue drivers (euv/highna/duv units and ASPs, ibm_revenue) have no historical")
    print("  anchor here: schema-v2 carries one revenue line and no unit split. Those six")
    print("  come from disclosure, not from this file. The unit tree must reconcile to the")
    print("  base-year revenue above before any case is trusted.")
    print("  E1 check: confirm costOfSales in this model is depreciation-free. If reported")
    print("  COGS was lifted as-is, gross_margin_pct above is understated and ebit_margin is")
    print("  understated twice over. This file cannot detect that on its own.")
    print("  X1 open: operatingCash sits inside owc above and is also netted in netDebt.")

    if args.json:
        out = {"anchorSheetVersion": VERSION, "model": args.model,
               "company": m.get("company"), "unit": unit, "rows": rows,
               "baseYear": {"year": last["year"], "owc": last["owc"], "ppe": last["ppe"],
                            "otherOperatingAssets": last["otherOperatingAssets"],
                            "investedCapital": last["investedCapital"],
                            "netDebtDerived": net_debt, "sharesOutstanding": shares}}
        json.dump(out, open(args.json, "w"), indent=2)
        print("\nWrote %s" % args.json)


if __name__ == "__main__":
    main()
