#!/bin/bash

# Issue #124: Campaign Intelligence Frontend - Automated Test Script
# Run this script to verify the core functionality

set -e

echo "══════════════════════════════════════════════════════════════"
echo "       ISSUE #124: Campaign Intelligence Test Suite"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Configuration
API_KEY="${QUICKVOICE_API_KEY:-FWvemQDvSDvkhyIORcerjrPSJKtQDpKAfppzEUdeowBFfXQcHfOcLsKGscgIZJTr}"
BASE_URL="${QUICKVOICE_API_URL:-https://api.quickvoice.co/api/v1}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
run_test() {
    local name="$1"
    local result="$2"
    if [[ "$result" == "PASS" ]]; then
        echo "✅ PASS: $name"
        ((TESTS_PASSED++))
    else
        echo "❌ FAIL: $name"
        ((TESTS_FAILED++))
    fi
}

echo "Configuration:"
echo "  API URL: $BASE_URL"
echo "  API Key: ${API_KEY:0:20}..."
echo ""

# Test 1: Health Check
echo "────────────────────────────────────────────────────────────────"
echo "Test 1: API Health Check"
echo "────────────────────────────────────────────────────────────────"
HEALTH=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"success":true'; then
    run_test "API Health Check" "PASS"
else
    run_test "API Health Check" "FAIL"
fi

# Test 2: List Agents
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 2: List Agents"
echo "────────────────────────────────────────────────────────────────"
AGENTS=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/agents")
if echo "$AGENTS" | grep -q '"success":true'; then
    AGENT_COUNT=$(echo "$AGENTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
    run_test "List Agents (found $AGENT_COUNT)" "PASS"
else
    run_test "List Agents" "FAIL"
fi

# Test 3: List Batch Campaigns
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 3: List Batch Campaigns"
echo "────────────────────────────────────────────────────────────────"
CAMPAIGNS=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/outbound-calls/batches")
if echo "$CAMPAIGNS" | grep -q '"success":true'; then
    run_test "List Batch Campaigns" "PASS"
else
    run_test "List Batch Campaigns" "FAIL"
fi

# Test 4: List Phone Numbers
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 4: List Phone Numbers"
echo "────────────────────────────────────────────────────────────────"
NUMBERS=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/numbers")
if echo "$NUMBERS" | grep -q '"success":true'; then
    run_test "List Phone Numbers" "PASS"
else
    run_test "List Phone Numbers" "FAIL"
fi

# Test 5: Get Dashboard Summary
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 5: Dashboard Summary"
echo "────────────────────────────────────────────────────────────────"
DASHBOARD=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/dashboard/summary?range=7d")
if echo "$DASHBOARD" | grep -q '"success":true'; then
    run_test "Dashboard Summary" "PASS"
else
    run_test "Dashboard Summary" "FAIL"
fi

# Test 6: Get Voice Catalog
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 6: Voice Catalog"
echo "────────────────────────────────────────────────────────────────"
CATALOG=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/agents/voice/catalog")
if echo "$CATALOG" | grep -q '"success":true'; then
    run_test "Voice Catalog" "PASS"
else
    run_test "Voice Catalog" "FAIL"
fi

# Test 7: Get Batch Upload URL
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 7: Batch Upload URL Generation"
echo "────────────────────────────────────────────────────────────────"
UPLOAD_URL=$(curl -s -H "x-api-key: $API_KEY" "$BASE_URL/outbound-calls/batch-upload-url?fileName=test.csv&contentType=text/csv")
if echo "$UPLOAD_URL" | grep -q '"success":true\|"url"'; then
    run_test "Batch Upload URL" "PASS"
else
    run_test "Batch Upload URL" "FAIL"
fi

# Test 8: MCP Server Health (if deployed)
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "Test 8: MCP Server Health"
echo "────────────────────────────────────────────────────────────────"
MCP_URL="${MCP_URL:-http://f8v7lu4tuihjzigkrrun0s6d.207.244.241.161.sslip.io/mcp}"
MCP_INIT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')
if echo "$MCP_INIT" | grep -q '"result"'; then
    run_test "MCP Server Initialize" "PASS"
else
    run_test "MCP Server Initialize" "FAIL"
fi

# Summary
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "                    TEST SUMMARY"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ Passed: $TESTS_PASSED"
echo "  ❌ Failed: $TESTS_FAILED"
echo "  📊 Total:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "🎉 ALL TESTS PASSED - Issue #124 can be closed!"
    exit 0
else
    echo "⚠️  Some tests failed. Review the output above."
    exit 1
fi