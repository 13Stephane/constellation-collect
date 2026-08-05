import { useState, useMemo } from "react";

/* Constellation financial model — SLICE 1: statements
   Editable income statement + balance sheet with computed subtotals.
   Loads bang-labs schema-v2 JSON (paste/upload). Formulas verified against
   the ASML export: GP=Rev-CoS, EBITDA=GP-SGA, EBIT=EBITDA-Dep,
   IBT=EBIT+IntInc-IntExp, NI=IBT-Tax. Balance checks to zero.
   Next slices: performance (ROIC/EVA/FOCF), health, valuation. */

const C = {
  bg: "rgb(25,60,63)", ink: "rgb(244,240,233)",
  dim: "rgba(244,240,233,0.55)", faint: "rgba(244,240,233,0.30)",
  line: "rgba(244,240,233,0.13)", panel: "rgba(244,240,233,0.035)",
  gold: "rgb(198,165,83)", goldDim: "rgba(198,165,83,0.4)",
  edit: "rgba(198,165,83,0.9)", comp: "rgba(244,240,233,0.5)", red: "rgb(200,120,100)"
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";

/* ---- sample dataset (ASML export, so it renders immediately) ---- */
const SAMPLE = {
  schemaVersion: 2, company: "ASML Holding NV", unit: "EUR millions",
  years: [2020, 2021, 2022, 2023, 2024],
  income: {
    revenue: [13978.5, 18611, 21173.4, 27558.5, 28262.9],
    costOfSales: [6873.6, 8505.6, 10119.2, 12989.3, 13268.7],
    depreciation: [475.2, 454.6, 580.3, 733.2, 913.3],
    sga: [2578.2, 2900.7, 3973.2, 4793.7, 5058.3],
    interestIncome: [8.4, 10, 16.2, 193.9, 182.4],
    interestExpense: [43.3, 54.6, 60.8, 152.7, 162.6],
    incomeTaxes: [551.5, 1021.4, 969.9, 1435.8, 1680.6],
  },
  balance: {
    operatingCash: [6049.4, 6951.8, 7268.3, 7004.7, 12735.9],
    otherCurrentAssets: [9880.6, 11238.4, 15796.6, 17389.2, 18001.5],
    ppe: [2470.3, 2982.7, 3944.2, 5493.2, 6846.8],
    otherOperatingAssets: [8867.1, 9058.1, 9291.3, 10070.4, 11005.4],
    accountsPayable: [1377.9, 2116.3, 2565.2, 2347.3, 3500.4],
    otherNonInterestLiab: [5210.2, 9672.6, 14672.2, 13927.3, 15540.7],
    longTermDebt: [6813.9, 8301.5, 10252.2, 10230.5, 11071.7],
    equity: [13865.4, 10140.6, 8810.8, 13452.4, 18476.8],
  },
  assumptions: { taxRate: 0.258, wacc: 0.1 },
  sharesOutstanding: [416.514034, 402.601613, 394.589411, 393.421721, 393.28372],
  labels: { costOfSales: "Production costs (ex. D&A)", depreciation: "Depreciation & amortisation", sga: "R&D, sales, admin., other op. expenses (ex. D&A)" },
};

const fmt = (v) => v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString();

export default function App() {
  const [data, setData] = useState(SAMPLE);
  const [edit, setEdit] = useState(null); // {section, key, i}
  const [draft, setDraft] = useState("");
  const [showLoad, setShowLoad] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const yrs = (data && Array.isArray(data.years)) ? data.years : [];
  const inc = (data && data.income) ? data.income : {};
  const bal = (data && data.balance) ? data.balance : {};
  const lab = (data && data.labels) || {};
  // safe cell access: returns 0 for any missing array/index
  const cell = (obj, key, i) => {
    const arr = obj && obj[key];
    return Array.isArray(arr) && typeof arr[i] === "number" ? arr[i] : 0;
  };

  // ---- computed income subtotals ----
  const comp = useMemo(() => {
    const n = yrs.length, z = () => Array(n).fill(0);
    const gp = z(), ebitda = z(), ebit = z(), ibt = z(), ni = z(), totOpex = z();
    for (let i = 0; i < n; i++) {
      gp[i] = cell(inc, "revenue", i) - cell(inc, "costOfSales", i);
      totOpex[i] = cell(inc, "sga", i) + cell(inc, "depreciation", i);
      ebitda[i] = gp[i] - cell(inc, "sga", i);
      ebit[i] = ebitda[i] - cell(inc, "depreciation", i);
      ibt[i] = ebit[i] + cell(inc, "interestIncome", i) - cell(inc, "interestExpense", i);
      ni[i] = ibt[i] - cell(inc, "incomeTaxes", i);
    }
    // balance subtotals
    const tca = z(), ta = z(), tncl = z(), tle = z(), chk = z();
    for (let i = 0; i < n; i++) {
      tca[i] = cell(bal, "operatingCash", i) + cell(bal, "otherCurrentAssets", i);
      ta[i] = tca[i] + cell(bal, "ppe", i) + cell(bal, "otherOperatingAssets", i);
      tncl[i] = cell(bal, "accountsPayable", i) + cell(bal, "otherNonInterestLiab", i);
      tle[i] = tncl[i] + cell(bal, "longTermDebt", i) + cell(bal, "equity", i);
      chk[i] = ta[i] - tle[i];
    }
    return { gp, ebitda, ebit, ibt, ni, totOpex, tca, ta, tncl, tle, chk };
  }, [data]);

  const startEdit = (section, key, i, val) => { setEdit({ section, key, i }); setDraft(String(val)); };
  const commitEdit = () => {
    if (!edit) return;
    const v = parseFloat(draft.replace(/,/g, ""));
    if (!isNaN(v)) {
      setData(d => {
        const nd = JSON.parse(JSON.stringify(d));
        nd[edit.section][edit.key][edit.i] = v;
        return nd;
      });
    }
    setEdit(null);
  };

  const loadJson = () => {
    try {
      const p = JSON.parse(pasteText);
      if (!p.income || !p.balance || !p.years) throw new Error("Expected schema-v2 {years, income, balance}.");
      setData(p); setShowLoad(false); setPasteText(""); setLoadErr("");
    } catch (e) { setLoadErr(String(e.message || e)); }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { setPasteText(String(r.result)); };
    r.readAsText(f);
  };

  // ---- row renderers ----
  const EditRow = ({ section, key: k, label, bold }) => (
    <tr>
      <td style={{ ...tdLabel, fontWeight: bold ? 700 : 400 }}>{label}</td>
      {yrs.map((_, i) => {
        const editing = edit && edit.section === section && edit.key === k && edit.i === i;
        return (
          <td key={i} style={tdNum} onClick={() => startEdit(section, k, i, cell(data[section] || {}, k, i))}>
            {editing ? (
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEdit(null); }}
                style={inputStyle} />
            ) : (
              <span style={{ color: C.edit, borderBottom: `1px dashed ${C.goldDim}`, cursor: "text" }}>{fmt(cell(data[section] || {}, k, i))}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
  const CompRow = ({ vals, label, bold, highlight }) => (
    <tr style={highlight ? { background: "rgba(198,165,83,0.06)" } : {}}>
      <td style={{ ...tdLabel, fontStyle: "italic", fontWeight: bold ? 700 : 400, color: bold ? C.ink : C.comp }}>{label}</td>
      {vals.map((v, i) => (
        <td key={i} style={{ ...tdNum, fontStyle: "italic", color: bold ? C.ink : C.comp }}>{fmt(v)}</td>
      ))}
    </tr>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "26px 18px 60px", fontFamily: serif }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", color: C.dim, textTransform: "uppercase", marginBottom: 6 }}>Constellation · financial model · slice 1 of 4 (statements)</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, margin: 0, color: C.ink }}>{data.company} <span style={{ color: C.dim, fontSize: 15 }}>· {data.unit}</span></h1>
          <button onClick={() => setShowLoad(s => !s)} style={btnGhost}>{showLoad ? "cancel" : "load schema-v2 JSON"}</button>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, margin: "6px 0 4px" }}>
          <span style={{ color: C.edit }}>gold dashed</span> = editable input · <span style={{ fontStyle: "italic", color: C.comp }}>italic</span> = computed
        </div>

        {showLoad && (
          <div style={{ margin: "12px 0 20px" }}>
            <input type="file" accept=".json" onChange={onFile} style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginBottom: 8, display: "block" }} />
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="…or paste a schema-v2 JSON here" style={{ width: "100%", minHeight: 80, boxSizing: "border-box", fontFamily: mono, fontSize: 11, color: C.ink, background: "rgba(0,0,0,0.25)", border: `1px solid ${C.line}`, borderRadius: 3, padding: "10px 12px", outline: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
              <button onClick={loadJson} style={btnGold}>Load</button>
              {loadErr && <span style={{ fontFamily: mono, fontSize: 10, color: C.red }}>{loadErr}</span>}
            </div>
          </div>
        )}

        {/* INCOME STATEMENT */}
        <SectionTitle>Income statement</SectionTitle>
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
            <tbody>
              <EditRow section="income" key="revenue" label="Revenue (Net sales)" />
              <EditRow section="income" key="costOfSales" label={lab.costOfSales || "Cost of sales"} />
              <CompRow vals={comp.gp} label="Gross profit" />
              <EditRow section="income" key="depreciation" label={lab.depreciation || "Depreciation"} />
              <EditRow section="income" key="sga" label={lab.sga || "SG&A"} />
              <CompRow vals={comp.totOpex} label="Total operating expense" />
              <CompRow vals={comp.ebitda} label="EBITDA" highlight />
              <CompRow vals={comp.ebit} label="EBIT (income before interest & taxes)" bold />
              <EditRow section="income" key="interestIncome" label="Interest income" />
              <EditRow section="income" key="interestExpense" label="Interest expense" />
              <CompRow vals={comp.ibt} label="Income before taxes" />
              <EditRow section="income" key="incomeTaxes" label="Income taxes" />
              <CompRow vals={comp.ni} label="Net income" bold />
            </tbody>
          </table>
        </div>

        {/* BALANCE SHEET */}
        <SectionTitle>Balance sheet</SectionTitle>
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead><tr><th style={thLabel}></th>{yrs.map(y => <th key={y} style={thYear}>{y}</th>)}</tr></thead>
            <tbody>
              <SubHead cols={yrs.length}>Current assets</SubHead>
              <EditRow section="balance" key="operatingCash" label="Operating cash" />
              <EditRow section="balance" key="otherCurrentAssets" label="Other current operational assets" />
              <CompRow vals={comp.tca} label="Total current assets" />
              <EditRow section="balance" key="ppe" label="Property, plant & equipment, net" />
              <EditRow section="balance" key="otherOperatingAssets" label="R&D / other operating assets, net" />
              <CompRow vals={comp.ta} label="Total assets" bold />
              <SubHead cols={yrs.length}>Current liabilities (non-interest)</SubHead>
              <EditRow section="balance" key="accountsPayable" label="Accounts payable & accrued (non-interest)" />
              <EditRow section="balance" key="otherNonInterestLiab" label="Other non-interest current liabilities" />
              <CompRow vals={comp.tncl} label="Total non-interest current liabilities" />
              <EditRow section="balance" key="longTermDebt" label="Short & long term debt (interest paying)" />
              <EditRow section="balance" key="equity" label="Total stockholders equity" />
              <CompRow vals={comp.tle} label="Total liabilities & equity" bold />
              <CompRow vals={comp.chk} label="Balance check (assets − L&E)" />
            </tbody>
          </table>
        </div>

        {/* shares + assumptions */}
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginTop: 18, fontFamily: mono, fontSize: 11, color: C.dim }}>
          <div><span style={{ color: C.gold }}>Shares (m), latest:</span> {Array.isArray(data.sharesOutstanding) && data.sharesOutstanding.length ? Number(data.sharesOutstanding[yrs.length - 1] || 0).toFixed(1) : "—"}</div>
          <div><span style={{ color: C.gold }}>Tax rate:</span> {(((data.assumptions || {}).taxRate || 0) * 100).toFixed(1)}%</div>
          <div><span style={{ color: C.gold }}>WACC:</span> {(((data.assumptions || {}).wacc || 0) * 100).toFixed(1)}%</div>
        </div>

        <div style={{ fontFamily: mono, fontSize: 9, color: C.faint, letterSpacing: "0.08em", marginTop: 30, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          S. GUERRAZ, CFA, MBA · SLICE 1/4 STATEMENTS · NEXT: PERFORMANCE (ROIC/EVA/FOCF) · HEALTH · VALUATION · EDITS RECOMPUTE THE MODEL
        </div>
      </div>
    </div>
  );
}

/* ---- style helpers ---- */
const tableWrap = { overflowX: "auto", border: "1px solid rgba(244,240,233,0.13)", borderRadius: 3, marginBottom: 26 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 680 };
const thLabel = { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", position: "sticky", left: 0, background: "rgb(25,60,63)" };
const thYear = { textAlign: "right", padding: "10px 14px", borderBottom: "1px solid rgba(244,240,233,0.13)", fontFamily: mono, fontSize: 11, color: "rgba(244,240,233,0.55)" };
const tdLabel = { textAlign: "left", padding: "8px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: serif, fontSize: 13, color: "rgb(244,240,233)", position: "sticky", left: 0, background: "rgb(25,60,63)", whiteSpace: "nowrap" };
const tdNum = { textAlign: "right", padding: "8px 14px", borderBottom: "1px solid rgba(244,240,233,0.08)", fontFamily: mono, fontSize: 12.5, color: "rgb(244,240,233)", cursor: "pointer", whiteSpace: "nowrap" };
const inputStyle = { width: 90, fontFamily: mono, fontSize: 12.5, color: "rgb(244,240,233)", background: "rgba(0,0,0,0.3)", border: "1px solid rgb(198,165,83)", borderRadius: 2, padding: "2px 6px", textAlign: "right", outline: "none" };
const btnGhost = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,240,233,0.55)", background: "transparent", border: "1px solid rgba(244,240,233,0.13)", padding: "5px 11px", borderRadius: 2, cursor: "pointer" };
const btnGold = { fontFamily: mono, fontSize: 10, color: "rgb(25,60,63)", background: "rgb(198,165,83)", border: "none", padding: "7px 14px", borderRadius: 2, cursor: "pointer" };

function SectionTitle({ children }) {
  return <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgb(198,165,83)", margin: "8px 0 10px" }}>{children}</div>;
}
function SubHead({ children, cols }) {
  return <tr><td colSpan={cols + 1} style={{ padding: "10px 14px 4px", fontFamily: mono, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgb(198,165,83)", background: "rgb(25,60,63)" }}>{children}</td></tr>;
}
