#!/usr/bin/env bash
# Poll a session's status + outcome verdict. Usage: bash poll.sh [SESSION_ID]
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; source IDS.env 2>/dev/null || true; set +a
SID="${1:-${SESSION_ID:-}}"
[ -n "$SID" ] || { echo "no session id"; exit 1; }
BASE=https://api.anthropic.com/v1
MA=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "anthropic-beta: managed-agents-2026-04-01")
curl -sS "$BASE/sessions/$SID" "${MA[@]}" -o /tmp/poll.json
python3 -c "
import json
d=json.JSONDecoder(strict=False).decode(open('/tmp/poll.json').read())
print('status :', d.get('status'))
for e in d.get('outcome_evaluations',[]):
    print('verdict:', e.get('result'), '—', (e.get('explanation') or '')[:200])
u=d.get('usage') or {}
if u: print('usage  :', {k:u[k] for k in u if 'token' in k})
"
