import { useState, useMemo } from "react";

/* Constellation financial model — SLICE 3: health
   Solvency ratios from slice-1/2 inputs: interest coverage (EBIT/interest),
   debt/EBITDA, cost of debt (interest/debt), debt/equity.
   Verified against ASML. Formulas match the reference-panel definitions.
   Next: slice 4 valuation (football-field). */

const C = {
  bg: "rgb(25,60,63)", ink: "rgb(244,240,233)",
  dim: "rgba(244,240,233,0.55)", faint: "rgba(244,240,233,0.30)",
  line: "rgba(244,240,233,0.13)", panel: "rgba(244,240,233,0.035)",
  gold: "rgb(198,165,83)", green: "rgb(120,180,140)", red: "rgb(200,120,100)", blue: "rgb(130,160,200)"
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
  labels: {},
};

const x2 = v => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const pct2 = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";

/* tiny inline line chart */
function Spark({ vals, years, fmt, good = "up", height = 150 }) {
  const w = 100, pad = 8;
  const nums = vals.map(v => v == null || isNaN(v) ? null : v);
  const valid = nums.filter(v => v != null);
  const max = Math.max(...valid, 0), min = Math.min(...valid, 0);
  const range = max - min || 1;
  const pts = nums.map((v, i) => {
    if (v == null) return null;
    const x = pad + (i / (years.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (height - 2 * pad - 20);
    return { x, y, v, i };
  }).filter(Boolean);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  const trendUp = pts.length > 1 && pts[pts.length - 1].v >= pts[0].v;
  const color = good === "up" ? (trendUp ? C.green : C.red) : (trendUp ? C.red : C.green);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.2" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={color} />)}
      {last && <text x={last.x} y={last.y - 4} fontSize="6" fill={C.ink} textAnchor="end" fontFamily={mono}>{fmt(last.v)}</text>}
      {pts.map((p, i) => <text key={"y" + i} x={p.x} y={height - 4} fontSize="5.5" fill={C.faint} textAnchor="middle" fontFamily={mono}>{String(years[p.i]).slice(2)}</text>)}
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState(SAMPLE);
  const [showLoad, setShowLoad] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const yrs = data.years, inc = data.income, bal = data.balance;

  const m = useMemo(() => {
    const n = yrs.length, z = () => Array(n).fill(null);
    const ebit = z(), ebitda = z(), intCov = z(), debtEbitda = z(), costDebt = z(), debtEq = z();
    for (let i = 0; i < n; i++) {
      ebitda[i] = inc.revenue[i] - inc.costOfSales[i] - inc.sga[i];
      ebit[i] = ebitda[i] - inc.depreciation[i];
      intCov[i] = inc.interestExpense[i] ? ebit[i] / inc.interestExpense[i] : 0;
      debtEbitda[i] = ebitda[i] ? bal.longTermDebt[i] / ebitda[i] : null;
      costDebt[i] = bal.longTermDebt[i] ? inc.interestExpense[i] / bal.longTermDebt[i] : null;
      debtEq[i] = bal.equity[i] ? bal.longTermDebt[i] / bal.equity[i] : null;
    }
    return { ebit, ebitda, intCov, debtEbitda, costDebt, debtEq };
  }, [data]);

  const loadJson = () => { try { const p = JSON.parse(pasteText); if (!p.income || !p.balance) throw new Error("Expected schema-v2."); setData(p); setShowLoad(false); setPasteText(""); setLoadErr(""); } catch (e) { setLoadErr(String(e.message || e)); } };
  const onFile = e => { const fl = e.target.files?.[0]; if (!fl) return; const r = new FileReader(); r.onload = () => setPasteText(String(r.result)); r.readAsText(fl); };

  const Row = ({ label, vals, fmt, color }) => (
    <tr>
      <td style={tdLabel}>{label}</td>
      {vals.map((v, i) => <td key={i} style={{ ...tdNum, color: color ? color(v) : C.ink }}>{fmt(v)}</td>)}
    </tr>
  );

  // qualitative color thresholds (illustrative, editable later)
  const covColor = v => v == null ? C.dim : v >= 8 ? C.green : v >= 3 ? C.gold : C.red;
  const deColor = v => v == null ? C.dim : v <= 2 ? C.green : v <= 3.5 ? C.gold : C.red;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "26px 18px 60px", fontFamily: serif }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", color: C.dim, textTransform: "uppercase", marginBottom: 6 }}>Constellation · financial model · slice 3 of 4 (health)</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, margin: 0, color: C.ink }}>{data.company} <span style={{ color: C.dim, fontSize: 15 }}>· {data.unit}</span></h1>
          <button onClick={() => setShowLoad(s => !s)} style={btnGhost}>{showLoad ? "cancel" : "load JSON"}</button>
        </div>
        <div style={{ fontFamily: serif, fontSize: 13, color: C.dim, margin: "6px 0 18px", lineHeight: 1.5 }}>
          Solvency under stress. Interest coverage tells you how many times EBIT covers the interest bill; debt / EBITDA how many years of cash flow would repay the debt.
        </div>

        {showLoad && (
          <div style={{ marginBottom: 18 }}>
            <input type="file" accept=".json" onChange={onFile} style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginBottom: 8, display: "block" }} />
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="paste schema-v2 JSON" style={{ width: "100%", minHeight: 70, boxSizing: "border-box", fontFamily: mono, fontSize: 11, color: C.ink, background: "rgba(0,0,0,0.25)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "10px 12px", outline: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}><button onClick={loadJson} style={btnGold}>Load</button>{loadErr && <span style={{ fontFamily: mono, fontSize: 10, color: C.red }}>{loadErr}</span>}</div>
          </div>
        )}

        {/* two charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, padding: "14px 16px" }}>
            <div style={{ fontFamily: serif, fontSize: 14, color: C.ink, marginBottom: 4 }}>Interest coverage (EBIT / interest)</div>
            <Spark vals={m.intCov} years={yrs} fmt={x2} good="up" />
          </div>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 3, padding: "14px 16px" }}>
            <div style={{ fontFamily: serif, fontSize: 14, color: C.ink, marginBottom: 4 }}>Debt / EBITDA</div>
            <Spark vals={m.debtEbitda} years={yrs} fmt={x2} good="down" />
          </div>
        </div>

        {/* ratio table */}
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold, margin: "4px 0 10px" }}>Debt ratios</div>
        <div style={tableWrap}><table style={tableStyle}>
          <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
          <tbody>
            <Row label="Interest coverage (EBIT / interest)" vals={m.intCov} fmt={x2} color={covColor} />
            <Row label="Debt / EBITDA" vals={m.debtEbitda} fmt={x2} color={deColor} />
            <Row label="Cost of debt (interest / debt)" vals={m.costDebt} fmt={pct2} color={() => C.ink} />
            <Row label="Debt / Equity" vals={m.debtEq} fmt={x2} color={() => C.ink} />
          </tbody>
        </table></div>

        <div style={{ fontFamily: serif, fontSize: 12, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>
          Color thresholds are illustrative solvency bands (coverage: green ≥8x, amber ≥3x; debt/EBITDA: green ≤2x, amber ≤3.5x). Interest coverage reads 0.00x in any year where interest expense is zero.
        </div>

        <div style={{ fontFamily: mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", marginTop: 26, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          S. GUERRAZ, CFA, MBA · SLICE 3/4 HEALTH · VERIFIED AGAINST ASML · NEXT: SLICE 4 VALUATION (FOOTBALL-FIELD)
        </div>
      </div>
    </div>
  );
}

const tableWrap = { overflowX: "auto", border: "1px solid rgba(244,240,233,0.13)", borderRadius: 3, marginBottom: 16 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 620 };
const thLabel = { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", position: "sticky", left: 0, background: "rgb(25,60,63)" };
const thYear = { textAlign: "right", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", fontFamily: mono, fontSize: 11, color: "rgba(244,240,233,0.55)" };
const tdLabel = { textAlign: "left", padding: "9px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: serif, fontSize: 13, color: "rgb(244,240,233)", position: "sticky", left: 0, background: "rgb(25,60,63)", whiteSpace: "nowrap" };
const tdNum = { textAlign: "right", padding: "9px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: mono, fontSize: 12.5, whiteSpace: "nowrap" };
const btnGhost = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,240,233,0.55)", background: "transparent", border: "1px solid rgba(244,240,233,0.13)", padding: "5px 11px", borderRadius: 2, cursor: "pointer" };
const btnGold = { fontFamily: mono, fontSize: 10, color: "rgb(25,60,63)", background: "rgb(198,165,83)", border: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer" };
