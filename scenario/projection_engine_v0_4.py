#!/usr/bin/env python3
"""
projection_engine_v0_4.py

Constellation Track B (scenario module), steps B3 and B5.
Successor to v0.3. Closes open item O1 by splitting otherOperatingAssets.

Changes from v0.3
    1. drivers.otherOpAssetsModel replaces the single ratio driver. kind is one of
       stock_plus_ratio (recommended), flat, or pct_revenue (the v0.3 behaviour).
       Under stock_plus_ratio, otherOperatingAssets = nonScalingStock + revenue * driver,
       so the non-scaling portion no longer grows with revenue and no longer consumes
       FOCF that is never spent. Same error class as the cash policy, one line over.
    2. Driver other_op_assets_pct_revenue renamed other_op_assets_scaling_pct_revenue.
       It now carries only the scaling remainder.

Changes in v0.3 (retained)
    1. drivers.cashPolicy.operatingCashPctRevenue is now required. Operating cash is
       revenue * policy; the remainder is excess cash. OWC carries only the operating
       portion, and net debt nets only the excess portion. Every euro of cash is
       counted exactly once, closing X1.
    2. At the default policy of 0.0 the valuation bridge is arithmetically unchanged
       (net debt is still longTermDebt - operatingCash), so no per-share number moves.
       Invested capital falls and ROIC rises by the same construction.
    3. Base-year invested capital is reported on both the policy basis and the legacy
       basis, so the size of the shift is visible before it reaches slices 2 and 3.

Changes in v0.2 (retained)
    1. FOCF now carries the Delta(otherOperatingAssets) term. v0.1 omitted it.
       House form: FOCF = NOPLAT + dep - dOWC - capexIncl - dOtherOperatingAssets,
       which reduces to NOPLAT - Delta(invested capital).
    2. capex_pct_revenue renamed capex_incl_pct_revenue. House capex is
       Delta(net ppe) + depreciation, i.e. gross capex. Same quantity, house name.
    3. nwc_pct_revenue renamed owc_pct_revenue. House vocabulary.
    4. other_op_assets_pct_revenue added as a driver.
    5. Net debt is now DERIVED as longTermDebt - operatingCash per SKILL section 2.
       scenarios.netDebt.value remains available as an explicit override.
    6. Invested capital, ROIC (on prior-year IC) and EVA are emitted per projected
       year, so the forward block carries the relational read as well as the DCF.

Contract
    input   a schema-v2 model JSON, plus a schema-v3 overlay (drivers + scenarios)
    output  a schema-v3 JSON with scenarios.computed populated

Discipline
    All arithmetic happens here, not in a model. Same input gives the same output.
    Nothing is inferred: any null driver is a hard stop, reported by dotted path.

Stdlib only. Python 3.9 or later.

Usage
    python3 projection_engine_v0_4.py --model evals/case-01/expected.json \
        --drivers scenario/asml_drivers_v0_2.json -o scenario/asml_v3_computed.json
"""

import argparse
import copy
import json
import sys
from datetime import date

ENGINE_VERSION = "0.4"
SCHEMA_VERSION_OUT = 3

# ---------------------------------------------------------------------------
# Locked arithmetic, transcribed from constellation-valuation/SKILL.md section 2.
# ---------------------------------------------------------------------------
CONVENTIONS = {
    "grossProfit": "revenue - costOfSales",
    "ebitda": "grossProfit - sga",
    "ebit": "ebitda - depreciation",
    "noplat": "ebit * (1 - taxRate)",
    "operatingCash": "revenue * drivers.cashPolicy.operatingCashPctRevenue",
    "excessCash": "balance.operatingCash - operatingCash",
    "owc": "(operatingCash + otherCurrentAssets) - (accountsPayable + otherNonInterestLiab)",
    "investedCapital": "owc + ppe + otherOperatingAssets",
    "capexIncl": "delta(net ppe) + depreciation",
    "ppeRoll": "ppe[t] = ppe[t-1] + capexIncl[t] - depreciation[t]",
    "focf": "noplat + depreciation - deltaOWC - capexIncl - deltaOtherOperatingAssets",
    "focfIdentity": "equivalently noplat - delta(investedCapital)",
    "roic": "noplat / prior-year investedCapital",
    "eva": "(roic - wacc) * prior-year investedCapital",
    "netDebt": "longTermDebt - excessCash",
    "ev": "sum(PV of explicit FOCF) + PV of terminal value",
    "equity": "ev - netDebt",
}

# Resolved against SKILL.md section 2 on 22 July 2026:
#   C1 gross margin basis      RESOLVED. House GP = revenue - costOfSales. Depreciation
#                              is a separate line. The engine already matched.
#   C2 opex line               RESOLVED. sga is the only line between GP and EBITDA,
#                              so R&D sits inside sga.
#   C3 OWC basis               RESOLVED. Engine formula matches the house OWC exactly.
#   C4 net debt                RESOLVED. Derivable as longTermDebt - operatingCash.
#
# Still open, plus two raised by the reconciliation:
UNRESOLVED_CONVENTIONS = [
    "C5 WACC across cases. Not addressed by SKILL section 2. Default holds the W1 mid "
    "band constant across bear/base/bull and swings WACC only in the tornado, to avoid "
    "double-counting risk in both the cash flows and the rate. Set "
    "scenarios.discount.waccByCase to override.",

    "C6 discounting timing. Not addressed by SKILL section 2. End-year by default. "
    "Set scenarios.discount.midYearDiscounting to switch.",

    "E3 extraction finding, open. balance.operatingCash in the ASML golden file is the "
    "total cash balance, not an operating subset: 12,735.9 against invested capital of "
    "29,548.5 at FY2024. The field name promises a split the extraction did not perform. "
    "The cash policy below is a parameterised stand-in. The durable fix is for /collect to "
    "emit operating and excess cash as separate fields in a later schema version.",

    "T1 tax basis, open. assumptions.taxRate in the ASML golden file is 0.2580, close to "
    "the Dutch statutory rate, while the effective rate implied by the income lines runs "
    "13.73 / 15.23 / 15.02 / 15.81 / 18.59 percent across FY2020-FY2024. Striking NOPLAT at "
    "the statutory rate understates it by roughly 650 on FY2024 EBIT of about 9,021, near 10 "
    "percent, and understates FOCF, ROIC and EVA by the same order. The forward tax_rate "
    "driver is set per case per year and does NOT inherit assumptions.taxRate, so Track B is "
    "free of this. Two things it does not fix: assumptions.taxRate still drives slices 1 to 4 "
    "on the historical block, and the statutory-versus-effective choice is a Track A "
    "convention that must apply to every name, not just this one.",

    "O1 superseded by drivers.otherOpAssetsModel in v0.4. Retained for the record: "
    "otherOperatingAssets is material: 11,005.4 at FY2024, 39 percent of "
    "revenue and the second-largest component of invested capital, on a history running 63 "
    "percent (2020) to 36.5 percent (2023) to 38.9 percent (2024). It now enters FOCF through "
    "delta(otherOperatingAssets), so a drifting path moves cash flow materially. A single "
    "ratio driver over that line is not good enough for a published base case.",

    "O2 anchor window. FY2020 is an outlier on OWC (66.8 percent of revenue) and other "
    "operating assets (63.4 percent) against 27 to 41 and 36 to 49 thereafter, and carries no "
    "capex or depreciation anchor by construction. Anchor driver paths on FY2022 to FY2024.",

    "X2 departure recorded, deliberate. The slice-4 headline capitalises NOPLAT: "
    "NOPLAT * (1+g) / (WACC-g). Track B capitalises FOCF after five explicit years. The "
    "two numbers will not agree and must not be compared naively. This is the B3 upgrade.",

    "E1 extraction rule, for the /collect agent and the eval set. The house costOfSales "
    "line must be depreciation-free, since depreciation is stated separately. Most reported "
    "cost of sales carries production depreciation. If the agent lifts reported COGS as-is "
    "and also puts total depreciation on the depreciation line, depreciation is "
    "double-counted and EBIT is understated. Add an eval assertion.",

    "E2 the projected block populates revenue, costOfSales, depreciation and sga only. "
    "interestIncome, interestExpense and incomeTaxes are not driven, so slices 1 to 3 must "
    "not be pointed at projected years. Slice 5 reads scenarios.computed only.",
]

ARRAY_FIELDS = {
    "income": ["revenue", "costOfSales", "depreciation", "sga",
               "interestIncome", "interestExpense", "incomeTaxes"],
    "balance": ["operatingCash", "otherCurrentAssets", "ppe", "otherOperatingAssets",
                "accountsPayable", "otherNonInterestLiab", "longTermDebt", "equity"],
}

CASES = ["bear", "base", "bull"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def die(msg, code=2):
    sys.stderr.write("FAIL: " + msg + "\n")
    sys.exit(code)


def load_json(path):
    try:
        with open(path, "r") as fh:
            return json.load(fh)
    except Exception as exc:
        die("cannot read %s: %s" % (path, exc))


def find_nulls(node, path, out):
    if node is None:
        out.append(path)
        return
    if isinstance(node, dict):
        for k, v in node.items():
            find_nulls(v, ("%s.%s" % (path, k)) if path else k, out)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            find_nulls(v, "%s[%d]" % (path, i), out)


# ---------------------------------------------------------------------------
# merge and validate
# ---------------------------------------------------------------------------
def merge_overlay(model, overlay):
    out = copy.deepcopy(model)
    for block in ("drivers", "scenarios"):
        if block not in overlay:
            die("overlay is missing the '%s' block" % block)
        out[block] = copy.deepcopy(overlay[block])
    out["schemaVersion"] = SCHEMA_VERSION_OUT
    return out


def validate_shape(model):
    errs = []
    years = model.get("years")
    if not isinstance(years, list) or not years:
        die("model.years is missing or empty; cannot locate a base year")
    n = len(years)
    for block, fields in ARRAY_FIELDS.items():
        if block not in model:
            errs.append("model.%s block missing" % block)
            continue
        for f in fields:
            v = model[block].get(f)
            if v is None:
                errs.append("model.%s.%s missing" % (block, f))
            elif not isinstance(v, list) or len(v) != n:
                errs.append("model.%s.%s must be a list of length %d (years)" % (block, f, n))
    if not isinstance(model.get("sharesOutstanding"), list):
        errs.append("model.sharesOutstanding must be a list")
    if errs:
        die("schema-v2 shape errors:\n  - " + "\n  - ".join(errs))

    b = model["balance"]
    for i, y in enumerate(years):
        assets = (b["operatingCash"][i] + b["otherCurrentAssets"][i]
                  + b["ppe"][i] + b["otherOperatingAssets"][i])
        liab = (b["accountsPayable"][i] + b["otherNonInterestLiab"][i]
                + b["longTermDebt"][i] + b["equity"][i])
        if abs(assets - liab) > 1e-6 * max(1.0, abs(assets)):
            die("balance identity fails in %s: assets %.4f vs financing %.4f" % (y, assets, liab))
    return n


def validate_fill(model):
    blocking, provenance = [], []
    raw = []
    find_nulls(model.get("drivers"), "drivers", raw)
    sc = model.get("scenarios", {})
    find_nulls(sc.get("discount"), "scenarios.discount", raw)

    nd = sc.get("netDebt") or {}
    if nd.get("value") is not None:
        find_nulls(nd, "scenarios.netDebt", raw)

    for case in CASES:
        block = sc.get("cases", {}).get(case)
        if block is None:
            blocking.append("scenarios.cases.%s missing" % case)
            continue
        find_nulls(block.get("paths"), "scenarios.cases.%s.paths" % case, raw)
        find_nulls(block.get("sources"), "scenarios.cases.%s.sources" % case, raw)

    for p in raw:
        (provenance if "source" in p.lower() else blocking).append(p)

    unarmed = []
    for trig in sc.get("triggers", []) or []:
        find_nulls(trig, "trigger:%s" % trig.get("id", "?"), unarmed)

    return blocking, provenance, unarmed


# ---------------------------------------------------------------------------
# projection
# ---------------------------------------------------------------------------
def path_of(model, case, driver_id, horizon):
    paths = model["scenarios"]["cases"][case]["paths"]
    if driver_id not in paths:
        die("driver '%s' has no path in case '%s'" % (driver_id, case))
    p = paths[driver_id]
    if not isinstance(p, list) or len(p) != horizon:
        die("driver '%s' in case '%s' must be a list of length %d" % (driver_id, case, horizon))
    return p


def cash_policy(model):
    cp = (model.get("drivers") or {}).get("cashPolicy") or {}
    v = cp.get("operatingCashPctRevenue")
    if v is None:
        die("drivers.cashPolicy.operatingCashPctRevenue is required from engine v0.3. "
            "Set it to 0.0 to treat all cash as excess, which reproduces the v0.2 bridge "
            "exactly, and record a source. This is the resolution of open item X1.")
    return float(v)


def base_state(model):
    b, i = model["balance"], model["income"]
    rev = i["revenue"][-1]
    cash_total = b["operatingCash"][-1]
    cash_op = rev * cash_policy(model)
    cash_excess = cash_total - cash_op
    other = b["otherOperatingAssets"][-1]
    ppe = b["ppe"][-1]
    non_cash_owc = (b["otherCurrentAssets"][-1]
                    - (b["accountsPayable"][-1] + b["otherNonInterestLiab"][-1]))
    owc = cash_op + non_cash_owc
    return {
        "year": model["years"][-1],
        "revenue": rev,
        "ppe": ppe,
        "owc": owc,
        "cashTotal": cash_total,
        "cashOperating": cash_op,
        "cashExcess": cash_excess,
        "otherOperatingAssets": other,
        "investedCapital": owc + ppe + other,
        "investedCapitalLegacy": cash_total + non_cash_owc + ppe + other,
    }


def derive_net_debt(model):
    nd = model["scenarios"].get("netDebt") or {}
    if nd.get("value") is not None:
        return float(nd["value"]), "override: " + str(nd.get("source"))
    b = model["balance"]
    excess = b["operatingCash"][-1] - model["income"]["revenue"][-1] * cash_policy(model)
    return (b["longTermDebt"][-1] - excess,
            "derived: longTermDebt - excessCash, cash policy %.4f of revenue"
            % cash_policy(model))


def project_revenue(model, case, horizon, base_rev, overrides):
    rm = model["drivers"]["revenueModel"]

    def pv(did):
        return overrides.get(did) or path_of(model, case, did, horizon)

    out = []
    if rm["type"] == "components":
        for t in range(horizon):
            total = 0.0
            for term in rm["terms"]:
                if term["kind"] == "units_x_asp":
                    total += pv(term["units"])[t] * pv(term["asp"])[t]
                elif term["kind"] == "direct":
                    total += pv(term["value"])[t]
                else:
                    die("unknown revenue term kind '%s'" % term["kind"])
            out.append(total)
    elif rm["type"] == "growth":
        prev = base_rev
        g = pv(rm["growth"])
        for t in range(horizon):
            prev = prev * (1.0 + g[t])
            out.append(prev)
    else:
        die("unknown revenueModel.type '%s'" % rm["type"])
    return out


def build_proforma(model, case, overrides=None):
    overrides = overrides or {}
    horizon = model["drivers"]["horizonYears"]
    base = base_state(model)

    def pv(did):
        return overrides.get(did) or path_of(model, case, did, horizon)

    rev = project_revenue(model, case, horizon, base["revenue"], overrides)
    gm = pv("gross_margin_pct")
    opex = pv("opex_pct_revenue")
    capex_pct = pv("capex_incl_pct_revenue")
    owc_pct = pv("owc_pct_revenue")
    tax = pv("tax_rate")

    oam = model["drivers"].get("otherOpAssetsModel")
    if not oam:
        die("drivers.otherOpAssetsModel is required from engine v0.4. Set kind to "
            "stock_plus_ratio, flat, or pct_revenue. This is the resolution of open item O1.")
    oa_kind = oam["kind"]
    if oa_kind == "stock_plus_ratio":
        if oam.get("nonScalingStock") is None:
            die("drivers.otherOpAssetsModel.nonScalingStock is required under "
                "stock_plus_ratio. It is the portion of otherOperatingAssets that does not "
                "scale with revenue, in model units, taken from the base-year balance sheet.")
        oa_stock = float(oam["nonScalingStock"])
        oa_path = pv(oam["driver"])
    elif oa_kind == "flat":
        oa_stock, oa_path = base["otherOperatingAssets"], None
    elif oa_kind == "pct_revenue":
        oa_stock, oa_path = 0.0, pv(oam["driver"])
    else:
        die("unknown otherOpAssetsModel.kind '%s'" % oa_kind)
    dep_kind = model["drivers"]["depreciationModel"]["kind"]
    dep_path = pv(model["drivers"]["depreciationModel"]["driver"])

    rows = []
    ppe_prev = base["ppe"]
    owc_prev = base["owc"]
    other_prev = base["otherOperatingAssets"]
    ic_prev = base["investedCapital"]

    for t in range(horizon):
        revenue = rev[t]
        cost_of_sales = revenue * (1.0 - gm[t])
        sga = revenue * opex[t]
        if dep_kind == "pct_prior_ppe":
            depreciation = ppe_prev * dep_path[t]
        elif dep_kind == "explicit":
            depreciation = dep_path[t]
        elif dep_kind == "pct_revenue":
            depreciation = revenue * dep_path[t]
        else:
            die("unknown depreciationModel.kind '%s'" % dep_kind)

        gross_profit = revenue - cost_of_sales
        ebitda = gross_profit - sga
        ebit = ebitda - depreciation
        noplat = ebit * (1.0 - tax[t])

        capex_incl = revenue * capex_pct[t]
        ppe = ppe_prev + capex_incl - depreciation
        owc = revenue * owc_pct[t]
        other = oa_stock + (revenue * oa_path[t] if oa_path is not None else 0.0)
        ic = owc + ppe + other

        d_owc = owc - owc_prev
        d_other = other - other_prev
        focf = noplat + depreciation - d_owc - capex_incl - d_other

        rows.append({
            "t": t + 1,
            "year": base["year"] + t + 1 if isinstance(base["year"], int) else None,
            "revenue": revenue, "costOfSales": cost_of_sales, "grossProfit": gross_profit,
            "sga": sga, "ebitda": ebitda, "depreciation": depreciation, "ebit": ebit,
            "ebitMarginPct": ebit / revenue if revenue else None,
            "noplat": noplat, "capexIncl": capex_incl, "ppe": ppe,
            "owc": owc, "otherOperatingAssets": other, "investedCapital": ic,
            "deltaOWC": d_owc, "deltaOtherOperatingAssets": d_other,
            "focf": focf,
            "roic": noplat / ic_prev if ic_prev else None,
            "priorInvestedCapital": ic_prev,
        })
        ppe_prev, owc_prev, other_prev, ic_prev = ppe, owc, other, ic
    return rows


# ---------------------------------------------------------------------------
# discounting
# ---------------------------------------------------------------------------
def wacc_for(model, case, override=None):
    if override is not None:
        return override
    d = model["scenarios"]["discount"]
    by_case = d.get("waccByCase")
    if by_case:
        key = by_case.get(case)
        if key not in ("waccLow", "waccMid", "waccHigh"):
            die("scenarios.discount.waccByCase.%s must name waccLow/waccMid/waccHigh" % case)
        return d[key]
    return d["waccMid"]


def discount(model, rows, w):
    d = model["scenarios"]["discount"]
    g = d["terminalGrowth"]
    mid = bool(d.get("midYearDiscounting", False))
    method = d.get("terminalMethod", "gordon")
    if w <= g:
        die("WACC (%.4f) must exceed terminal growth (%.4f)" % (w, g))

    pv_explicit, exp = 0.0, 0.0
    for r in rows:
        exp = r["t"] - 0.5 if mid else float(r["t"])
        pv_explicit += r["focf"] / ((1.0 + w) ** exp)

    last_focf, last_exp, pv_fade = rows[-1]["focf"], exp, 0.0

    if method == "fade_then_gordon":
        f = int(d.get("fadeYears") or 0)
        if f <= 0:
            die("terminalMethod is fade_then_gordon but fadeYears is not a positive integer")
        g_start = d.get("fadeStartGrowth")
        if g_start is None:
            if len(rows) < 2 or rows[-2]["focf"] <= 0:
                die("fadeStartGrowth is required: implied growth is not computable from the "
                    "final two explicit years (prior FOCF is zero or negative)")
            g_start = rows[-1]["focf"] / rows[-2]["focf"] - 1.0
        focf = last_focf
        for j in range(1, f + 1):
            gj = g_start + (g - g_start) * (float(j) / f)
            focf = focf * (1.0 + gj)
            exp_j = (len(rows) + j) - (0.5 if mid else 0.0)
            pv_fade += focf / ((1.0 + w) ** exp_j)
            last_exp = exp_j
        last_focf = focf
    elif method != "gordon":
        die("unknown terminalMethod '%s'" % method)

    tv = last_focf * (1.0 + g) / (w - g)
    pv_tv = tv / ((1.0 + w) ** last_exp)
    ev = pv_explicit + pv_fade + pv_tv
    return {
        "wacc": w, "terminalGrowth": g, "terminalMethod": method,
        "pvExplicit": pv_explicit, "pvFade": pv_fade,
        "terminalValue": tv, "pvTerminal": pv_tv,
        "terminalSharePct": pv_tv / ev if ev else None,
        "ev": ev,
    }


def value_case(model, case, overrides=None, wacc_override=None):
    rows = build_proforma(model, case, overrides)
    w = wacc_for(model, case, wacc_override)
    val = discount(model, rows, w)
    for r in rows:
        r["eva"] = ((r["roic"] - w) * r["priorInvestedCapital"]
                    if r["roic"] is not None else None)
    net_debt, nd_basis = derive_net_debt(model)
    shares = model.get("sharesOutstanding") or []
    equity = val["ev"] - net_debt
    val.update({
        "netDebt": net_debt, "netDebtBasis": nd_basis,
        "equity": equity,
        "perShare": equity / shares[-1] if shares and shares[-1] else None,
    })
    return rows, val


# ---------------------------------------------------------------------------
# tornado (B5)
# ---------------------------------------------------------------------------
def tornado(model, base_ev):
    horizon = model["drivers"]["horizonYears"]
    out, skipped = [], []
    for did in sorted(model["scenarios"]["cases"]["base"]["paths"].keys()):
        try:
            lo_path = path_of(model, "bear", did, horizon)
            hi_path = path_of(model, "bull", did, horizon)
        except SystemExit:
            skipped.append(did)
            continue
        _, lo = value_case(model, "base", overrides={did: lo_path})
        _, hi = value_case(model, "base", overrides={did: hi_path})
        out.append({
            "driver": did, "evAtBearPath": lo["ev"], "evAtBullPath": hi["ev"],
            "deltaLow": lo["ev"] - base_ev, "deltaHigh": hi["ev"] - base_ev,
            "span": abs(hi["ev"] - lo["ev"]),
        })

    d = model["scenarios"]["discount"]
    _, lo = value_case(model, "base", wacc_override=d["waccHigh"])
    _, hi = value_case(model, "base", wacc_override=d["waccLow"])
    out.append({
        "driver": "wacc (W1 band)", "evAtBearPath": lo["ev"], "evAtBullPath": hi["ev"],
        "deltaLow": lo["ev"] - base_ev, "deltaHigh": hi["ev"] - base_ev,
        "span": abs(hi["ev"] - lo["ev"]),
    })
    out.sort(key=lambda r: r["span"], reverse=True)
    return out, skipped


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Constellation Track B projection engine v0.4")
    ap.add_argument("--model", required=True, help="schema-v2 (or v3) model JSON")
    ap.add_argument("--drivers", help="schema-v3 overlay: drivers + scenarios blocks")
    ap.add_argument("-o", "--out", required=True, help="output schema-v3 JSON")
    ap.add_argument("--as-of", default=date.today().isoformat(), help="stamp for computedAt")
    ap.add_argument("--allow-missing-sources", action="store_true",
                    help="compute despite null source fields (prototype only)")
    ap.add_argument("--check-only", action="store_true",
                    help="validate and report fill gaps, do not compute")
    args = ap.parse_args()

    model = load_json(args.model)
    if args.drivers:
        model = merge_overlay(model, load_json(args.drivers))
    if "drivers" not in model or "scenarios" not in model:
        die("no drivers/scenarios blocks; pass --drivers with a schema-v3 overlay")

    validate_shape(model)
    blocking, provenance, unarmed = validate_fill(model)

    if blocking:
        print("UNFILLED (blocking) - %d fields:" % len(blocking))
        for p in blocking:
            print("  " + p)
    if provenance:
        print("MISSING PROVENANCE (%s) - %d fields:"
              % ("warning" if args.allow_missing_sources else "blocking", len(provenance)))
        for p in provenance:
            print("  " + p)
    if unarmed:
        print("UNARMED TRIGGERS (non-blocking) - %d fields" % len(unarmed))

    hard = list(blocking) + ([] if args.allow_missing_sources else list(provenance))
    if hard:
        die("%d field(s) unfilled. Nothing is inferred; fill them and re-run." % len(hard), 3)
    if args.check_only:
        print("check-only: shape, balance identity and fill all clean.")
        return

    results, proformas = {}, {}
    for case in CASES:
        rows, val = value_case(model, case)
        proformas[case], results[case] = rows, val

    evs = {c: results[c]["ev"] for c in CASES}
    tor, skipped = tornado(model, evs["base"])
    shares_ok = results["base"]["perShare"] is not None

    model["scenarios"]["computed"] = {
        "engineVersion": ENGINE_VERSION,
        "computedAt": args.as_of,
        "conventions": CONVENTIONS,
        "conventionsSource": "constellation-valuation/SKILL.md section 2, plus the v0.3 cash policy",
        "cashPolicy": {"operatingCashPctRevenue": cash_policy(model),
                       "baseYear": base_state(model)},
        "unresolvedConventions": UNRESOLVED_CONVENTIONS,
        "driversSkippedInTornado": skipped,
        "cases": {c: {"valuation": results[c], "proforma": proformas[c]} for c in CASES},
        "footballField": {
            "unit": model.get("unit"),
            "evLow": min(evs.values()), "evBase": evs["base"], "evHigh": max(evs.values()),
            "perShareLow": min(results[c]["perShare"] for c in CASES) if shares_ok else None,
            "perShareBase": results["base"]["perShare"],
            "perShareHigh": max(results[c]["perShare"] for c in CASES) if shares_ok else None,
        },
        "tornado": tor,
    }

    with open(args.out, "w") as fh:
        json.dump(model, fh, indent=2)

    unit = model.get("unit", "")
    bs = base_state(model)
    print("\ncash policy: operating cash = %.4f of revenue" % cash_policy(model))
    print("  cash total %.1f  operating %.1f  excess %.1f %s"
          % (bs["cashTotal"], bs["cashOperating"], bs["cashExcess"], unit))
    print("  base-year invested capital: policy basis %.1f  legacy basis %.1f  (shift %.1f)"
          % (bs["investedCapital"], bs["investedCapitalLegacy"],
             bs["investedCapital"] - bs["investedCapitalLegacy"]))
    print("  forward ROIC below is on the policy basis only")
    print("\nnet debt: %.1f %s (%s)" % (results["base"]["netDebt"], unit,
                                        results["base"]["netDebtBasis"]))
    print("\nEV by case (%s)" % unit)
    for c in CASES:
        r = results[c]
        print("  %-5s ev=%14.1f  equity=%14.1f  perShare=%s  terminal=%.0f%%"
              % (c, r["ev"], r["equity"],
                 ("%.2f" % r["perShare"]) if r["perShare"] is not None else "n/a",
                 100.0 * (r["terminalSharePct"] or 0)))
    print("\nBase case ROIC vs WACC (%.2f%%)" % (100.0 * results["base"]["wacc"]))
    for r in proformas["base"]:
        print("  t+%d  roic=%6.2f%%  eva=%12.1f" % (r["t"], 100.0 * (r["roic"] or 0), r["eva"] or 0))
    print("\nTornado (EV span, %s)" % unit)
    for r in tor:
        print("  %-28s span=%13.1f  low=%+12.1f  high=%+12.1f"
              % (r["driver"], r["span"], r["deltaLow"], r["deltaHigh"]))
    print("\nOpen conventions carried into the output: %d (see scenarios.computed)"
          % len(UNRESOLVED_CONVENTIONS))
    print("Wrote %s" % args.out)


if __name__ == "__main__":
    main()
