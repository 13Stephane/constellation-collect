#!/usr/bin/env python3
"""
anchor_sheet_v0_2.py

Constellation Track B, step B4 support. Successor to v0.1.

Reads a schema-v2 model and reports the historical value of every driver in the
schema-v3 registry, under constellation-valuation/SKILL.md section 2 plus the v0.3
cash policy. Working capital and returns are shown on both bases side by side:

    policy basis   operating cash = revenue * --cash-policy, remainder is excess
    legacy basis   all cash inside OWC, i.e. the pre-v0.3 treatment

Fill the owc_pct_revenue driver from the POLICY column. The legacy column is shown
only so the size of the shift is visible.

It computes nothing forward and asserts nothing about the future. Stdlib only.

Usage
    python3 scenario/anchor_sheet_v0_2.py --model evals/case-01/expected.json
    python3 scenario/anchor_sheet_v0_2.py --model evals/case-01/expected.json \
        --cash-policy 0.0 --json scenario/asml_anchors_v0_2.json
"""

import argparse
import json
import sys

VERSION = "0.2"


def die(msg):
    sys.stderr.write("FAIL: " + msg + "\n")
    sys.exit(2)


def pct(x):
    return "     n/a" if x is None else "%7.2f%%" % (100.0 * x)


def num(x):
    return "      n/a" if x is None else "%9.1f" % x


def main():
    ap = argparse.ArgumentParser(description="Historical driver anchors, both cash bases")
    ap.add_argument("--model", required=True)
    ap.add_argument("--cash-policy", type=float, default=0.0,
                    help="operating cash as a fraction of revenue. Default 0.0, all cash excess")
    ap.add_argument("--json")
    args = ap.parse_args()

    try:
        m = json.load(open(args.model))
    except Exception as exc:
        die("cannot read %s: %s" % (args.model, exc))

    pol = args.cash_policy
    years, i, b = m["years"], m["income"], m["balance"]
    n, unit = len(years), m.get("unit", "")
    tax_stated = m["assumptions"]["taxRate"]

    rows = []
    for t in range(n):
        rev = i["revenue"][t]
        cos, dep, sga = i["costOfSales"][t], i["depreciation"][t], i["sga"][t]
        gp = rev - cos
        ebit = gp - sga - dep

        cash_total = b["operatingCash"][t]
        cash_op = rev * pol
        cash_excess = cash_total - cash_op
        non_cash_owc = (b["otherCurrentAssets"][t]
                        - (b["accountsPayable"][t] + b["otherNonInterestLiab"][t]))
        owc_pol = cash_op + non_cash_owc
        owc_leg = cash_total + non_cash_owc
        ppe, other = b["ppe"][t], b["otherOperatingAssets"][t]
        ic_pol = owc_pol + ppe + other
        ic_leg = owc_leg + ppe + other

        capex_incl = (ppe - b["ppe"][t - 1]) + dep if t > 0 else None
        dep_ratio = dep / b["ppe"][t - 1] if t > 0 and b["ppe"][t - 1] else None
        pretax = ebit + i["interestIncome"][t] - i["interestExpense"][t]
        noplat = ebit * (1.0 - tax_stated)

        rows.append({
            "year": years[t], "revenue": rev,
            "gross_margin_pct": gp / rev if rev else None,
            "opex_pct_revenue": sga / rev if rev else None,
            "dep_pct_prior_ppe": dep_ratio,
            "capex_incl_pct_revenue": capex_incl / rev if (capex_incl is not None and rev) else None,
            "owc_pct_revenue_policy": owc_pol / rev if rev else None,
            "owc_pct_revenue_legacy": owc_leg / rev if rev else None,
            "other_op_assets_pct_revenue": other / rev if rev else None,
            "effective_tax_rate_implied": i["incomeTaxes"][t] / pretax if pretax else None,
            "ebitMarginPct": ebit / rev if rev else None,
            "cashTotal": cash_total, "cashOperating": cash_op, "cashExcess": cash_excess,
            "owcPolicy": owc_pol, "owcLegacy": owc_leg, "ppe": ppe,
            "otherOperatingAssets": other,
            "investedCapitalPolicy": ic_pol, "investedCapitalLegacy": ic_leg,
            "noplat": noplat,
            "roicPolicy": noplat / rows[t - 1]["investedCapitalPolicy"] if t > 0 and rows[t - 1]["investedCapitalPolicy"] else None,
            "roicLegacy": noplat / rows[t - 1]["investedCapitalLegacy"] if t > 0 and rows[t - 1]["investedCapitalLegacy"] else None,
        })

    print("anchor_sheet v%s   model: %s   unit: %s" % (VERSION, m.get("company", "?"), unit))
    print("cash policy: operating cash = %.4f of revenue   stated taxRate %.4f   stated wacc %.4f"
          % (pol, tax_stated, m["assumptions"]["wacc"]))

    print("\nDriver anchors (fill owc_pct_revenue from the POLICY column)")
    print("  year   gross_mgn  opex/rev  dep/prPPE  capex/rev  owc/rev_POL  owc/rev_leg"
          "  otherOA/rev  effTax  ebit_mgn")
    for r in rows:
        print("  %-6s %s %s %s %s   %s %s   %s %s %s"
              % (r["year"], pct(r["gross_margin_pct"]), pct(r["opex_pct_revenue"]),
                 pct(r["dep_pct_prior_ppe"]), pct(r["capex_incl_pct_revenue"]),
                 pct(r["owc_pct_revenue_policy"]), pct(r["owc_pct_revenue_legacy"]),
                 pct(r["other_op_assets_pct_revenue"]),
                 pct(r["effective_tax_rate_implied"]), pct(r["ebitMarginPct"])))

    print("\nReturns, both bases (ROIC on prior-year invested capital)")
    print("  year        IC_policy      IC_legacy   ROIC_policy  ROIC_legacy      shift")
    for r in rows:
        shift = (None if r["roicPolicy"] is None or r["roicLegacy"] is None
                 else r["roicPolicy"] - r["roicLegacy"])
        print("  %-6s %s %s   %s %s %s"
              % (r["year"], num(r["investedCapitalPolicy"]), num(r["investedCapitalLegacy"]),
                 pct(r["roicPolicy"]), pct(r["roicLegacy"]), pct(shift)))

    last = rows[-1]
    net_debt_pol = b["longTermDebt"][-1] - last["cashExcess"]
    net_debt_leg = b["longTermDebt"][-1] - last["cashTotal"]
    shares = (m.get("sharesOutstanding") or [None])[-1]
    print("\nBase-year state handed to the engine (%s)" % last["year"])
    print("  revenue                %s %s" % (num(last["revenue"]), unit))
    print("  cash total             %s   operating %s   excess %s"
          % (num(last["cashTotal"]), num(last["cashOperating"]), num(last["cashExcess"])))
    print("  owc  policy %s   legacy %s" % (num(last["owcPolicy"]), num(last["owcLegacy"])))
    print("  ppe                    %s" % num(last["ppe"]))
    print("  otherOperatingAssets   %s" % num(last["otherOperatingAssets"]))
    print("  investedCapital  policy %s   legacy %s"
          % (num(last["investedCapitalPolicy"]), num(last["investedCapitalLegacy"])))
    print("  netDebt          policy %s   legacy %s   (identical at policy 0.0)"
          % (num(net_debt_pol), num(net_debt_leg)))
    print("  sharesOutstanding      %s" % num(shares))

    print("\nNotes")
    print("  Fill owc_pct_revenue from owc/rev_POL. Under a 0.0 policy, cash is excess and does")
    print("  not scale with revenue, so forward OWC excludes it. Filling from the legacy column")
    print("  would force the cash balance to grow with revenue as if it were working capital,")
    print("  which understates FOCF in year one and overstates the capital base throughout.")
    print("  The six revenue-tree drivers have no anchor here: schema-v2 carries one revenue")
    print("  line and no unit split. The tree must reconcile to base-year revenue above.")
    print("  E1: confirm costOfSales is depreciation-free. E3: operatingCash is total cash.")
    print("  O1: otherOperatingAssets is undecomposed. O2: anchor on the last three years.")

    if args.json:
        out = {"anchorSheetVersion": VERSION, "model": args.model,
               "company": m.get("company"), "unit": unit,
               "cashPolicyOperatingPctRevenue": pol, "rows": rows,
               "baseYear": {"year": last["year"], "owcPolicy": last["owcPolicy"],
                            "owcLegacy": last["owcLegacy"], "ppe": last["ppe"],
                            "otherOperatingAssets": last["otherOperatingAssets"],
                            "investedCapitalPolicy": last["investedCapitalPolicy"],
                            "investedCapitalLegacy": last["investedCapitalLegacy"],
                            "netDebtPolicy": net_debt_pol, "netDebtLegacy": net_debt_leg,
                            "sharesOutstanding": shares}}
        json.dump(out, open(args.json, "w"), indent=2)
        print("\nWrote %s" % args.json)


if __name__ == "__main__":
    main()
