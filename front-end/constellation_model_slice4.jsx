import { useState, useMemo } from "react";

/* Constellation financial model — SLICE 4: valuation (football-field)
   Eight methods on the latest year: invested capital (asset floor, point),
   EV/Revenue, EV/EBITDA, EV/EBIT (multiple bands), DCF-Gordon, EVA-based EV,
   P/E (equity, bridged to EV via net debt), book equity (point).
   DCF headline = NOPLAT x (1+g) / (WACC - g).
   Equity methods bridged: EV = equity value + net debt, net debt = debt - cash.
   Views: Enterprise value / Equity value / Share price.
   Verified structurally against ASML. Convention flagged in-UI. */

const C = {
  bg: "rgb(25,60,63)", ink: "rgb(244,240,233)",
  dim: "rgba(244,240,233,0.55)", faint: "rgba(244,240,233,0.30)",
  line: "rgba(244,240,233,0.13)", panel: "rgba(244,240,233,0.035)",
  gold: "rgb(198,165,83)", goldFill: "rgba(198,165,83,0.22)", goldMid: "rgb(198,165,83)",
  green: "rgb(120,180,140)", red: "rgb(200,120,100)", blue: "rgb(130,160,200)"
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";

const SAMPLE = {
  schemaVersion: 2, company: "ASML Holding NV", unit: "EUR millions",
  years: [2020, 2021, 2022, 2023, 2024],
  income: { revenue: [13978.5, 18611, 21173.4, 27558.5, 28262.9], costOfSales: [6873.6, 8505.6, 10119.2, 12989.3, 13268.7], depreciation: [475.2, 454.6, 580.3, 733.2, 913.3], sga: [2578.2, 2900.7, 3973.2, 4793.7, 5058.3], interestIncome: [8.4, 10, 16.2, 193.9, 182.4], interestExpense: [43.3, 54.6, 60.8, 152.7, 162.6], incomeTaxes: [551.5, 1021.4, 969.9, 1435.8, 1680.6] },
  balance: { operatingCash: [6049.4, 6951.8, 7268.3, 7004.7, 12735.9], otherCurrentAssets: [9880.6, 11238.4, 15796.6, 17389.2, 18001.5], ppe: [2470.3, 2982.7, 3944.2, 5493.2, 6846.8], otherOperatingAssets: [8867.1, 9058.1, 9291.3, 10070.4, 11005.4], accountsPayable: [1377.9, 2116.3, 2565.2, 2347.3, 3500.4], otherNonInterestLiab: [5210.2, 9672.6, 14672.2, 13927.3, 15540.7], longTermDebt: [6813.9, 8301.5, 10252.2, 10230.5, 11071.7], equity: [13865.4, 10140.6, 8810.8, 13452.4, 18476.8] },
  assumptions: { taxRate: 0.258, wacc: 0.1 },
  sharesOutstanding: [416.514034, 402.601613, 394.589411, 393.421721, 393.28372],
  valuationMultiples: { industry: "tech-saas", evRevenue: [4, 12], evEbitda: [15, 30], evEbit: [20, 40], pe: [25, 50], growth: [0.025, 0.04] },
  labels: {},
};

const fk = v => v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString();

export default function App() {
  const [data, setData] = useState(SAMPLE);
  const [view, setView] = useState("ev"); // ev | equity | share
  const [showLoad, setShowLoad] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const yrs = data.years, inc = data.income, bal = data.balance;
  const vm = data.valuationMultiples, tr = data.assumptions.taxRate, wacc = data.assumptions.wacc;
  const i = yrs.length - 1;

  const model = useMemo(() => {
    const rev = inc.revenue[i], cos = inc.costOfSales[i], dep = inc.depreciation[i], sga = inc.sga[i];
    const ii = inc.interestIncome[i], ie = inc.interestExpense[i], tax = inc.incomeTaxes[i];
    const ebitda = rev - cos - sga, ebit = ebitda - dep, ni = ebit + ii - ie - tax, noplat = ebit * (1 - tr);
    const netDebt = bal.longTermDebt[i] - bal.operatingCash[i];
    const bookEquity = bal.equity[i];
    const owc = k => (bal.operatingCash[k] + bal.otherCurrentAssets[k]) - (bal.accountsPayable[k] + bal.otherNonInterestLiab[k]);
    const ic = k => owc(k) + bal.ppe[k] + bal.otherOperatingAssets[k];
    const icNow = ic(i), icPrev = ic(i - 1);
    const evaNow = (noplat / icPrev - wacc) * icPrev;
    const g = vm.growth;
    const gordon = gg => noplat * (1 + gg) / (wacc - gg);
    const evaEV = gg => icNow + evaNow * (1 + gg) / (wacc - gg);
    const shares = data.sharesOutstanding[i];

    // each method as EV band [lo,hi], mid, kind
    const rows = [
      { name: "Invested capital", sub: "asset floor", lo: icNow, hi: icNow, point: true },
      { name: "EV / Revenue", sub: `${vm.evRevenue[0]}x – ${vm.evRevenue[1]}x`, lo: vm.evRevenue[0] * rev, hi: vm.evRevenue[1] * rev },
      { name: "EV / EBITDA", sub: `${vm.evEbitda[0]}x – ${vm.evEbitda[1]}x`, lo: vm.evEbitda[0] * ebitda, hi: vm.evEbitda[1] * ebitda },
      { name: "EV / EBIT", sub: `${vm.evEbit[0]}x – ${vm.evEbit[1]}x`, lo: vm.evEbit[0] * ebit, hi: vm.evEbit[1] * ebit },
      { name: "DCF — Gordon", sub: `g ${(g[0] * 100).toFixed(0)}% – ${(g[1] * 100).toFixed(0)}%`, lo: Math.min(gordon(g[0]), gordon(g[1])), hi: Math.max(gordon(g[0]), gordon(g[1])) },
      { name: "EVA-based EV", sub: `g ${(g[0] * 100).toFixed(0)}% – ${(g[1] * 100).toFixed(0)}%`, lo: Math.min(evaEV(g[0]), evaEV(g[1])), hi: Math.max(evaEV(g[0]), evaEV(g[1])) },
      { name: "P / E", sub: `${vm.pe[0]}x – ${vm.pe[1]}x`, lo: vm.pe[0] * ni + netDebt, hi: vm.pe[1] * ni + netDebt, equityBridged: true },
      { name: "Book equity", sub: "balance-sheet basis", lo: bookEquity + netDebt, hi: bookEquity + netDebt, point: true, equityBridged: true },
    ];
    const dcfHeadline = gordon(0.025);
    return { rows, netDebt, shares, dcfHeadline, ebitda, ebit, ni, noplat, rev };
  }, [data]);

  // transform EV -> equity or share depending on view
  const toView = (evVal) => {
    if (view === "ev") return evVal;
    const equity = evVal - model.netDebt;
    if (view === "equity") return equity;
    return equity / model.shares; // share price
  };
  const unitLabel = view === "share" ? `${data.unit.split(" ")[0]} / share` : `${data.unit} (${view === "ev" ? "enterprise" : "equity"} value)`;

  const displayRows = model.rows.map(r => ({ ...r, dlo: toView(r.lo), dhi: toView(r.hi) }));
  const allVals = displayRows.flatMap(r => [r.dlo, r.dhi]).filter(v => isFinite(v));
  const axisMin = Math.min(0, ...allVals), axisMax = Math.max(...allVals);
  const range = axisMax - axisMin || 1;
  const xp = v => ((v - axisMin) / range) * 100;

  const loadJson = () => { try { const p = JSON.parse(pasteText); if (!p.income || !p.balance) throw new Error("Expected schema-v2."); setData(p); setShowLoad(false); setPasteText(""); setLoadErr(""); } catch (e) { setLoadErr(String(e.message || e)); } };
  const onFile = e => { const fl = e.target.files?.[0]; if (!fl) return; const r = new FileReader(); r.onload = () => setPasteText(String(r.result)); r.readAsText(fl); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "26px 18px 60px", fontFamily: serif }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", color: C.dim, textTransform: "uppercase", marginBottom: 6 }}>Constellation · financial model · slice 4 of 4 (valuation)</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, margin: 0, color: C.ink }}>{data.company} <span style={{ color: C.dim, fontSize: 15 }}>· {data.unit}</span></h1>
          <button onClick={() => setShowLoad(s => !s)} style={btnGhost}>{showLoad ? "cancel" : "load JSON"}</button>
        </div>

        {/* DCF headline */}
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap", margin: "14px 0 6px", alignItems: "baseline" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>DCF (Gordon, g=2.5%)</div>
            <div style={{ fontFamily: serif, fontSize: 30, color: C.ink }}>{fk(model.dcfHeadline)}</div>
            <div style={{ fontFamily: serif, fontSize: 12, color: C.dim }}>NOPLAT × (1 + g) / (WACC − g)</div>
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>Net debt (debt − cash)</div>
            <div style={{ fontFamily: serif, fontSize: 30, color: model.netDebt < 0 ? C.green : C.ink }}>{fk(model.netDebt)}</div>
            <div style={{ fontFamily: serif, fontSize: 12, color: C.dim }}>{model.netDebt < 0 ? "net cash: reduces EV→equity gap" : "bridges equity → EV"}</div>
          </div>
        </div>

        {showLoad && (
          <div style={{ margin: "14px 0 18px" }}>
            <input type="file" accept=".json" onChange={onFile} style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginBottom: 8, display: "block" }} />
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="paste schema-v2 JSON" style={{ width: "100%", minHeight: 70, boxSizing: "border-box", fontFamily: mono, fontSize: 11, color: C.ink, background: "rgba(0,0,0,0.25)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "10px 12px", outline: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}><button onClick={loadJson} style={btnGold}>Load</button>{loadErr && <span style={{ fontFamily: mono, fontSize: 10, color: C.red }}>{loadErr}</span>}</div>
          </div>
        )}

        {/* view toggle */}
        <div style={{ display: "flex", gap: 6, margin: "18px 0 6px" }}>
          {[["ev", "Enterprise value"], ["equity", "Equity value"], ["share", "Share price"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", color: view === k ? C.bg : C.dim, background: view === k ? C.gold : "transparent", border: `1px solid ${view === k ? C.gold : C.line}`, padding: "6px 13px", borderRadius: 2, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <div style={{ fontFamily: serif, fontSize: 12, color: C.dim, marginBottom: 14 }}>
          Football field — implied value from eight methods. Where the bars overlap is where value 'wants to land'. Equity-basis methods (P/E, book equity) bridge to EV via net debt. Based on {yrs[i]}.
        </div>

        {/* football field */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, padding: "18px 16px 8px" }}>
          {displayRows.map((r, k) => {
            const lo = Math.min(r.dlo, r.dhi), hi = Math.max(r.dlo, r.dhi);
            const left = xp(lo), width = Math.max(xp(hi) - xp(lo), 0.4);
            const mid = (lo + hi) / 2;
            return (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: serif, fontSize: 13, color: C.ink, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{r.sub}</div>
                </div>
                <div style={{ position: "relative", height: 26 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 12, height: 1, background: C.line }} />
                  {r.point ? (
                    <div style={{ position: "absolute", left: `${left}%`, top: 6, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: C.gold }} />
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.ink, whiteSpace: "nowrap" }}>{fk(r.dlo)}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 4, height: 18, background: C.goldFill, border: `1px solid ${C.goldMid}`, borderRadius: 2 }} />
                      <div style={{ position: "absolute", left: `${xp(mid)}%`, top: 8, transform: "translateX(-50%)", width: 8, height: 8, borderRadius: 4, background: C.gold }} />
                      <span style={{ position: "absolute", left: `${left}%`, top: 4, transform: "translate(-102%,2px)", fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap" }}>{fk(lo)}</span>
                      <span style={{ position: "absolute", left: `${xp(hi)}%`, top: 4, transform: "translate(6%,2px)", fontFamily: mono, fontSize: 9.5, color: C.dim, whiteSpace: "nowrap" }}>{fk(hi)}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {/* axis */}
          <div style={{ gridColumn: "2", marginLeft: 160, marginTop: 4, borderTop: `1px solid ${C.line}`, paddingTop: 4, display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 9, color: C.faint }}>
            <span>{fk(axisMin)}</span><span>{fk((axisMin + axisMax) / 2)}</span><span>{fk(axisMax)}</span>
          </div>
          <div style={{ textAlign: "center", fontFamily: serif, fontSize: 11, color: C.faint, fontStyle: "italic", marginTop: 2 }}>{unitLabel}</div>
        </div>

        <div style={{ fontFamily: serif, fontSize: 12, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
          Convention flagged for verification: equity methods bridge to EV as <span style={{ color: C.gold }}>EV = equity value + net debt</span>, net debt = interest-bearing debt − operating cash. {data.company} shows net cash, so its P/E and book-equity bars sit below their equity values. If bang-labs uses gross debt or a different cash line, these two bars shift.
        </div>

        <div style={{ fontFamily: mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          S. GUERRAZ, CFA, MBA · SLICE 4/4 VALUATION · MODEL COMPLETE: STATEMENTS · PERFORMANCE · HEALTH · VALUATION
        </div>
      </div>
    </div>
  );
}

const btnGhost = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,240,233,0.55)", background: "transparent", border: "1px solid rgba(244,240,233,0.13)", padding: "5px 11px", borderRadius: 2, cursor: "pointer" };
const btnGold = { fontFamily: mono, fontSize: 10, color: "rgb(25,60,63)", background: "rgb(198,165,83)", border: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer" };
