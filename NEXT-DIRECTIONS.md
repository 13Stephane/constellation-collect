# Next directions — Constellation /collect agent

> Read `STATE.md` first for what already exists (files, live IDs, decisions, run outcome). This file is the forward plan.
> v0 shipped: ticker → provenance-stamped schema-v2 JSON (balances to zero) + constructed W1 WACC band + snapshot xlsx, auto-loaded into the existing 4-slice front-end. Two tracks build on it.

## The two decisions that gate everything

1. **Data source.** Pick a fundamentals API / filings provider (needs a credential/subscription) or stay on web-fetch. This is the single biggest lever — it fixes provenance, per-name cost, *and* extraction reliability at once, and it unblocks both tracks below. Until decided, both tracks work but stay brittle/expensive on arbitrary names.
2. **Projection compute (scenario track).** Deterministic Python compute layer (recommended — matches the reproducibility-is-the-sale principle; no LLM arithmetic drift) vs. model-computed math. Decide before building the projection engine.

---

# Track A — Generic version of the tool

Goal: runs reliably on *any* listed name (not just ASML) and is productized (interactive front-end). The ticker is **already a parameter** and the balance-check-to-zero gate already enforces correctness — so v0 is a working narrow slice. Gaps, in build order:

**A1. Real data source (the load-bearing item).**
*Why:* web-fetch is brittle, provenance-weak, and token-heavy per name (the ASML run spent most tokens re-reading fetched pages).
*How:* add a fundamentals/filings provider as a 🔌 MCP server + a 🔐 vault `environment_variable` or MCP credential; tighten the environment to `networking: limited` on the provider hosts; keep source+date on every schema-v2 field. Removes the per-run scrape variance and the manual cross-check burden.
*Needs:* a provider decision + credential (see gating decision 1).

**A2. Sector-aware canonical mapping + arena registry.**
*Why:* `constellation-valuation/SKILL.md`'s schema-v2 is industrial/airport-shaped. Banks, insurers, and REITs break it (interest income *is* revenue; no comparable "operating cash" line; EV/EBITDA is meaningless for a bank).
*How:* an arena registry keyed by sector holding {peer set, beta basis, multiple bands (evRevenue/evEbitda/evEbit/pe/growth)} per arena; extend the skill with per-sector mapping rules; and **explicitly scope supported sectors** (start: tech/industrials/consumer; defer financials/REITs with a stated "not yet" guard rather than emitting wrong numbers). This registry is **shared with Track B's driver registry**.

**A3. Reporting normalization.**
*Why:* generic means multi-currency, IFRS vs local GAAP, and misaligned fiscal calendars.
*How:* pin conventions in the skill — reporting currency per name, statutory tax source, fiscal-year alignment; record the choice per run in `sources.json`.

**A4. Interactive front-end (type ticker → run → live-load).**
*Why:* v0 delivery is a static injected-DATA viewer; a product needs the `/collect` page to trigger a run and load the result live.
*How:* a small backend holding the API key calls `POST /v1/sessions` + `user.define_outcome` (or a deployment `/run`); the front-end polls the session, downloads the schema-v2 JSON from the Files API (`scope_id=<session_id>`), and `setData()`s it into the slices. Backend is required because the key can't live in the browser.

**A5. Multi-tenant (only if customers touch it).**
*How:* one 🔐 vault per end-user, `external_user_id` in session metadata, per-user cost caps. Skip if it stays an internal research tool.

**A6. Eval coverage.**
*Why:* only ASML is a golden case today.
*How:* add `evals/case-02+/` golden schema-v2 for 4–6 names across the supported sectors; run `run-evals.sh` before promoting any agent version. Extraction targets matched within tolerance; balance check must reach zero.

**A7. Cost tuning (cheap, do anytime).**
*How:* `max_iterations: 1` once extraction one-shots reliably; split models (`claude-sonnet-4-6` for extraction, `claude-opus-4-8` for the WACC/judgment); the data-API from A1 also slashes fetch tokens. Prompt caching is already automatic in CMA (the ASML run read 466k tokens from cache at 0.1×).

---

# Track B — Scenario module (5-year projection)

Goal: forward scenarios (bear/base/bull) on top of the clean historical base + WACC. **Can prototype on ASML now** — its data is in hand and no new credential is required to start (forward inputs can be hand-provided). This is the headline v1.

**B1. Schema v3 — additive.**
*How:* add a `drivers` registry block and a `scenarios` block to schema-v2, back-compatible so the existing 4 slices still read the historical part unchanged. Bump `schemaVersion` and gate the 5th slice on its presence.

**B2. Driver registry (per arena).**
*The ASML driver tree (already specced):* revenue = new-systems (EUV/High-NA units × ASP; DUV units × ASP) + Installed Base Management (service/upgrades); margin = gross-margin path (mix, volume leverage, pricing) + R&D/SG&A intensity; capital = capex + working capital (incl. customer prepayments); discount/terminal = W1 WACC band + terminal growth fade. Each driver a stated field with source + rationale.
*How:* codify as a registry keyed by arena (shares Track A2's arena registry); extend `constellation-valuation` with a § scenario-construction section.

**B3. Projection engine.**
*How:* from each scenario's driver paths → 5-year pro-forma statements → FOCF → **explicit-forecast DCF per scenario** (upgrades the single-year Gordon in slice 4 to a proper multi-year DCF) → value range across scenarios. **Deterministic Python compute recommended** (gating decision 2) — the agent fills sourced driver values, the engine does the arithmetic reproducibly.

**B4. Scenario construction + forward inputs.**
*How:* three bundled coherent scenarios (bear = WFE downcycle + China bite + slow High-NA; base = AI logic demand + steady EUV + High-NA 2026–28 + service compounding; bull = broad capex supercycle + memory recovery + faster High-NA); each driver a sourced point + range anchored to ASML's Investor-Day 2030 model. Forward guidance/consensus is the one input class that **needs a credential OR manual entry** — for a prototype, the founder provides it.

**B5. Tornado + armed triggers.**
*How:* compute EV sensitivity per driver (the sensitive-to / insensitive-to list; revenue CAGR + gross margin usually dominate). Armed triggers = observable conditions that flip scenarios (quarterly bookings, China % sales, High-NA shipments, HBM/DRAM capex, SEMI WFE) each with a playbook — natural fit for a 🧠 memory store to track resolutions over time (the calibration loop).

**B6. 5th front-end slice — "Projection / scenarios".**
*How:* a new React slice alongside the four in `front-end/`, reading the `scenarios` block: football-field over the three scenario values + a tornado chart. Build it the same way as slices 1–4 and add it to the merged viewer (`constellation-model.template.html`).

---

# v2 / later
- **Scheduled watchlist refresh** — 🗓️ deployment (`POST /v1/deployments`, cron + timezone + kickoff as `initial_events` with **relative dates only**); manual `-X POST` run to verify before trusting the cron.
- **Formula-emitting recompute workbook** (Constellation v0.3) — xlsx with live formulas + named ranges; acceptance-test against the snapshot.
- **Memory store / calibration export** — arena priors + decision log accumulated across runs (also serves B5's triggers).

# Always
- Re-run `evals/` before promoting any new agent version (`run-evals.sh`; balance check must hold, targets within tolerance).
- Rotate the API key (it touched a transcript).
- Propagate the `key`→`field` slice fix to the founder's live front-end (see `STATE.md` § Known bug).
