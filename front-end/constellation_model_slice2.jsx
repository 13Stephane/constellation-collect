import { useState, useMemo } from "react";

/* Constellation financial model — SLICE 2: performance
   Builds on slice-1 statements. Adds Step 1 invested capital, Step 2 FOCF,
   Step 3 ROIC vs WACC + DuPont, Step 4 EVA.
   Formulas verified against ASML: IC assets=finance (check 0), DuPont product
   reproduces ROIC exactly, EVA = spread x prior-year IC.
   Conventions locked: NOPLAT = EBIT x (1-taxRate); ROIC uses PRIOR-year IC as base
   (year 1 blank); capex(incl) = d(net PPE) + depreciation.
   Slice 1 statement tables are folded to keep focus; expand to edit inputs.
   Next: slice 3 health, slice 4 valuation. */

const C = {
  bg: "rgb(25,60,63)", ink: "rgb(244,240,233)",
  dim: "rgba(244,240,233,0.55)", faint: "rgba(244,240,233,0.30)",
  line: "rgba(244,240,233,0.13)", panel: "rgba(244,240,233,0.035)",
  gold: "rgb(198,165,83)", goldDim: "rgba(198,165,83,0.4)",
  edit: "rgba(198,165,83,0.9)", comp: "rgba(244,240,233,0.5)",
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
  labels: { costOfSales: "Production costs (ex. D&A)", depreciation: "Depreciation & amortisation", sga: "R&D, sales, admin., other op. expenses (ex. D&A)" },
};

const f0 = v => v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString();
const f1 = v => v == null || isNaN(v) ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(1) + "%";
const x2 = v => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";

export default function App() {
  const [data, setData] = useState(SAMPLE);
  const [showLoad, setShowLoad] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [showStmt, setShowStmt] = useState(false);

  const yrs = data.years, inc = data.income, bal = data.balance;
  const tr = data.assumptions.taxRate, wacc = data.assumptions.wacc;

  const m = useMemo(() => {
    const n = yrs.length, z = () => Array(n).fill(null);
    const ebit = z(), noplat = z(), owc = z(), ppeOther = z(), ic = z(), icFin = z();
    for (let i = 0; i < n; i++) {
      ebit[i] = inc.revenue[i] - inc.costOfSales[i] - inc.sga[i] - inc.depreciation[i];
      noplat[i] = ebit[i] * (1 - tr);
      owc[i] = (bal.operatingCash[i] + bal.otherCurrentAssets[i]) - (bal.accountsPayable[i] + bal.otherNonInterestLiab[i]);
      ppeOther[i] = bal.ppe[i] + bal.otherOperatingAssets[i];
      ic[i] = owc[i] + ppeOther[i];
      icFin[i] = bal.equity[i] + bal.longTermDebt[i];
    }
    // FOCF
    const grossOCF = z(), dWC = z(), capexIncl = z(), dOther = z(), totInv = z(), focf = z();
    for (let i = 0; i < n; i++) {
      grossOCF[i] = noplat[i] + inc.depreciation[i];
      if (i === 0) { dWC[i] = 0; capexIncl[i] = 0; dOther[i] = 0; totInv[i] = 0; focf[i] = grossOCF[i]; continue; }
      dWC[i] = owc[i] - owc[i - 1];
      capexIncl[i] = (bal.ppe[i] - bal.ppe[i - 1]) + inc.depreciation[i];
      dOther[i] = bal.otherOperatingAssets[i] - bal.otherOperatingAssets[i - 1];
      totInv[i] = dWC[i] + capexIncl[i] + dOther[i];
      focf[i] = grossOCF[i] - dWC[i] - capexIncl[i] - dOther[i];
    }
    // ROIC / EVA (prior-year IC base)
    const roic = z(), spread = z(), eva = z(), ebitMargin = z(), capTurn = z();
    for (let i = 1; i < n; i++) {
      roic[i] = noplat[i] / ic[i - 1];
      spread[i] = roic[i] - wacc;
      eva[i] = spread[i] * ic[i - 1];
      ebitMargin[i] = ebit[i] / inc.revenue[i];
      capTurn[i] = inc.revenue[i] / ic[i - 1];
    }
    return { ebit, noplat, owc, ppeOther, ic, icFin, grossOCF, dWC, capexIncl, dOther, totInv, focf, roic, spread, eva, ebitMargin, capTurn };
  }, [data]);

  const loadJson = () => {
    try { const p = JSON.parse(pasteText); if (!p.income || !p.balance) throw new Error("Expected schema-v2."); setData(p); setShowLoad(false); setPasteText(""); setLoadErr(""); }
    catch (e) { setLoadErr(String(e.message || e)); }
  };
  const onFile = e => { const fl = e.target.files?.[0]; if (!fl) return; const r = new FileReader(); r.onload = () => setPasteText(String(r.result)); r.readAsText(fl); };

  const Row = ({ label, vals, fmt = f0, color, bold, sub, first0 }) => (
    <tr style={bold ? { background: "rgba(198,165,83,0.06)" } : {}}>
      <td style={{ ...tdLabel, fontWeight: bold ? 700 : 400, color: sub ? C.dim : C.ink, paddingLeft: sub ? 26 : 14 }}>{label}</td>
      {vals.map((v, i) => (
        <td key={i} style={{ ...tdNum, color: color ? color(v, i) : (bold ? C.ink : C.ink) }}>
          {i === 0 && first0 ? "—" : fmt(v)}
        </td>
      ))}
    </tr>
  );
  const green = v => v > 0 ? C.green : v < 0 ? C.red : C.dim;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "26px 18px 60px", fontFamily: serif }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", color: C.dim, textTransform: "uppercase", marginBottom: 6 }}>Constellation · financial model · slice 2 of 4 (performance)</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, margin: 0, color: C.ink }}>{data.company} <span style={{ color: C.dim, fontSize: 15 }}>· {data.unit}</span></h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowStmt(s => !s)} style={btnGhost}>{showStmt ? "hide inputs" : "show inputs"}</button>
            <button onClick={() => setShowLoad(s => !s)} style={btnGhost}>{showLoad ? "cancel" : "load JSON"}</button>
          </div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, margin: "6px 0 16px" }}>tax {(tr * 100).toFixed(1)}% · WACC {(wacc * 100).toFixed(1)}% · ROIC on prior-year invested capital</div>

        {showLoad && (
          <div style={{ marginBottom: 18 }}>
            <input type="file" accept=".json" onChange={onFile} style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginBottom: 8, display: "block" }} />
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="paste schema-v2 JSON" style={{ width: "100%", minHeight: 70, boxSizing: "border-box", fontFamily: mono, fontSize: 11, color: C.ink, background: "rgba(0,0,0,0.25)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "10px 12px", outline: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}><button onClick={loadJson} style={btnGold}>Load</button>{loadErr && <span style={{ fontFamily: mono, fontSize: 10, color: C.red }}>{loadErr}</span>}</div>
          </div>
        )}

        {showStmt && (
          <div style={{ ...tableWrap, marginBottom: 26 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thLabel}>Inputs ($ {data.unit.split(" ")[0]})</th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
              <tbody>
                <Row label="Revenue" vals={inc.revenue} />
                <Row label="EBIT (computed)" vals={m.ebit} bold />
                <Row label="Operating working capital" vals={m.owc} sub />
                <Row label="PP&E + other op. assets" vals={m.ppeOther} sub />
              </tbody>
            </table>
          </div>
        )}

        {/* Step 1 */}
        <Step n="1" title="Invested capital" note="Operating working capital = current assets − non-interest current liabilities. Financing side = equity + interest-bearing debt." />
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="Operating working capital" vals={m.owc} />
            <Row label="PP&E + other operating assets" vals={m.ppeOther} />
            <Row label="Invested capital (assets side)" vals={m.ic} bold />
            <Row label="Equity + interest-bearing debt" vals={m.icFin} />
            <Row label="Check (finance − assets)" vals={m.ic.map((v, i) => m.icFin[i] - v)} color={() => C.dim} />
          </tbody>
        </table></div>

        {/* Step 2 */}
        <Step n="2" title="Free operating cash flow" note="NOPLAT = EBIT × (1 − tax). FOCF = NOPLAT + depreciation − ΔWC − capex − ΔOther. First year has no baseline, so investment lines are zero." />
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="EBIT" vals={m.ebit} />
            <Row label={`× (1 − ${(tr * 100).toFixed(1)}%) = NOPLAT`} vals={m.noplat} />
            <Row label="+ Depreciation" vals={inc.depreciation} />
            <Row label="Gross operating cash flow" vals={m.grossOCF} bold />
            <Row label="Δ Operating working capital" vals={m.dWC} first0 color={green} />
            <Row label="Δ Net PP&E (capex incl. dep)" vals={m.capexIncl} first0 />
            <Row label="Δ Other operating assets" vals={m.dOther} first0 color={green} />
            <Row label="Total operating (dis)investment" vals={m.totInv} first0 />
            <Row label="Free operating cash flow" vals={m.focf} bold color={green} />
          </tbody>
        </table></div>

        {/* Step 3 */}
        <Step n="3" title="Return on invested capital" note="ROIC = NOPLAT / prior-year invested capital. The spread vs WACC shows whether the business earns its cost of capital." />
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="NOPLAT" vals={m.noplat} />
            <Row label="Invested capital (prior year)" vals={yrs.map((_, i) => i === 0 ? null : m.ic[i - 1])} first0 />
            <Row label="ROIC" vals={m.roic} fmt={pct} first0 color={(v) => v > wacc ? C.green : C.red} />
            <Row label="WACC" vals={yrs.map((_, i) => i === 0 ? null : wacc)} fmt={pct} first0 color={() => C.dim} />
            <Row label="Spread (ROIC − WACC)" vals={m.spread} fmt={pct} first0 color={green} bold />
          </tbody>
        </table></div>

        {/* DuPont */}
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, margin: "4px 0 8px" }}>DuPont decomposition · ROIC = EBIT margin × capital turnover × (1 − tax)</div>
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="EBIT margin (EBIT / sales)" vals={m.ebitMargin} fmt={pct} first0 color={() => C.green} />
            <Row label="Capital turnover (sales / IC)" vals={m.capTurn} fmt={x2} first0 color={() => C.gold} />
            <Row label="(1 − tax)" vals={yrs.map((_, i) => i === 0 ? null : 1 - tr)} fmt={x2} first0 color={() => C.dim} />
            <Row label="= ROIC (product)" vals={m.roic} fmt={pct} first0 bold color={() => C.blue} />
          </tbody>
        </table></div>

        {/* Step 4 */}
        <Step n="4" title="Economic profit (EVA)" note="EVA = (ROIC − WACC) × invested capital. Positive EVA means value created above the cost of capital." />
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="Spread" vals={m.spread} fmt={pct} first0 color={green} />
            <Row label="× Invested capital (prior year)" vals={yrs.map((_, i) => i === 0 ? null : m.ic[i - 1])} first0 />
            <Row label="Economic profit (EVA)" vals={m.eva} first0 bold color={green} />
          </tbody>
        </table></div>

        <div style={{ fontFamily: mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", marginTop: 24, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          S. GUERRAZ, CFA, MBA · SLICE 2/4 PERFORMANCE · VERIFIED: IC ASSETS=FINANCE, DUPONT PRODUCT=ROIC, EVA=SPREAD×IC · NEXT: HEALTH · VALUATION
        </div>
      </div>
    </div>
  );
}

const tableWrap = { overflowX: "auto", border: "1px solid rgba(244,240,233,0.13)", borderRadius: 3, marginBottom: 22 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 680 };
const thLabel = { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", position: "sticky", left: 0, background: "rgb(25,60,63)", fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,240,233,0.4)" };
const thYear = { textAlign: "right", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", fontFamily: mono, fontSize: 11, color: "rgba(244,240,233,0.55)" };
const tdLabel = { textAlign: "left", padding: "8px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: serif, fontSize: 13, color: "rgb(244,240,233)", position: "sticky", left: 0, background: "rgb(25,60,63)", whiteSpace: "nowrap" };
const tdNum = { textAlign: "right", padding: "8px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: mono, fontSize: 12.5, whiteSpace: "nowrap" };
const btnGhost = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,240,233,0.55)", background: "transparent", border: "1px solid rgba(244,240,233,0.13)", padding: "5px 11px", borderRadius: 2, cursor: "pointer" };
const btnGold = { fontFamily: mono, fontSize: 10, color: "rgb(25,60,63)", background: "rgb(198,165,83)", border: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer" };

function Step({ n, title, note }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: serif, fontSize: 17, color: C.ink }}><span style={{ color: C.gold, fontFamily: mono, fontSize: 12 }}>Step {n} </span>{title}</div>
      <div style={{ fontFamily: serif, fontSize: 12, color: C.dim, margin: "3px 0 8px", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}
