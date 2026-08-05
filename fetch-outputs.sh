#!/usr/bin/env bash
# Download a finished session's outputs into ./outputs/ and build the viewer.
# Usage: bash fetch-outputs.sh [SESSION_ID]   (run only after status is idle)
set -euo pipefail
cd "$(dirname "$0")"
set -a; source .env; source IDS.env 2>/dev/null || true; set +a
SID="${1:-${SESSION_ID:-}}"
[ -n "$SID" ] || { echo "no session id"; exit 1; }
BASE=https://api.anthropic.com/v1
MA=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "anthropic-beta: managed-agents-2026-04-01")
mkdir -p outputs
curl -sS "$BASE/files?scope_id=$SID" "${MA[@]}" -o /tmp/files.json
python3 -c "
import json
d=json.JSONDecoder(strict=False).decode(open('/tmp/files.json').read())
for f in d.get('data',[]): print(f['id'], f['filename'])
" | while read -r FID FNAME; do
  echo "downloading $FNAME"
  curl -sS "$BASE/files/$FID/content" "${MA[@]}" -o "outputs/$FNAME"
done
# build the viewer from whichever schema-v2 json we got
JSON=$(ls outputs/*schema-v2.json 2>/dev/null | head -1 || true)
[ -n "$JSON" ] && python3 build-viewer.py "$JSON" && echo "open outputs/*_model.html to view the model"
