#!/usr/bin/env python3
"""
revenue_tree_check_v0_1.py

Constellation Track B, step B4 support for the revenue tree.

Two modes.

  reconcile   Take the base-year figures as disclosed and check that the unit tree
              ties to the model's base-year revenue. Run this BEFORE filling any
              forward path. If the tree does not reconcile at the base year it will
              not reconcile anywhere.

  preview     Read a filled overlay and print, per case per year, the revenue the
              tree implies, its growth, the mix, and the drift in each ASP. Catches
              paths that are individually plausible and jointly absurd.

Stdlib only.

Usage
    python3 scenario/revenue_tree_check_v0_1.py reconcile \
        --model evals/case-01/expected.json \
        --term EUV:<units>:<asp> --term HighNA:<units>:<asp> \
        --term ArFi:<units>:<asp> --term DUVdry:<units>:<asp> \
        --ibm <service and field option sales>

    python3 scenario/revenue_tree_check_v0_1.py preview \
        --model evals/case-01/expected.json --drivers scenario/asml_drivers_v0_8.json

The numbers above are placeholders. Take them from the annual report. Nothing in
this file supplies them.
"""

import argparse
import json
import sys


def die(msg):
    sys.stderr.write("FAIL: " + msg + "\n")
    sys.exit(2)


def load(path):
    try:
        return json.load(open(path))
    except Exception as exc:
        die("cannot read %s: %s" % (path, exc))


# ---------------------------------------------------------------------------
def cmd_reconcile(args):
    m = load(args.model)
    target = m["income"]["revenue"][-1]
    unit = m.get("unit", "")
    base_year = m["years"][-1]

    terms = []
    for t in args.term:
        parts = t.split(":")
        if len(parts) != 3:
            die("--term must be NAME:UNITS:ASP, got '%s'" % t)
        try:
            terms.append((parts[0], float(parts[1]), float(parts[2])))
        except ValueError:
            die("--term units and asp must be numbers, got '%s'" % t)
    if not terms:
        die("at least one --term is required")

    print("Base-year revenue reconciliation, %s (%s)" % (base_year, unit))
    print("  %-12s %10s %12s %14s %8s" % ("term", "units", "asp", "revenue", "share"))
    sys_rev = 0.0
    for name, u, a in terms:
        sys_rev += u * a
    for name, u, a in terms:
        r = u * a
        print("  %-12s %10.1f %12.2f %14.1f %7.1f%%"
              % (name, u, a, r, 100.0 * r / sys_rev if sys_rev else 0.0))
    print("  %-12s %10s %12s %14.1f" % ("SYSTEMS", "", "", sys_rev))
    print("  %-12s %10s %12s %14.1f" % ("IBM (service)", "", "", args.ibm))

    total = sys_rev + args.ibm
    gap = total - target
    print("\n  tree total        %14.1f" % total)
    print("  model revenue     %14.1f" % target)
    print("  gap               %14.1f   (%+.3f%% of model revenue)"
          % (gap, 100.0 * gap / target if target else 0.0))

    tol = args.tolerance
    if abs(gap) <= tol * abs(target):
        print("\n  RECONCILES within %.2f%%." % (100.0 * tol))
    else:
        print("\n  DOES NOT RECONCILE at %.2f%% tolerance." % (100.0 * tol))
        print("  Usual causes, in the order worth checking:")
        print("    - the tree was compared to TOTAL net sales rather than to NET SYSTEM SALES.")
        print("      Sum(units x asp) must tie to system sales; IBM is the separate service line.")
        print("    - used or refurbished systems disclosed separately and omitted here.")
        print("    - units SHIPPED quoted where units RECOGNISED is the revenue-bearing figure.")
        print("    - a technology line left out of the mapping (i-line and KrF are easy to miss).")
        print("    - deferred revenue on newly introduced systems recognised in a later period.")

    if sys_rev:
        print("\n  blended ASP across all system terms: %.2f" % (sys_rev / sum(t[1] for t in terms)))
        if len(terms) > 1:
            hi = max(terms, key=lambda t: t[2])
            lo = min(terms, key=lambda t: t[2])
            print("  ASP spread %s %.2f to %s %.2f, a factor of %.1f."
                  % (hi[0], hi[2], lo[0], lo[2], hi[2] / lo[2] if lo[2] else float("nan")))
            print("  Any term that blends lines across that spread carries mix risk: the blended")
            print("  ASP moves when the mix moves, with no change in any actual price.")


# ---------------------------------------------------------------------------
def cmd_preview(args):
    m = load(args.model)
    ov = load(args.drivers)
    dr = ov["drivers"]
    rm = dr["revenueModel"]
    if rm["type"] != "components":
        die("preview supports revenueModel.type 'components' only")
    horizon = dr["horizonYears"]
    base_rev = m["income"]["revenue"][-1]
    base_year = m["years"][-1]
    unit = m.get("unit", "")

    for case in ("bear", "base", "bull"):
        paths = ov["scenarios"]["cases"][case]["paths"]
        missing = []
        for term in rm["terms"]:
            for key in (("units", "asp") if term["kind"] == "units_x_asp" else ("value",)):
                did = term[key]
                if paths.get(did) is None:
                    missing.append(did)
        if missing:
            print("%s: not previewable, %d driver(s) still null: %s"
                  % (case, len(missing), ", ".join(sorted(set(missing)))))
            continue

        print("\n%s case (%s)" % (case.upper(), unit))
        hdr = "  year        revenue    growth"
        for term in rm["terms"]:
            hdr += "  %12s" % term["id"]
        print(hdr)
        prev = base_rev
        print("  %-6s %13.1f      base" % (base_year, base_rev))
        for t in range(horizon):
            parts, total = [], 0.0
            for term in rm["terms"]:
                if term["kind"] == "units_x_asp":
                    v = paths[term["units"]][t] * paths[term["asp"]][t]
                else:
                    v = paths[term["value"]][t]
                parts.append(v)
                total += v
            yr = base_year + t + 1 if isinstance(base_year, int) else t + 1
            line = "  %-6s %13.1f %8.1f%%" % (yr, total, 100.0 * (total / prev - 1.0) if prev else 0.0)
            for v in parts:
                line += "  %11.1f%%" % (100.0 * v / total if total else 0.0)
            print(line)
            prev = total
        cagr = (prev / base_rev) ** (1.0 / horizon) - 1.0 if base_rev > 0 else None
        print("  %d-year revenue CAGR: %.2f%%" % (horizon, 100.0 * cagr))

        for term in rm["terms"]:
            if term["kind"] != "units_x_asp":
                continue
            a = paths[term["asp"]]
            u = paths[term["units"]]
            print("    %-10s units %s  ->  ASP drift %.2f to %.2f (%+.1f%% over %d years)"
                  % (term["id"], "%.0f to %.0f" % (u[0], u[-1]), a[0], a[-1],
                     100.0 * (a[-1] / a[0] - 1.0) if a[0] else 0.0, horizon))

    print("\nChecks worth making on the above:")
    print("  - does year 1 revenue sit sensibly against the base year, or does the tree jump?")
    print("  - is the bear case actually below the base case in every year?")
    print("  - do ASPs drift faster than any stated pricing basis supports?")
    print("  - does unit growth imply capacity the company has not said it will build?")


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Revenue tree reconciliation and preview")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("reconcile", help="check the base-year tree against model revenue")
    r.add_argument("--model", required=True)
    r.add_argument("--term", action="append", default=[], metavar="NAME:UNITS:ASP")
    r.add_argument("--ibm", type=float, required=True, help="service and field option sales")
    r.add_argument("--tolerance", type=float, default=0.005, help="fraction, default 0.005")
    r.set_defaults(func=cmd_reconcile)

    p = sub.add_parser("preview", help="print implied revenue from a filled overlay")
    p.add_argument("--model", required=True)
    p.add_argument("--drivers", required=True)
    p.set_defaults(func=cmd_preview)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
