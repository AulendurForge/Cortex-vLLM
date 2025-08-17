#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-http://localhost:8084}
AUTH=${AUTH:-"Bearer dev-any"}

echo "[1/5] HEALTH" >&2
curl -sS "$BASE/health" | cat
echo

echo "[2/5] ADMIN/UPSTREAMS" >&2
curl -sS "$BASE/admin/upstreams" | cat
echo

echo "[3/5] EMBEDDINGS" >&2
curl -sS -X POST "$BASE/v1/embeddings" \
  -H "content-type: application/json" \
  -H "authorization: $AUTH" \
  -d '{"model":"intfloat/e5-small-v2","input":"hello"}' | cat
echo

echo "[4/5] CHAT COMPLETIONS" >&2
curl -sS -X POST "$BASE/v1/chat/completions" \
  -H "content-type: application/json" \
  -H "authorization: $AUTH" \
  -d '{"model":"TinyLlama/TinyLlama-1.1B-Chat-v1.0","messages":[{"role":"user","content":"ping"}],"stream":false}' | cat
echo

echo "[5/5] METRICS SAMPLE" >&2
curl -sS "$BASE/metrics" | head -n 40 | cat
echo

echo "Smoke tests completed." >&2


