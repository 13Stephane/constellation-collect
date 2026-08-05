# Launch — constellation-collect

The `/collect` agent: a European listed ticker → a provenance-stamped **schema-v2** dataset (+ constructed W1 WACC band + snapshot `.xlsx`) that loads into the 4-slice front-end.

## One-time: the key

1. Create an API key at **platform.claude.com → API keys** — note which **workspace** it belongs to (the Console only shows that workspace's agents/sessions).
2. Put it in `.env` (already created, chmod 600, gitignored):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Edit via the absolute path, or `export ANTHROPIC_API_KEY=…` in your own terminal. Never paste the key into chat.

A run executes in your real account and costs cents; `max_iterations: 3` caps each run.

## Launch (resumable)

```bash
bash launch.sh      # picks model · uploads the skill · env · agent · session · kickoff
```
Each step reads `IDS.env` first and skips anything already created, so a failed step re-runs safely. IDs are appended to `IDS.env` as they're minted.

## Watch it

```bash
bash poll.sh                     # status + outcome verdict for the launched session
```
Runs usually take a few minutes. Console: platform.claude.com → Claude Managed Agents → Sessions (your key's workspace).

## Get the deliverables + view the model

```bash
bash fetch-outputs.sh            # downloads ASML_schema-v2.json / _valuation.xlsx / sources.json into outputs/
                                 # and injects the JSON into outputs/ASML_model.html (auto-load, no paste)
open outputs/ASML_model.html     # the 4-slice model, rendered with the fresh data
```

## Regression (before promoting any new agent version)

```bash
bash run-evals.sh                # fires each evals/case-*/ ticker against the pinned agent version
```
`case-01` (ASML) is the build input; its golden answer is `evals/case-01/expected.json`. Add `case-02+` for held-back European names.

## Files

| File | What |
|---|---|
| `build-sheet.json` | source of truth for the design |
| `agent.json` / `environment.json` | the API payloads (model + skill id filled at launch) |
| `constellation-valuation/SKILL.md` | the house-method skill (uploaded at launch) |
| `outcome.md` / `first_prompt.txt` | the rubric + the task (relative dates) |
| `constellation-model.template.html` + `build-viewer.py` | the auto-load viewer + inject step |
| `evals/` | golden case-01 (ASML) + regression harness |
| `NEXT-DIRECTIONS.md` | v1/v2 plan |
| `.env` / `IDS.env` | your key (never committed) / minted IDs |
