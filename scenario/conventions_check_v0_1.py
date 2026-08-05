#!/usr/bin/env python3
"""
conventions_check_v0_1.py

Constellation, Track A eval support. Validates any schema-v2 model against the
house conventions in constellation-valuation/SKILL.md section 2, BEFORE the model
is trusted as an input to Track B.

The balance identity alone does not catch extraction errors. It passes on a model
where reported cost of sales was lifted as-is with production depreciation left
inside it, because assets still equal financing. That model then understates EBIT,
NOPLAT, ROIC and every discounted value built on it. This file catches it.

Checks
  B  balance identity per year, the same test the engine runs
  E1 house operating income (revenue - costOfSales - sga - depreciation) against the
     reported income from operations supplied per year. This is the depreciation
     double-count test. It requires an external figure: the model cannot self-check.
  E3 operatingCash plausibility. Flags when the line looks like a total cash balance
     rather than an operating subset.
  M  monotonic sanity: negative revenue, negative PPE, zero shares.

Stdlib only.

Usage
    python3 scenario/conventions_check_v0_1.py --model evals/case-01/expected.json \
        --reported-ebit 4051,6750,6501,9042,9022

    Supply one reported income-from-operations figure per year in model.years order,
    from the company's own statements. Omit --reported-ebit to skip E1, but then
    the model is NOT validated for the double-count.
"""

import argparse
import json
import sys

VERSION = "0.1"


def die(msg):
    sys.stderr.write("FAIL: " + msg + "\n")
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description="House-convention validator for schema-v2")
    ap.add_argument("--model", required=True)
    ap.add_argument("--reported-ebit", help="comma-separated, one per year, in model.years order")
    ap.add_argument("--ebit-tolerance", type=float, default=0.005,
                    help="fraction of reported EBIT, default 0.005")
    ap.add_argument("--cash-flag-pct", type=float, default=0.10,
                    help="flag operatingCash above this fraction of revenue, default 0.10")
    args = ap.parse_args()

    try:
        m = json.load(open(args.model))
    except Exception as exc:
        die("cannot read %s: %s" % (args.model, exc))

    years, i, b = m["years"], m["income"], m["balance"]
    n, unit = len(years), m.get("unit", "")
    fails, warns = [], []

    print("conventions_check v%s   model: %s   unit: %s" % (VERSION, m.get("company", "?"), unit))

    # --- B: balance identity -------------------------------------------------
    print("\n[B] balance identity")
    for t, y in enumerate(years):
        a = (b["operatingCash"][t] + b["otherCurrentAssets"][t]
             + b["ppe"][t] + b["otherOperatingAssets"][t])
        f = (b["accountsPayable"][t] + b["otherNonInterestLiab"][t]
             + b["longTermDebt"][t] + b["equity"][t])
        ok = abs(a - f) <= 1e-6 * max(1.0, abs(a))
        print("  %-6s assets %12.1f  financing %12.1f  diff %+10.4f  %s"
              % (y, a, f, a - f, "ok" if ok else "FAIL"))
        if not ok:
            fails.append("balance identity fails in %s" % y)

    # --- E1: depreciation double-count --------------------------------------
    print("\n[E1] house operating income vs reported")
    if not args.reported_ebit:
        warns.append("E1 SKIPPED: no --reported-ebit supplied. The model is NOT validated "
                     "for the depreciation double-count.")
        print("  skipped, no reported figures supplied")
    else:
        rep = [float(x) for x in args.reported_ebit.split(",")]
        if len(rep) != n:
            die("--reported-ebit has %d values, model has %d years" % (len(rep), n))
        for t, y in enumerate(years):
            house = (i["revenue"][t] - i["costOfSales"][t] - i["sga"][t] - i["depreciation"][t])
            gap = house - rep[t]
            ok = abs(gap) <= args.ebit_tolerance * max(1.0, abs(rep[t]))
            print("  %-6s house %11.1f  reported %11.1f  gap %+9.1f (%+.2f%%)  %s"
                  % (y, house, rep[t], gap, 100.0 * gap / rep[t] if rep[t] else 0.0,
                     "ok" if ok else "FAIL"))
            if not ok:
                fails.append("E1 fails in %s: gap %+.1f" % (y, gap))
        if any(f.startswith("E1") for f in fails):
            print("\n  A NEGATIVE gap of roughly one year's production depreciation is the")
            print("  signature of the double-count: reported cost of sales was lifted as-is")
            print("  with depreciation still inside it, AND total depreciation was also placed")
            print("  on the depreciation line. Strip production depreciation out of costOfSales")
            print("  and out of sga, leaving both lines depreciation-free.")

    # --- E3: operatingCash plausibility --------------------------------------
    print("\n[E3] operatingCash as a share of revenue")
    for t, y in enumerate(years):
        r = i["revenue"][t]
        share = b["operatingCash"][t] / r if r else 0.0
        flag = share > args.cash_flag_pct
        print("  %-6s cash %11.1f  revenue %11.1f  %6.2f%%  %s"
              % (y, b["operatingCash"][t], r, 100.0 * share, "FLAG" if flag else "ok"))
        if flag:
            warns.append("E3 %s: operatingCash is %.1f%% of revenue, which is high for an "
                         "operating balance. Likely the total cash line. Set "
                         "drivers.cashPolicy.operatingCashPctRevenue accordingly." % (y, 100.0 * share))

    # --- M: sanity -----------------------------------------------------------
    for t, y in enumerate(years):
        if i["revenue"][t] <= 0:
            fails.append("revenue non-positive in %s" % y)
        if b["ppe"][t] < 0:
            fails.append("ppe negative in %s" % y)
    sh = m.get("sharesOutstanding") or []
    if not sh or not sh[-1]:
        fails.append("sharesOutstanding missing or zero in the base year")

    # --- verdict -------------------------------------------------------------
    print("\n" + "=" * 62)
    for w in warns:
        print("WARN  " + w)
    if fails:
        for f in fails:
            print("FAIL  " + f)
        print("\nNOT VALID as a Track B input. %d failure(s)." % len(fails))
        sys.exit(3)
    print("\nVALID under the house conventions." if not warns
          else "\nVALID under the house conventions, with %d warning(s)." % len(warns))


if __name__ == "__main__":
    main()
