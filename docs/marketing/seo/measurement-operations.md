# Business-outcome measurement operations

## Verified access and remaining activation

**Current check, September 21, 2026:** the existing utility returns `already_configured`: `generate_lead` uses `ONCE_PER_EVENT` with no `defaultValue`, and all three EVENT dimensions exist. The September 20 07:45 UTC private portfolio-health run also confirms the corrected key event. The earlier USD 1 observation is historical and no longer a blocker. No registrations or reporting OAuth scopes were changed. See the [consent repair and deployment handoff](follow-up-2026-09-21.md).

**Historical read-only check, September 16, 2026:** GA4 property `543950329` (QuickVoice, `America/Los_Angeles`) remains accessible. The refreshed existing OAuth grant has `analytics.readonly`, not `analytics.edit`. Registered key events are `close_convert_lead`, `qualify_lead` and `purchase`; `generate_lead` is absent. No custom dimensions are registered. No GA administrative changes or live test enquiries were performed in this check.

Collection has resumed since September 6; reinstalling the working tag is not the remaining task. Code emission, key-event registration, acknowledged contact delivery, inbox placement, confirmed bookings and sales qualification are separate checks. Earlier collection gaps invalidate a clean historical conversion-rate baseline. An empty event report is not evidence that no business enquiries existed.

### Safe GA4 registration utility

```sh
# Read-only inspection and proposed registrations; never writes GA settings.
python3 scripts/seo-measurement-setup.py
# Same read-only check; exits 2 for missing or mismatched configuration.
python3 scripts/seo-measurement-setup.py --check
```

The utility reads the property and **all pages** of current registrations. It proposes only:

| Registration | Definition |
|---|---|
| Key event `generate_lead` | Newly created with `ONCE_PER_EVENT`; no invented monetary value |
| Event-scoped `cta_type` | CTA type, e.g. contact versus demo click |
| Event-scoped `link_location` | Placement of the clicked link |
| Event-scoped `form_location` | Homepage versus contact-page form |

Existing matches are never edited or deleted. The check requires once-per-event counting and no default value for `generate_lead`; a mismatch returns `configuration_mismatch` and blocks all apply mutations until an authorized administrator corrects that existing entry. A zero default is still a configured value. Unrelated registrations remain untouched. A same-name parameter with a different scope does not replace an event-scoped definition. Prefer native page dimensions over adding a redundant custom `page_path` definition.

After an authorized administrator supplies an **existing appropriately scoped credential** through the secure environment, they can explicitly run:

An optional short-lived `GA_ADMIN_ACCESS_TOKEN` takes precedence in this utility
so the existing read-only reporting refresh grant cannot shadow it. Supply it
through secure credential injection, never a command argument or chat message.
Do not copy the administrator token to the weekly reporting repository. The
default reporting credentials and their scope remain unchanged.

```sh
python3 scripts/seo-measurement-setup.py --property 543950329 --apply
```

The tool checks `analytics.edit` before any administration POST. Scope alone does not guarantee the required property permissions: the API may still reject a write. It verifies registrations by reading them back before returning `verified_configured`. Partial/uncertain writes, permission errors and failed verification exit nonzero; do not repeatedly apply after a timeout—first rerun the dry-run and inspect the remaining operations. The utility never starts an OAuth flow, expands a grant, submits an enquiry, creates Measurement Protocol secrets, or modifies tags.

Use the existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` environment credentials; refresh happens only in memory. An already authorized `GA_ACCESS_TOKEN` is supported if refresh credentials are unavailable. Never paste credentials into commands or commit them. Dry-run output contains configuration, not token values. GA4 registration affects reporting going forward, not prior history. References: [key-event creation and edit scope](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents/create), [custom-dimension creation](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions/create), [key-event reporting timing](https://support.google.com/analytics/answer/13128484?hl=en).

## Reconcile actual enquiries and bookings without inventing attribution

Use the [header-only CSV template](lead-scorecard-template.csv). Keep completed exports under ignored `output/seo/` or an approved private location, not in Git. This is a local reconciliation tool, **not** a CRM connector, tracking pixel, booking integration, or evidence verifier. A sales/operations owner must supply verified records from delivery logs, calendar confirmations and the sales system. It makes no network requests and emits only aggregate JSON, never record identifiers.

```sh
# Copy the header-only template to a PRIVATE location and fill verified records.
python3 scripts/seo-lead-scorecard.py output/seo/business-outcomes.csv \
  --start 2026-09-16 --end 2026-10-13 \
  --as-of 2026-10-14T12:00:00Z
```

Use actual reporting dates and extraction time; the dates above are an example, not a completed baseline. `--as-of` defaults to the current UTC instant. Calendar boundaries default to GA4's `America/Los_Angeles`; `--timezone` can override that explicitly. Preserve exports and their extraction dates so later cancellations do not masquerade as reporting errors.

### CSV contract

| Field | Required meaning |
|---|---|
| `prospect_id` | One opaque identifier per business prospect across enquiry, booking and sales systems; use a UUID or `p_` plus 16–64 lowercase hexadecimal characters. Never use names, emails or phone numbers. |
| `event_id` | Stable opaque identifier for the particular enquiry, original booking or stage transition; UUID or `e_` plus hexadecimal characters. Repeated exports/status updates reuse it. |
| `event_kind` | `enquiry`, `booking`, `qualified`, or `opportunity`. |
| `status` | `confirmed`, `cancelled`, or, for a booking only, `rescheduled`. Cancellation also represents a revoked qualification/opportunity when explicitly verified. |
| `occurred_at` | Original time that event/stage occurred, ISO 8601 with timezone; never replace it with the new appointment date when rescheduling. |
| `updated_at` | Time this status/context version was recorded, with timezone; no earlier than `occurred_at`. |
| `is_test` | Exactly `true` or `false`. Any supplied test history excludes that entire prospect. |
| `is_us` | `true`, `false`, or `unknown`, based on verified business/customer geography, not merely the visitor's IP location. |
| `attribution` | `organic_search`, `other`, or `unknown`, based on verified acquisition context. Preserve that context across stages after a verified match, rather than guessing from a matching name or browser visit. |
| `landing_page` | Original normalized public acquisition path, such as `/solutions/ai-receptionist`; blank if unknown. No full URLs, queries, fragments, free text or personal data. |

All headers are required; extra columns are rejected rather than silently ingesting contact data. IDs with embedded contact information, malformed timestamps, contradictory versions and changed event identity fail validation without printing record contents. Data-entry staff remain responsible for ensuring apparently valid IDs/paths contain no personal data.

### Counting rules and sales definitions

- **Enquiry:** verified received business contact, not a CTA click. Provider acknowledgement alone does not prove inbox placement; retain the delivery/inbox verification process in the [contact runbook](contact-delivery-operations.md).
- **Booking:** calendar-confirmed meeting, not a TidyCal link click. Until completion attribution is verified, manually export bookings as `attribution=unknown`; these remain visible in overall totals but receive **no organic credit**, even if another event for the same prospect has organic attribution. Assign the shared prospect ID only after an authorized, verified match.
- **Qualified:** sales owner confirms a real relevant US business, a phone-agent use case, an identifiable decision-maker or sponsor, and willingness to discuss implementation. Spam, students/research-only queries, test contacts and unsupported-use-case enquiries are not qualified. Capture the detailed evidence in the private sales system, not this CSV.
- **Opportunity:** sales accepts a concrete potential project into its pipeline; do not infer it from a demo, qualification, or GitHub click. This script does not count customers, revenue or closed-won outcomes.
- Most recent `updated_at` at/before `--as-of` wins per event. Exact duplicate exports are harmless. Reschedules preserve the original booking identity/time and do not create another conversion. A cancelled booking removes that booking, not a separate received enquiry. If a scheduler creates a new ID on reschedule, reconcile it to the original internal `event_id` before export.
- The report counts **distinct prospects per stage** within the selected occurrence-date window. Several enquiries/bookings from one prospect count once in that stage. A prospect can appear in several stages and acquisition-page rows: neither is additive, and the report is not a session-to-lead conversion rate or a single acquisition-cohort funnel.
- US organic credit requires both `is_us=true` and `attribution=organic_search` on that stage's record. Country/source unknowns are reported separately, not forced into US organic. A missing landing page appears as `(unknown)` but does not overwrite verified source evidence.
- Include earlier versions if replaying `--as-of`; a later-only snapshot cannot reconstruct prior status. Missing input records and an empty template mean **no supplied evidence**, not zero real business activity. No synthetic example prospects are bundled as business results.

## Ownership and checks

Growth operations owns weekly private exports and source/landing-page checks; sales owns qualification/opportunity decisions; the GA administrator owns registration; web engineering owns event emission and safe contact attribution. Review the US organic scorecard alongside [read-only GSC/GA reports](reporting-operations.md), not as a replacement for them. Alert on contact-delivery failures and lost Analytics collection; reconcile actual received enquiries separately from recorded `generate_lead` counts. Start the first clean 28-day qualified-enquiry baseline only after end-to-end measurement is verified.

```sh
python3 -m unittest discover -s scripts -p 'test_seo_measurement_setup.py'
python3 -m unittest discover -s scripts -p 'test_seo_lead_scorecard.py'
```

These offline tests mock Google administration and use temporary synthetic CSV data. They cover read-only defaults, scope guards, idempotency, pagination, partial-write reporting, error redaction, test exclusion, source unknowns, reschedules/cancellations, timezone boundaries and identifier-free outputs. They do not send live enquiries or Google Analytics events. Browser event checks are a separate Playwright task with collection intercepted during QA.
