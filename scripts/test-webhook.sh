#!/bin/bash
set -e

# Load config from .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

WEBHOOK_SECRET=$(grep '^GITHUB_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d'=' -f2)
PORT=$(grep '^PORT=' "$ENV_FILE" | cut -d'=' -f2)
PORT=${PORT:-4000}
WEBHOOK_URL="http://localhost:${PORT}/webhooks/github"

if [ -z "$WEBHOOK_SECRET" ]; then
  echo "Error: GITHUB_WEBHOOK_SECRET not found in .env"
  exit 1
fi

echo "=== Test 1: Health check ==="
curl -s "http://localhost:${PORT}/health"
echo ""
echo ""

UNIQUE=$(date +%s)

echo "=== Test 2: Missing headers (expect 400) ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -d '{}')
echo "HTTP $HTTP_CODE"
echo ""

echo "=== Test 3: Invalid signature (expect 401) ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=invalidsig" -H "X-GitHub-Event: pull_request_review_comment" -H "X-GitHub-Delivery: del-${UNIQUE}-001" -d '{"action":"created"}')
echo "HTTP $HTTP_CODE"
echo ""

echo "=== Test 4: Valid signature, ping event (expect 200 ignored) ==="
PAYLOAD='{"action":"ping"}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" -H "X-GitHub-Event: ping" -H "X-GitHub-Delivery: del-${UNIQUE}-002" -d "$PAYLOAD")
echo "$RESPONSE"
echo ""

echo "=== Test 5: Valid /explore command (expect 202) ==="
PAYLOAD='{"action":"created","comment":{"id":999001,"body":"/explore \"refactor this function for readability\"","user":{"login":"testuser","type":"User"},"pull_request_review_id":1001,"diff_hunk":"@@ -10,6 +10,8 @@\n function foo() {\n+  bar();\n+  baz();\n }","path":"src/utils/helper.ts","position":5,"original_position":5,"line":12,"original_line":12,"start_line":10,"original_start_line":10},"pull_request":{"number":42,"head":{"ref":"feature/cool-stuff","sha":"abc123"}},"repository":{"owner":{"login":"test-owner"},"name":"test-repo"},"installation":{"id":12345}}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" -H "X-GitHub-Event: pull_request_review_comment" -H "X-GitHub-Delivery: del-${UNIQUE}-003" -d "$PAYLOAD")
echo "$RESPONSE"
echo ""

echo "=== Test 6: Duplicate delivery (expect 200 ignored) ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG" -H "X-GitHub-Event: pull_request_review_comment" -H "X-GitHub-Delivery: del-${UNIQUE}-003" -d "$PAYLOAD")
echo "$RESPONSE"
echo ""

echo "=== Test 7: Comment without /explore (expect 200 ignored) ==="
PAYLOAD7='{"action":"created","comment":{"id":999002,"body":"Just a regular comment","user":{"login":"testuser","type":"User"},"pull_request_review_id":1002,"diff_hunk":"@@ -1,3 +1,4 @@","path":"src/index.ts","position":1,"original_position":1,"line":1,"original_line":1,"start_line":null,"original_start_line":null},"pull_request":{"number":42,"head":{"ref":"main","sha":"def456"}},"repository":{"owner":{"login":"test-owner"},"name":"test-repo"},"installation":{"id":12345}}'
SIG7=$(echo -n "$PAYLOAD7" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=$SIG7" -H "X-GitHub-Event: pull_request_review_comment" -H "X-GitHub-Delivery: del-${UNIQUE}-007" -d "$PAYLOAD7")
echo "$RESPONSE"
echo ""

echo "=== All tests complete ==="
