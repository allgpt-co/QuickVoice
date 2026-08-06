# Issue #124: Campaign Intelligence Frontend - Complete Testing Guide

## Overview

This guide provides comprehensive testing instructions for the Campaign Intelligence Frontend feature implemented in Issue #124. This feature adds advanced personalization, A/B testing (experiments), conversion tracking, and reporting capabilities to QuickVoice's outbound batch campaigns.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Feature Summary](#feature-summary)
3. [API Testing](#api-testing)
4. [Frontend UI Testing](#frontend-ui-testing)
5. [End-to-End Testing](#end-to-end-testing)
6. [Test Cases Checklist](#test-cases-checklist)
7. [Known Limitations](#known-limitations)

---

## Prerequisites

### Required Access
- QuickVoice Console access: `https://console.quickvoice.co`
- At least one configured agent with a phone number
- API key from Settings → API Keys

### Test Data Required
- Agent with `isActive: true` and `isConfigured: true`
- Phone number assigned to the agent
- CSV/XLSX file with test recipients (min 2 rows)

### Environment Setup
```bash
# Clone and setup
cd /quickintell/workspaces/aman_workspace/QuickVoice
pnpm install

# Run tests
pnpm --filter server test
```

---

## Feature Summary

### New Features Implemented

| Feature | Description | API Endpoint |
|---------|-------------|--------------|
| **Personalization Schema** | Define dynamic variables per campaign | `POST /outbound-calls/batches` |
| **A/B Testing (Experiments)** | Split recipients into variants | `POST /outbound-calls/batches` |
| **Conversion Goals** | Track campaign outcomes | `POST /batches/:campaignId/conversions` |
| **Campaign Reports** | Generate analytics reports | `POST /batches/:campaignId/reports/preview` |
| **Results Export** | Download CSV results | `GET /batches/:campaignId/results.csv` |
| **Recipient Snapshots** | Store per-recipient configuration | Internal |

---

## API Testing

### 1. Create Batch Campaign with Personalization

**Endpoint:** `POST /api/v1/outbound-calls/batches`

**Request Body:**
```json
{
  "agentId": "YOUR_AGENT_ID",
  "fromNumber": "+15551230000",
  "scheduledAt": "2026-08-10T10:00:00Z",
  "sourceFileKey": "outbound-batches/ORG_ID/FILE_ID.csv",
  "sourceFileName": "test-recipients.csv",
  "intelligence": {
    "personalizationSchema": {
      "version": 1,
      "fields": [
        {
          "name": "customer_name",
          "type": "string",
          "source": "customer_attribute",
          "required": true,
          "maxLength": 100
        },
        {
          "name": "offer_type",
          "type": "enum",
          "source": "customer_attribute",
          "allowedValues": ["renewal", "upgrade", "trial"],
          "required": true
        }
      ],
      "templates": {
        "firstMessage": "Hi {{customer_name}}, this is a {{offer_type}} offer."
      }
    },
    "experiments": [
      {
        "version": 1,
        "key": "greeting_test",
        "name": "Greeting Test",
        "variants": [
          { "key": "control", "name": "Standard", "allocationBps": 5000, "isControl": true },
          { "key": "variant_a", "name": "Personalized", "allocationBps": 5000, "isControl": false }
        ]
      }
    ],
    "goals": [
      {
        "key": "conversion",
        "version": 1,
        "definition": { "type": "call_completed" }
      }
    ]
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Batch campaign created successfully",
  "data": {
    "campaignId": "campaign_...",
    "status": "SCHEDULED",
    "totalRecipients": 100,
    "validRecipients": 98,
    "invalidRecipients": 2
  }
}
```

### 2. Validate Conversion Event

**Endpoint:** `POST /api/v1/outbound-calls/batches/:campaignId/conversions/validate`

**Request Body:**
```json
{
  "goalKey": "conversion",
  "dedupeKey": "conv_001",
  "externalCustomerId": "customer_123",
  "valueCents": 5000,
  "source": "webhook",
  "occurredAt": "2026-08-06T12:00:00Z"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Campaign conversion validated",
  "data": {
    "accepted": true,
    "goalKey": "conversion",
    "valueCents": 5000
  }
}
```

### 3. Ingest Conversion Event

**Endpoint:** `POST /api/v1/outbound-calls/batches/:campaignId/conversions`

Same body as validate endpoint. Persists the conversion.

### 4. Build Campaign Report

**Endpoint:** `POST /api/v1/outbound-calls/batches/:campaignId/reports/preview`

**Request Body:**
```json
{
  "randomized": false,
  "persistReport": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Campaign report generated",
  "data": {
    "summary": {
      "totalCalls": 100,
      "completedCalls": 85,
      "successRate": 0.85
    },
    "experimentResults": [
      {
        "experimentKey": "greeting_test",
        "variants": [
          { "key": "control", "calls": 50, "conversions": 10 },
          { "key": "variant_a", "calls": 50, "conversions": 15 }
        ]
      }
    ]
  }
}
```

### 5. Export Results CSV

**Endpoint:** `GET /api/v1/outbound-calls/batches/:campaignId/results.csv`

**Response:** CSV file download with columns:
- `outbound_id`
- `phone_number`
- `status`
- `call_duration`
- `experiment_variant`
- `conversion_value`

---

## Frontend UI Testing

### Test 1: Campaign Creation Flow

1. **Navigate to Outbound Campaigns**
   - Go to `https://console.quickvoice.co/outbound`
   - Click "New Campaign" button

2. **Select Agent**
   - Choose an active, configured agent
   - Verify phone number auto-selects

3. **Upload Recipients File**
   - Upload CSV with columns:
     ```
     phone_number,customer_name,offer_type
     +15551234567,John,renewal
     +15559876543,Jane,upgrade
     ```
   - Verify file uploads successfully
   - Check "Preview recipients" shows parsed data

4. **Configure Personalization**
   - Navigate to "Personalization" tab
   - Add fields:
     - `customer_name` (string, required)
     - `offer_type` (enum: renewal, upgrade, trial)
   - Verify template preview updates

5. **Setup A/B Test**
   - Navigate to "Experiments" tab
   - Create experiment:
     - Name: "Greeting Test"
     - Control: 50%
     - Variant A: 50%
   - Verify allocation adds to 100%

6. **Define Conversion Goals**
   - Navigate to "Goals" tab
   - Add goal:
     - Key: `conversion`
     - Type: Call completed
   - Verify goal appears in list

7. **Review and Submit**
   - Review all settings
   - Click "Create Campaign"
   - Verify success message
   - Check campaign appears in list

### Test 2: Campaign Detail View

1. **Open Campaign Detail**
   - Click on created campaign
   - Verify tabs: Overview, Recipients, Experiments, Goals, Results

2. **Check Recipients Tab**
   - Verify total/valid/invalid counts
   - Preview first 10 recipients
   - Download results CSV

3. **Check Experiments Tab**
   - View experiment configuration
   - See variant assignments
   - Check refresh button works

4. **Check Goals Tab**
   - View defined goals
   - See conversion count

### Test 3: Results Export

1. **Wait for Campaign Completion**
   - Or use a completed campaign

2. **Download CSV**
   - Click "Export Results" button
   - Verify CSV downloads
   - Open and check columns

---

## End-to-End Testing

### Complete Flow Test

```bash
# 1. Get API key
API_KEY="FWvemQDvSDvkhyIORcerjrPSJKtQDpKAfppzEUdeowBFfXQcHfOcLsKGscgIZJTr"
BASE_URL="https://api.quickvoice.co/api/v1"

# 2. Get upload URL
curl -X GET "$BASE_URL/outbound-calls/batch-upload-url?fileName=test.csv&contentType=text/csv" \
  -H "x-api-key: $API_KEY"

# 3. Upload CSV to S3 (use returned URL)
# ... upload file ...

# 4. Create campaign
curl -X POST "$BASE_URL/outbound-calls/batches" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "YOUR_AGENT_ID",
    "fromNumber": "+15551230000",
    "sourceFileKey": "outbound-batches/...",
    "sourceFileName": "test.csv",
    "intelligence": {
      "personalizationSchema": {
        "version": 1,
        "fields": [{"name": "name", "type": "string", "source": "customer_attribute"}]
      }
    }
  }'

# 5. Validate conversion
curl -X POST "$BASE_URL/outbound-calls/batches/CAMPAIGN_ID/conversions/validate" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"goalKey": "conversion", "dedupeKey": "test1"}'

# 6. Build report
curl -X POST "$BASE_URL/outbound-calls/batches/CAMPAIGN_ID/reports/preview" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"randomized": false}'

# 7. Export results
curl -X GET "$BASE_URL/outbound-calls/batches/CAMPAIGN_ID/results.csv" \
  -H "x-api-key: $API_KEY"
```

---

## Test Cases Checklist

### API Tests

| Test Case | Status | Notes |
|-----------|--------|-------|
| Create campaign with personalization schema | ⬜ | |
| Create campaign with A/B experiments | ⬜ | |
| Create campaign with conversion goals | ⬜ | |
| Create campaign with all features combined | ⬜ | |
| Validate conversion event | ⬜ | |
| Ingest conversion event | ⬜ | |
| Build campaign report | ⬜ | |
| Export results CSV | ⬜ | |
| Get campaign detail | ⬜ | |
| Cancel campaign | ⬜ | |
| List batch campaigns | ⬜ | |

### Frontend Tests

| Test Case | Status | Notes |
|-----------|--------|-------|
| Campaign creation wizard loads | ⬜ | |
| Agent selection works | ⬜ | |
| File upload works (CSV) | ⬜ | |
| File upload works (XLSX) | ⬜ | |
| Recipient preview shows data | ⬜ | |
| Personalization schema UI renders | ⬜ | |
| Field types: string, number, enum | ⬜ | |
| Template preview updates | ⬜ | |
| Experiment creation works | ⬜ | |
| Variant allocation validation | ⬜ | |
| Goal definition works | ⬜ | |
| Campaign detail view renders | ⬜ | |
| Results download works | ⬜ | |

### Edge Cases

| Test Case | Status | Notes |
|-----------|--------|-------|
| Empty recipients file | ⬜ | Should fail gracefully |
| Invalid phone numbers | ⬜ | Should mark as invalid |
| Missing required fields | ⬜ | Should show errors |
| Experiment allocation not 100% | ⬜ | Should validate |
| Duplicate conversion dedupeKey | ⬜ | Should dedupe |
| Large file (5000+ recipients) | ⬜ | Performance test |

---

## Known Limitations

1. **Maximum Recipients**: 10,000 per campaign (configurable via `OUTBOUND_BATCH_MAX_RECIPIENTS`)
2. **File Size**: 5MB maximum for CSV/XLSX uploads
3. **Experiment Variants**: Maximum 10 variants per experiment
4. **Field Names**: Must start with letter, alphanumeric + underscore, max 64 chars
5. **Enum Values**: Maximum 100 allowed values per enum field

---

## Troubleshooting

### Common Issues

1. **"Invalid API key"**
   - Verify key is active in Settings → API Keys
   - Check key has `outboundCalls:create` permission

2. **Campaign stuck in SCHEDULED**
   - Check `scheduledAt` is in the future
   - Verify agent is active and configured

3. **Recipients marked invalid**
   - Check phone number format (E.164: `+15551234567`)
   - Verify all required fields have values

4. **Conversions not tracked**
   - Verify goal key matches definition
   - Check `dedupeKey` is unique

---

## Sign-Off

After completing all tests:

- [ ] All API tests pass
- [ ] All frontend tests pass
- [ ] Edge cases handled correctly
- [ ] Documentation updated
- [ ] No regressions in existing functionality

**Tester:** ________________

**Date:** ________________

**Approver:** ________________