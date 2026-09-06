---
slug: reminders-collections
title: Reminder and payment follow-up workflows
metaTitle: Reminder and payment follow-up workflows | QuickVoice
metaDescription: Plan appointment or payment reminders with verified contact eligibility, minimal disclosure, staff ownership and an explicit stop process.
category: Reminder and payment follow-up workflows
tags: [workflow planning, implementation requirements]
canonical: https://quickvoice.co/use-cases/reminders-collections
---

## Purpose

Appointment reminders and payment follow-up have different purposes and requirements. Design each workflow separately, obtain the relevant operational and legal review, and start with synthetic records before contacting anyone.

## Confirm eligibility and timing

Assign an owner to verify the audience, purpose, contact permission, time window and suppression process for the exact campaign. Do not treat an existing phone number as permission to call.

## Limit what the call reveals

Use an approved identity check before discussing private appointment or account information. Keep voicemail and wrong-party messages minimal; do not collect raw card details into prompts or transcripts.

## Route requests and disputes

Provide a clear staff path for disputes, hardship, rescheduling or requests to stop. Changes to payment terms or appointments require separately authorized and verified actions. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.

## Implementation requirements

- A responsible owner for campaign purpose, eligibility, notices, timing and suppression.
- Qualified review of the exact jurisdiction, communication type and recipient circumstances.
- Verified account data, a human dispute process and tested provider/action boundaries.

Real calls require configured voice, telephony and model providers and a technical owner. The MIT source license does not include provider charges or establish deployment readiness.

## Pilot checks

- **The wrong person answers:** Avoid disclosing the appointment, balance or debt; follow the approved wrong-party procedure.
- **Recipient asks for no more calls:** Use the implemented suppression and staff process, then verify that future eligibility checks honor the request.
- **Customer disputes a balance or asks for different terms:** Route to authorized staff without inventing an amount, threat, settlement or payment agreement.

## Evidence and next steps

Read the [repository setup boundaries](https://github.com/allgpt-co/QuickVoice#setup-boundaries) and [live MCP action restrictions](https://github.com/allgpt-co/QuickVoice/blob/main/apps/ai/handlers/mcp_handler.py). Verify the current deployment and required external systems with your implementation team. No customer results, compliance certification, named business connector, fixed launch timeline or cost saving is asserted.
