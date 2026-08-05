#!/usr/bin/env bash
# Fire the held-back eval cases against the pinned agent version and collect verdicts.
# Each evals/case-*/input.txt holds a ticker. Usage: bash run-evals.sh
# (case-01 is the build input; add case-02+ as held-back regression cases.)
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; source IDS.env; set +a
: "${AGENT_ID:?run launch.sh first}" "${AGENT_VERSION:?}" "${ENV_ID:?}"
BASE=https://api.anthropic.com/v1
MA=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: managed-agents-2026-04-01" -H "content-type: application/json")
RUBRIC_FILE=outcome.md
RESULTS="evals/results-v${AGENT_VERSION}.json"; echo "[]" > "$RESULTS"

for dir in evals/case-*/; do
  [ -f "$dir/input.txt" ] || continue
  TICKER=$(tr -d ' \n' < "$dir/input.txt")
  echo "== $dir ($TICKER) =="
  python3 -c "
import json
task=open('first_prompt.txt').read().replace('ASML','$TICKER')
json.dump({'agent':{'type':'agent','id':'$AGENT_ID','version':$AGENT_VERSION},'environment_id':'$ENV_ID','title':'eval $TICKER'}, open('/tmp/es.json','w'))
"
  curl -sS --fail-with-body "$BASE/sessions" "${MA[@]}" -d @/tmp/es.json -o /tmp/es_resp.json
  ESID=$(python3 -c "import json;print(json.JSONDecoder(strict=False).decode(open('/tmp/es_resp.json').read())['id'])")
  python3 -c "
import json
task=open('first_prompt.txt').read().replace('ASML','$TICKER')
rubric=open('$RUBRIC_FILE').read()
json.dump({'events':[{'type':'user.define_outcome','description':task,'rubric':{'type':'text','content':rubric},'max_iterations':3}]}, open('/tmp/ek.json','w'))
"
  curl -sS --fail-with-body "$BASE/sessions/$ESID/events" "${MA[@]}" -d @/tmp/ek.json >/dev/null
  echo "  session $ESID started — poll with: bash poll.sh $ESID"
  python3 -c "
import json
r=json.load(open('$RESULTS')); r.append({'case':'$dir','ticker':'$TICKER','session':'$ESID'}); json.dump(r,open('$RESULTS','w'),indent=2)
"
done
echo "started. verdicts land as each session finishes; re-poll and record into $RESULTS."
