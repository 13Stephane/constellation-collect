#!/usr/bin/env bash
# Resumable launch for constellation-collect. Each step reads IDS.env first and
# skips objects that already exist, so a failed step can be re-run safely.
# Usage:  bash launch.sh
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "!! .env missing — create it with ANTHROPIC_API_KEY=..."; exit 1; }
set -a; source .env; set +a
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "!! ANTHROPIC_API_KEY empty in .env"; exit 1; }
touch IDS.env; set -a; source IDS.env; set +a

BASE=https://api.anthropic.com/v1
MA=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: managed-agents-2026-04-01" -H "content-type: application/json")
SK=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: skills-2025-10-02")

pyid(){ python3 -c "import json,sys; d=json.JSONDecoder(strict=False).decode(open('$1').read()); print(d$2)"; }
save(){ grep -q "^$1=" IDS.env 2>/dev/null && sed -i '' "/^$1=/d" IDS.env; echo "$1=$2" >> IDS.env; export "$1=$2"; }

# ── step 1: pick model ──────────────────────────────────────────────
if [ -z "${MODEL:-}" ]; then
  curl -sS "$BASE/models" "${MA[@]:0:4}" -o /tmp/models.json
  MODEL=$(python3 -c "import json; ids=[m['id'] for m in json.load(open('/tmp/models.json'))['data']]; \
    print('claude-opus-4-8' if 'claude-opus-4-8' in ids else next((i for i in ids if 'opus' in i), ids[0]))")
  save MODEL "$MODEL"
fi
echo "model: $MODEL"

# ── step 2: upload custom skill ─────────────────────────────────────
if [ -z "${SKILL_ID:-}" ]; then
  rm -f constellation-valuation.zip
  zip -qr constellation-valuation.zip constellation-valuation -x '*/.*'
  curl -sS --fail-with-body "$BASE/skills" "${SK[@]}" -F "files[]=@constellation-valuation.zip" -o /tmp/skill.json
  SKILL_ID=$(pyid /tmp/skill.json "['id']")
  save SKILL_ID "$SKILL_ID"
fi
echo "skill: $SKILL_ID"

# ── step 3: environment ─────────────────────────────────────────────
if [ -z "${ENV_ID:-}" ]; then
  curl -sS --fail-with-body "$BASE/environments" "${MA[@]}" -d @environment.json -o /tmp/env.json
  ENV_ID=$(pyid /tmp/env.json "['id']")
  save ENV_ID "$ENV_ID"
fi
echo "environment: $ENV_ID"

# ── step 4: agent (substitute model + skill id) ─────────────────────
if [ -z "${AGENT_ID:-}" ]; then
  python3 -c "
import json
d=json.load(open('agent.json'))
d['model']='$MODEL'
for s in d['skills']:
    if s.get('skill_id')=='PENDING_SKILL_ID': s['skill_id']='$SKILL_ID'
json.dump(d,open('agent.launch.json','w'))
"
  curl -sS --fail-with-body "$BASE/agents" "${MA[@]}" -d @agent.launch.json -o /tmp/agent.json
  AGENT_ID=$(pyid /tmp/agent.json "['id']")
  AGENT_VERSION=$(pyid /tmp/agent.json "['version']")
  save AGENT_ID "$AGENT_ID"; save AGENT_VERSION "$AGENT_VERSION"
fi
echo "agent: $AGENT_ID (v$AGENT_VERSION)"

# ── step 5: session ─────────────────────────────────────────────────
if [ -z "${SESSION_ID:-}" ]; then
  python3 -c "
import json
json.dump({'agent':'$AGENT_ID','environment_id':'$ENV_ID','title':'ASML — first run'}, open('/tmp/sess_req.json','w'))
"
  curl -sS --fail-with-body "$BASE/sessions" "${MA[@]}" -d @/tmp/sess_req.json -o /tmp/sess.json
  SESSION_ID=$(pyid /tmp/sess.json "['id']")
  save SESSION_ID "$SESSION_ID"
fi
echo "session: $SESSION_ID"

# ── step 6: kickoff (outcome event) ─────────────────────────────────
if [ -z "${KICKED_OFF:-}" ]; then
  python3 -c "
import json
task=open('first_prompt.txt').read()
rubric=open('outcome.md').read()
evt={'type':'user.define_outcome','description':task,'rubric':{'type':'text','content':rubric},'max_iterations':3}
json.dump({'events':[evt]}, open('/tmp/kick.json','w'))
"
  curl -sS --fail-with-body "$BASE/sessions/$SESSION_ID/events" "${MA[@]}" -d @/tmp/kick.json -o /tmp/kickresp.json
  save KICKED_OFF "1"
fi
echo "kicked off. watch: $BASE/sessions/$SESSION_ID"
echo "console: https://platform.claude.com/workspaces/default/sessions/$SESSION_ID"
