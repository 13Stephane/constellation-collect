# STATE — Constellation /collect agent (read this first)

*Orientation for a future Claude session. Last updated 2026-07-22.*

## What this is
A Claude Managed Agent (**`constellation-collect`**) that turns a European listed **ticker** into a provenance-stamped **schema-v2** dataset (+ a constructed W1 Market WACC band + a snapshot `.xlsx`) that loads into Constellation's existing 4-slice React model. It's the missing `/collect` step for the front-end at `finance.bang-labs.eu`. First name run: **ASML**.

Full design rationale and interview decisions live in `build-sheet.json` (the single source of truth). The plan for what's next is `NEXT-DIRECTIONS.md`.

## Live objects (in the founder's Anthropic account, `default` workspace)
| Primitive | ID | Notes |
|---|---|---|
| 🤖 agent | `agent_013upt6mfNhXigYgmMgkfQgG` (v1) | model `claude-opus-4-8`; [Console](https://platform.claude.com/workspaces/default/agents/agent_013upt6mfNhXigYgmMgkfQgG) |
| 📦 environment | `env_01XvikV6PdymsJQ7VQWFA6ry` | cloud, networking unrestricted, pip pandas/numpy/openpyxl |
| 📄 custom skill | `skill_01JvdFEp3XLBByZjDcebp58C` | `constellation-valuation`, uploaded from `constellation-valuation/SKILL.md` |
| ▶️ session (ASML) | `sesn_01L6DpzzsFsCnEXSsTETRsX6` | **terminated + archived** — see run outcome below |

All IDs are in `IDS.env`. The API key is in `.env` (chmod 600, gitignored) — **it hit this session's transcript via a harness echo, so it should be rotated.**

## First run outcome (ASML)
Launched, ran ~35 tool calls (web-fetching ASML + semiconductor-equipment peers KLAC/BESI), then **interrupted by the founder to stop token spend** before it finished. Grader verdict: `interrupted` (not failed). Usage: **466,325 cache-read + 28 input + 13,383 output tokens ≈ $0.57** (Opus 4.8; almost all input was cache-read at 0.1×). No deliverables were fetched (interrupted before completion). A full uninterrupted run would be ~$1–2.

## File map
| Path | What it is |
|---|---|
| `build-sheet.json` | **source of truth** — every design decision, primitives, evals, next-directions |
| `agent.json` / `environment.json` | API payloads (model + skill_id are substituted at launch by `launch.sh`) |
| `constellation-valuation/SKILL.md` | the house-method skill: schema-v2 contract, locked accounting conventions, W1 CAPM/band, provenance + honesty rules |
| `outcome.md` | the 6-criterion Outcome rubric (the grader) |
| `first_prompt.txt` | the kickoff task (ASML, relative dates) |
| `front-end/constellation_model_slice{1..4}.jsx` | the founder's **existing** 4-slice React model (statements · performance · health · valuation). **These are the real front-end** — copied here for reference |
| `constellation-model.template.html` + `build-viewer.py` | single-file render of the 4 slices with injected DATA + the inject step (the v0 auto-load viewer) |
| `outputs/ASML_model.html` | the viewer rendered with the founder's hand-verified ASML SAMPLE (works — open in a browser) |
| `evals/case-01/expected.json` | golden ASML schema-v2 (the SAMPLE from the slices; balances to zero) — the regression baseline |
| `evals/README.md` | how to grade extraction vs the golden (statement inputs matched; WACC + multiples judged) |
| `launch.sh` / `poll.sh` / `fetch-outputs.sh` / `run-evals.sh` | resumable launch, poll, download+build-viewer, regression harness |
| `LAUNCH.md` | how to run it end-to-end |
| `agent-overview.html` + `overview.css` | the live-schema overview page (open in a browser) |
| `NEXT-DIRECTIONS.md` | **the build plan** for the generic tool + the scenario module |

## The schema-v2 contract (what the agent produces / the front-end consumes)
Keys: `schemaVersion, company, unit, years[], income{revenue, costOfSales, depreciation, sga, interestIncome, interestExpense, incomeTaxes}, balance{operatingCash, otherCurrentAssets, ppe, otherOperatingAssets, accountsPayable, otherNonInterestLiab, longTermDebt, equity}, assumptions{taxRate, wacc}, sharesOutstanding[], valuationMultiples{industry, evRevenue, evEbitda, evEbit, pe, growth}, labels{}`. **Balance identity (must hold every year):** `operatingCash + otherCurrentAssets + ppe + otherOperatingAssets == accountsPayable + otherNonInterestLiab + longTermDebt + equity`. Locked conventions (NOPLAT, ROIC on prior-year IC, capex-incl, net-debt, DCF-Gordon) are in `constellation-valuation/SKILL.md` §2.

## Decisions locked in the interview
Both reads (relational ROIC-vs-WACC + DCF) · web-fetch for data (v0; data-API is the upgrade) · single-name stated beta (arena beta is later) · auto-load viewer via injected DATA · on-demand per ticker (no schedule) · agent proposes DCF assumptions · golden set = the founder's ASML SAMPLE · scenario module chosen for **v1**.

## Known bug carried from the original slices
`slice1.jsx` passes the data key via a prop literally named `key` (`<EditRow key="revenue" …>`). React reserves `key`, so it never reaches the component → every editable input row renders `0`. Fixed in the merged viewer here (renamed to `field`); **the same one-line fix is still needed in the founder's live `slice1.jsx`** (`key=` → `field=` on each `<EditRow>` + destructure `field: k`).

## To re-run (leaner)
See `LAUNCH.md`. To cut cost: lower `max_iterations` to 1 in the kickoff (`launch.sh` step 6 / `first_prompt` flow) and/or switch the model to `claude-sonnet-4-6` for extraction. Agent/env/skill sit idle at zero cost until a session runs.
