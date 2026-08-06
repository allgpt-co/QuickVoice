# Issue #124: Campaign Intelligence Frontend - Complete Testing Guide

## Overview

This guide provides comprehensive testing instructions for the Campaign Intelligence Frontend feature implemented in Issue #124. This feature adds advanced personalization, A/B testing (experiments), conversion tracking, and reporting capabilities to QuickVoice's outbound batch campaigns.

**Testing Approach:** This guide focuses on **frontend UI testing** through the QuickVoice Console.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Feature Summary](#feature-summary)
3. [Frontend UI Testing](#frontend-ui-testing)
4. [Test Cases Checklist](#test-cases-checklist)
5. [Screenshots Reference](#screenshots-reference)
6. [Known Limitations](#known-limitations)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Access
- QuickVoice Console access: `https://console.quickvoice.co`
- User account with organization admin or member role
- At least one configured agent with a phone number

### Test Data Required

1. **Agent Setup**
   - Create an agent or use existing one
   - Agent must be `Active` and `Configured`
   - Assign at least one phone number to the agent

2. **Test Recipients File (CSV)**
   Create a file `test-recipients.csv` with the following content:
   ```csv
   phone_number,customer_name,offer_type,city
   +15551234567,John Smith,renewal,Austin
   +15559876543,Jane Doe,upgrade,Dallas
   +15551112222,Bob Johnson,trial,Houston
   +15553334444,Alice Brown,renewal,Seattle
   +15555556666,Charlie Wilson,upgrade,Portland
   ```

3. **Test Recipients File (XLSX) - Optional**
   Same data as CSV in Excel format for testing both file types.

### Environment Setup

1. **Login to Console**
   - Go to `https://console.quickvoice.co`
   - Login with your credentials
   - Verify you see the dashboard

2. **Verify Agent is Ready**
   - Navigate to **Agents** page
   - Confirm you have at least one agent with:
     - Green "Active" badge
     - "Configured" status
     - Phone number assigned

---

## Feature Summary

### New Features Implemented

| Feature | Description | Location in UI |
|---------|-------------|----------------|
| **Personalization Schema** | Define dynamic variables per campaign | Campaign Creation → Personalization Tab |
| **A/B Testing (Experiments)** | Split recipients into test variants | Campaign Creation → Experiments Tab |
| **Conversion Goals** | Track campaign outcomes | Campaign Creation → Goals Tab |
| **Campaign Reports** | View analytics and results | Campaign Detail → Reports Tab |
| **Results Export** | Download CSV results | Campaign Detail → Export Button |
| **Campaign Intelligence Panel** | View all intelligence data | Campaign Detail → Intelligence Tab |

---

## Frontend UI Testing

### Test Suite 1: Campaign Creation Flow

#### 1.1 Navigate to Outbound Campaigns

**Steps:**
1. Login to QuickVoice Console
2. Click **"Outbound"** in the left sidebar
3. Click **"Campaigns"** tab
4. Click **"New Campaign"** button (or "+ Create Campaign")

**Expected Result:**
- ✅ Campaign creation form appears
- ✅ Agent dropdown is visible
- ✅ File upload area is visible

**Screenshot Location:** `Campaign creation form loaded`

---

#### 1.2 Select Agent and Phone Number

**Steps:**
1. Click **"Select Agent"** dropdown
2. Choose an active, configured agent
3. Verify phone number auto-selects
4. If multiple numbers, select one from dropdown

**Expected Result:**
- ✅ Agent name appears in dropdown
- ✅ Phone number auto-fills
- ✅ "Next" or "Continue" button enables

**Test Data:**
- Agent: Choose any active agent
- Phone Number: Auto-selected

---

#### 1.3 Upload Recipients File

**Steps:**
1. Click **"Upload File"** button or drag-drop area
2. Select `test-recipients.csv` file
3. Wait for upload to complete
4. Verify file name appears

**Expected Result:**
- ✅ File uploads successfully
- ✅ Shows file name: `test-recipients.csv`
- ✅ Shows file size
- ✅ "Preview" button appears or auto-previews

**Test Data:**
```
File: test-recipients.csv (approximately 200 bytes)
Format: CSV with headers: phone_number, customer_name, offer_type, city
```

**Test with XLSX:**
- Upload same data in `.xlsx` format
- Verify both CSV and XLSX work

---

#### 1.4 Preview Recipients

**Steps:**
1. Click **"Preview"** button (if not auto-previewed)
2. Review the recipients table
3. Check columns match CSV headers
4. Verify data parsing is correct

**Expected Result:**
- ✅ Table shows all 5 recipients
- ✅ Columns: phone_number, customer_name, offer_type, city
- ✅ Phone numbers are valid
- ✅ No parsing errors

**Verify Columns:**
| Column | Expected Data |
|--------|---------------|
| phone_number | +15551234567, +15559876543, etc. |
| customer_name | John Smith, Jane Doe, etc. |
| offer_type | renewal, upgrade, trial |
| city | Austin, Dallas, Houston, etc. |

---

### Test Suite 2: Personalization Schema

#### 2.1 Navigate to Personalization Tab

**Steps:**
1. Click **"Personalization"** tab in campaign creation
2. Verify the schema builder interface appears
3. Check for "Add Field" button

**Expected Result:**
- ✅ Personalization tab is accessible
- ✅ Schema builder UI is visible
- ✅ "Add Field" button is present

---

#### 2.2 Add Personalization Fields

**Steps:**
1. Click **"Add Field"** button
2. Fill in the following fields:

**Field 1: customer_name**
- Name: `customer_name`
- Type: `String`
- Source: `Customer Attribute`
- Required: ✅ Yes
- Max Length: `100`

**Field 2: offer_type**
- Name: `offer_type`
- Type: `Enum`
- Source: `Customer Attribute`
- Required: ✅ Yes
- Allowed Values: `renewal`, `upgrade`, `trial`

**Field 3: city**
- Name: `city`
- Type: `String`
- Source: `Customer Attribute`
- Required: ❌ No
- Default Value: `Unknown`

**Expected Result:**
- ✅ Three fields appear in the schema list
- ✅ Each field shows correct type badge
- ✅ Required fields show indicator
- ✅ Enum field shows allowed values

---

#### 2.3 Configure Templates

**Steps:**
1. Find the **"Templates"** section
2. Configure the First Message template:
   ```
   Hi {{customer_name}}, this is a {{offer_type}} offer for {{city}}.
   ```
3. Configure the System Prompt template:
   ```
   You are calling {{customer_name}} about their {{offer_type}}.
   ```

**Expected Result:**
- ✅ Template input accepts variable syntax
- ✅ Variables are highlighted or color-coded
- ✅ Preview shows rendered template with sample data

---

#### 2.4 Test Template Preview

**Steps:**
1. Click **"Preview"** button in templates section
2. Verify preview shows rendered text
3. Check that variables are replaced with actual values

**Expected Result:**
- ✅ Preview shows: "Hi John Smith, this is a renewal offer for Austin."
- ✅ Variables are correctly substituted
- ✅ Preview updates when template changes

---

### Test Suite 3: A/B Testing (Experiments)

#### 3.1 Navigate to Experiments Tab

**Steps:**
1. Click **"Experiments"** tab in campaign creation
2. Verify experiment builder interface appears
3. Check for "Add Experiment" button

**Expected Result:**
- ✅ Experiments tab is accessible
- ✅ Empty state shows "No experiments yet"
- ✅ "Add Experiment" button is visible

---

#### 3.2 Create an Experiment

**Steps:**
1. Click **"Add Experiment"** button
2. Fill in experiment details:
   - **Name:** `Greeting Test`
   - **Key:** `greeting_test` (auto-generated or manual)
   - **Description:** `Testing different greeting approaches`

**Expected Result:**
- ✅ Experiment card appears
- ✅ Name and key are displayed
- ✅ "Add Variant" button is visible

---

#### 3.3 Add Variants

**Steps:**
1. Click **"Add Variant"** button
2. Add **Control Variant:**
   - Name: `Standard Greeting`
   - Key: `control`
   - Allocation: `50%`
   - Check "Is Control" checkbox

3. Add **Test Variant:**
   - Name: `Personalized Greeting`
   - Key: `variant_a`
   - Allocation: `50%`
   - "Is Control": unchecked

**Expected Result:**
- ✅ Two variants appear in experiment
- ✅ Allocation shows 50% each
- ✅ Total allocation shows 100%
- ✅ Control badge appears on control variant

---

#### 3.4 Validate Allocation

**Steps:**
1. Change one variant allocation to `30%`
2. Verify validation error appears
3. Change back to `50%`
4. Verify validation passes

**Expected Result:**
- ✅ Error shows when allocation != 100%
- ✅ Error message: "Total allocation must equal 100%"
- ✅ Validation clears when fixed

---

#### 3.5 Test Multiple Experiments

**Steps:**
1. Click **"Add Experiment"** again
2. Create a second experiment:
   - Name: `Timing Test`
   - Key: `timing_test`
   - Variants:
     - Control: `morning` (50%)
     - Variant: `afternoon` (50%)

**Expected Result:**
- ✅ Second experiment card appears
- ✅ Both experiments are listed
- ✅ Each has separate variant assignments

---

### Test Suite 4: Conversion Goals

#### 4.1 Navigate to Goals Tab

**Steps:**
1. Click **"Goals"** tab in campaign creation
2. Verify goals builder interface appears
3. Check for "Add Goal" button

**Expected Result:**
- ✅ Goals tab is accessible
- ✅ Empty state shows "No goals defined"
- ✅ "Add Goal" button is visible

---

#### 4.2 Create a Goal

**Steps:**
1. Click **"Add Goal"** button
2. Fill in goal details:
   - **Name:** `Conversion`
   - **Key:** `conversion`
   - **Type:** `Call Completed` (or select available type)
   - **Description:** `Track when calls complete successfully`

**Expected Result:**
- ✅ Goal card appears
- ✅ Name and key are displayed
- ✅ Type badge is visible

---

#### 4.3 Configure Goal Settings

**Steps:**
1. Click on the created goal to expand
2. Configure additional settings if available:
   - Attribution window: `7 days`
   - Value tracking: Enable

**Expected Result:**
- ✅ Settings are saved
- ✅ Goal shows configured options

---

#### 4.4 Add Multiple Goals

**Steps:**
1. Add a second goal:
   - Name: `Booking`
   - Key: `booking`
   - Type: `Custom` or available type

2. Verify both goals appear in list

**Expected Result:**
- ✅ Two goals are listed
- ✅ Each goal is independent
- ✅ Goals can be edited/deleted

---

### Test Suite 5: Campaign Review & Creation

#### 5.1 Review Campaign Settings

**Steps:**
1. Click **"Review"** or navigate to review step
2. Verify all settings are displayed:
   - Agent and phone number
   - Recipients count
   - Personalization schema
   - Experiments
   - Goals
3. Check for any validation warnings

**Expected Result:**
- ✅ Review page shows summary
- ✅ All configured features are listed
- ✅ No validation errors
- ✅ "Create Campaign" button is enabled

---

#### 5.2 Create Campaign

**Steps:**
1. Click **"Create Campaign"** button
2. Wait for campaign creation
3. Verify success message appears
4. Check redirect to campaign detail or list

**Expected Result:**
- ✅ Campaign creation succeeds
- ✅ Success toast message: "Campaign created successfully"
- ✅ Redirects to campaign detail page
- ✅ Campaign ID is visible

---

#### 5.3 Verify Campaign in List

**Steps:**
1. Navigate to **Campaigns** tab
2. Verify newly created campaign appears
3. Check campaign status is `Scheduled` or `Active`

**Expected Result:**
- ✅ Campaign appears in list
- ✅ Shows correct status badge
- ✅ Shows recipient count
- ✅ Shows scheduled time

---

### Test Suite 6: Campaign Detail View

#### 6.1 Open Campaign Detail

**Steps:**
1. Click on the created campaign from the list
2. Verify campaign detail page loads
3. Check for tabs: Overview, Recipients, Experiments, Goals, Results

**Expected Result:**
- ✅ Campaign detail page loads
- ✅ Shows campaign name and status
- ✅ All tabs are accessible
- ✅ Key metrics are visible

---

#### 6.2 Check Overview Tab

**Steps:**
1. View the **Overview** tab
2. Verify displayed information:
   - Campaign name
   - Status
   - Total recipients
   - Valid/Invalid counts
   - Created date

**Expected Result:**
- ✅ Overview shows summary
- ✅ Recipient counts match upload
- ✅ Status is correct
- ✅ Intelligence panel shows configured features

---

#### 6.3 Check Recipients Tab

**Steps:**
1. Click **"Recipients"** tab
2. Verify recipient list appears
3. Check pagination or scroll functionality
4. Verify each recipient shows:
   - Phone number
   - Status
   - Experiment variant (if assigned)

**Expected Result:**
- ✅ Recipients list loads
- ✅ Shows phone numbers
- ✅ Shows status for each (Scheduled, Pending, etc.)
- ✅ Shows experiment variant assignment

---

#### 6.4 Check Experiments Tab

**Steps:**
1. Click **"Experiments"** tab
2. Verify experiment details appear
3. Check variant assignments
4. Look for experiment metrics (if calls completed)

**Expected Result:**
- ✅ Shows all configured experiments
- ✅ Shows variants with allocations
- ✅ Shows recipient count per variant
- ✅ Visual representation of split

---

#### 6.5 Check Goals Tab

**Steps:**
1. Click **"Goals"** tab
2. Verify goals list appears
3. Check for conversion counts (if any)

**Expected Result:**
- ✅ Shows all defined goals
- ✅ Shows goal keys
- ✅ Shows conversion count (0 if no calls yet)

---

### Test Suite 7: Results & Export

#### 7.1 Access Results (After Calls Complete)

**Prerequisite:** Wait for some calls to complete, or use a campaign with completed calls.

**Steps:**
1. Navigate to campaign detail
2. Click **"Results"** or **"Reports"** tab
3. View campaign metrics

**Expected Result:**
- ✅ Results tab loads
- ✅ Shows call statistics
- ✅ Shows experiment results if configured
- ✅ Shows conversion metrics if goals configured

---

#### 7.2 Download Results CSV

**Steps:**
1. Click **"Export Results"** or **"Download CSV"** button
2. Verify file download starts
3. Open the downloaded CSV file
4. Check CSV structure

**Expected Result:**
- ✅ CSV file downloads
- ✅ Filename format: `campaign-name-results.csv`
- ✅ CSV opens correctly
- ✅ Contains expected columns

**Expected CSV Columns:**
```
outbound_id, phone_number, status, duration_seconds, experiment_variant, call_started, call_ended
```

---

#### 7.3 View Experiment Results

**Steps:**
1. In Results tab, find experiment section
2. View variant comparison
3. Check for:
   - Calls per variant
   - Success rate per variant
   - Conversion rate per variant

**Expected Result:**
- ✅ Experiment comparison visible
- ✅ Shows metrics per variant
- ✅ Highlights winning variant (if enough data)

---

### Test Suite 8: Edge Cases & Validation

#### 8.1 Invalid Phone Numbers

**Steps:**
1. Create a CSV with invalid phone number:
   ```csv
   phone_number,customer_name
   invalid,John Doe
   12345,Jane Doe
   +15551234567,Valid User
   ```
2. Upload the file
3. Check validation results

**Expected Result:**
- ✅ Invalid numbers are flagged
- ✅ Shows "Invalid recipients" count
- ✅ Valid recipients are still processed
- ✅ Error messages explain what's wrong

---

#### 8.2 Missing Required Fields

**Steps:**
1. Create CSV missing required personalization fields:
   ```csv
   phone_number,city
   +15551234567,Austin
   ```
   (Missing `customer_name` and `offer_type`)
2. Upload and try to create campaign
3. Check for validation error

**Expected Result:**
- ✅ Validation error appears
- ✅ Shows which fields are missing
- ✅ Campaign cannot be created until fixed

---

#### 8.3 Large File Upload

**Steps:**
1. Create CSV with 1000+ recipients
2. Upload the file
3. Verify upload performance
4. Check preview loads reasonably

**Expected Result:**
- ✅ File uploads within reasonable time (< 30 seconds)
- ✅ Preview shows first page of recipients
- ✅ Pagination works if implemented
- ✅ No browser performance issues

---

#### 8.4 Experiment Allocation Validation

**Steps:**
1. Create experiment with uneven allocation:
   - Control: 40%
   - Variant A: 30%
   (Total: 70%, not 100%)
2. Try to proceed or create campaign
3. Verify validation error

**Expected Result:**
- ✅ Shows validation error
- ✅ Error message explains allocation must equal 100%
- ✅ Cannot proceed until fixed

---

#### 8.5 Duplicate Campaign Names

**Steps:**
1. Create a campaign with specific name
2. Try to create another with same name
3. Verify behavior

**Expected Result:**
- ✅ Either allows duplicate names (campaigns can have same name)
- ✅ Or shows error if unique names required
- ✅ Behavior is consistent

---

### Test Suite 9: Campaign Management

#### 9.1 Cancel Campaign

**Steps:**
1. Open a scheduled campaign detail
2. Click **"Cancel Campaign"** button
3. Confirm cancellation in dialog
4. Verify campaign status changes

**Expected Result:**
- ✅ Cancel confirmation dialog appears
- ✅ Campaign status changes to "Cancelled"
- ✅ Cancelled badge appears
- ✅ No more calls are made

---

#### 9.2 Duplicate Campaign

**Steps:**
1. Open an existing campaign
2. Click **"Duplicate"** button (if available)
3. Verify new campaign form opens with same settings
4. Modify name and create

**Expected Result:**
- ✅ Duplicate button opens form
- ✅ Settings are pre-filled
- ✅ Name must be changed
- ✅ New campaign can be created

---

#### 9.3 Delete Campaign

**Steps:**
1. Open a completed/cancelled campaign
2. Click **"Delete"** button (if available)
3. Confirm deletion
4. Verify campaign is removed from list

**Expected Result:**
- ✅ Delete confirmation appears
- ✅ Campaign is removed after confirmation
- ✅ Campaign no longer appears in list

---

## Test Cases Checklist

### Campaign Creation

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Navigate to campaign creation | ⬜ | | |
| Select agent from dropdown | ⬜ | | |
| Upload CSV file | ⬜ | | |
| Upload XLSX file | ⬜ | | |
| Preview recipients shows correct data | ⬜ | | |
| File size validation works | ⬜ | | |
| Invalid file type shows error | ⬜ | | |

### Personalization

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Add string field | ⬜ | | |
| Add enum field with values | ⬜ | | |
| Add number field | ⬜ | | |
| Set field as required | ⬜ | | |
| Set default value | ⬜ | | |
| Template preview renders correctly | ⬜ | | |
| Variable syntax validation | ⬜ | | |

### Experiments

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Create experiment | ⬜ | | |
| Add control variant | ⬜ | | |
| Add test variant | ⬜ | | |
| Allocation validation (100%) | ⬜ | | |
| Multiple experiments | ⬜ | | |
| Variant key uniqueness | ⬜ | | |

### Goals

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Create goal | ⬜ | | |
| Set goal type | ⬜ | | |
| Multiple goals | ⬜ | | |
| Goal key uniqueness | ⬜ | | |

### Campaign Management

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Review campaign settings | ⬜ | | |
| Create campaign success | ⬜ | | |
| Campaign appears in list | ⬜ | | |
| Open campaign detail | ⬜ | | |
| Cancel campaign | ⬜ | | |
| Duplicate campaign | ⬜ | | |
| Delete campaign | ⬜ | | |

### Results & Export

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| View results tab | ⬜ | | |
| View experiment results | ⬜ | | |
| Download results CSV | ⬜ | | |
| CSV has correct columns | ⬜ | | |
| Export performance | ⬜ | | |

### Edge Cases

| Test Case | Status | Tester | Date |
|-----------|--------|--------|------|
| Invalid phone numbers flagged | ⬜ | | |
| Missing required fields error | ⬜ | | |
| Large file upload (1000+ rows) | ⬜ | | |
| Experiment allocation validation | ⬜ | | |
| Duplicate campaign handling | ⬜ | | |
| Network error handling | ⬜ | | |
| Browser refresh state preservation | ⬜ | | |

---

## Screenshots Reference

Take screenshots of the following screens during testing:

1. **Campaign List View** - Show campaigns with status badges
2. **Campaign Creation Form** - Show all tabs and form fields
3. **Personalization Schema Builder** - Show field configuration
4. **Experiment Builder** - Show variant configuration
5. **Goals Configuration** - Show goal setup
6. **Review Screen** - Show summary before creation
7. **Campaign Detail - Overview** - Show metrics and status
8. **Campaign Detail - Recipients** - Show recipient list
9. **Campaign Detail - Experiments** - Show experiment results
10. **Campaign Detail - Results** - Show export button and metrics

---

## Known Limitations

1. **Maximum Recipients**: 10,000 per campaign
2. **File Size**: 5MB maximum for CSV/XLSX uploads
3. **Experiment Variants**: Maximum 10 variants per experiment
4. **Field Names**: Must start with letter, alphanumeric + underscore, max 64 chars
5. **Enum Values**: Maximum 100 allowed values per enum field
6. **Template Variables**: Must match field names exactly

---

## Troubleshooting

### Common Issues

#### 1. "Campaign creation failed"
- **Cause:** Missing required fields or invalid data
- **Fix:** Check all tabs for validation errors (red borders, error messages)
- **Check:** Ensure file has required columns matching personalization schema

#### 2. "File upload failed"
- **Cause:** File too large or invalid format
- **Fix:** Ensure file is under 5MB and is CSV or XLSX format
- **Check:** Verify file has `.csv` or `.xlsx` extension

#### 3. "No agents available"
- **Cause:** No configured agents in organization
- **Fix:** Create and configure an agent first
- **Check:** Agent must have phone number assigned

#### 4. "Experiment allocation error"
- **Cause:** Total allocation doesn't equal 100%
- **Fix:** Adjust percentages to sum to 100%
- **Check:** Each variant must have allocation > 0

#### 5. "Preview not loading"
- **Cause:** Large file or slow connection
- **Fix:** Wait a few seconds, or refresh page
- **Check:** Browser console for errors

#### 6. "Results not showing"
- **Cause:** No calls completed yet
- **Fix:** Wait for calls to be made and complete
- **Check:** Campaign status is "Active" or "Completed"

---

## Browser Compatibility

Test on the following browsers:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)

---

## Sign-Off

After completing all tests:

- [ ] All test cases pass
- [ ] Screenshots captured
- [ ] Edge cases verified
- [ ] Cross-browser testing complete
- [ ] No critical bugs found

**Tester Name:** ________________

**Testing Date:** ________________

**Browser Tested:** ________________

**Issues Found:** ________________

**Approved for Release:** ⬜ Yes / ⬜ No

**Approver Signature:** ________________

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-08-06 | 1.0 | Initial testing guide created |