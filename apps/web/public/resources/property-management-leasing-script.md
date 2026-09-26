# A request-only leasing script

**Fictional, unexecuted example.** This is an authored script for evaluation, not a transcript, observed QuickVoice call, customer result or promise that these steps work in a deployment. Replace every bracketed instruction before testing. Use synthetic people and properties.

## Before the call

Choose one managed portfolio and a small approved listing-information set. Assign an owner and review date to every listing fact. Define showing hours, property-local time zone, the actual staff request destination and an approved unavailable-destination route. Have responsible staff approve the identity, recording and privacy disclosures for the exact deployment.

This workflow takes enquiries and viewing preferences. It does not book viewings, reserve units, screen applicants, negotiate terms, access private tenant records, create maintenance jobs or dispatch help.

## 1. Identify the assistant and its limits

> Hello, I am the AI assistant for [approved property-management business name]. I can help with approved listing information or take a leasing enquiry for the team. I cannot confirm a viewing. [Insert the approved disclosure for this deployment.] Which property are you asking about?

If the caller names a property that is absent or ambiguous, ask a clarifying question. Do not choose a unit based on an uncertain match or infer which person lives there.

## 2. Answer only from approved facts

> The approved listing information says [verified fact].

When availability, rent or another answer is missing or out of date:

> I do not have verified current information for that question. The property team needs to confirm it.

Do not turn a quoted listing fact into an offer, reservation, guarantee or eligibility decision. Keep the information-source date visible to the evaluator.

## 3. Collect a minimal request

> Would you like the team to review a viewing request, or would you prefer a callback about the property?

> What name and callback number should the team use? What date and time would you prefer, in [property-local time zone]?

Only ask for a time preference when relevant. The proposed record contains the verified property reference, request type, caller-approved name and callback details, any clarified viewing preference, the unanswered question and the exact next step stated to the caller. Treat unknown fields as unknown; do not fill them from guesses.

Do not ask for an application, Social Security number, payment card, medical detail, door code or another tenant's information. A transcript is not proof that these fields were extracted correctly. Check the actual saved record.

## 4. Read back corrections

> Let me check the request: [property reference], [callback details], and [viewing preference or question]. Is anything incorrect?

Apply any correction and check the destination record during testing. Caller ID does not replace the caller's agreed callback number.

## 5. Close without claiming a booking

Use the following only when the implemented flow can verify receipt before the call ends:

> Your request was received for the property team to review. Your viewing is not booked. The team still needs to confirm availability and the next step. [State only the approved follow-up arrangement.]

If receipt happens after the call or cannot be verified during it:

> I have noted your request in this conversation, but I cannot confirm that the team has received it yet. Your viewing is not booked. [Give the approved alternative contact route.]

Do not promise a response time without a staffed process supporting it. A queued retry or persisted call transcript is not staff acknowledgement. Test both the call's wording and the later delivery outcome.

## 6. Use an honest failure route

When request delivery fails or the destination is unavailable:

> I cannot confirm that your request reached the team. [Give the approved alternative contact route and its actual availability.] I have not booked a viewing.

The operator must define who reconciles failed or duplicate requests. A retry must not silently create another appointment or be counted as a completed handoff.

## 7. Stop when the call leaves the scope

For applicant screening, policy exceptions or accommodation requests, use the operator's approved staff-review process. Do not approve, deny, infer suitability or solicit unnecessary personal information.

For maintenance or an urgent concern, stop the leasing flow and use the separately approved instructions. This template deliberately does not supply emergency advice. Never diagnose a hazard, promise dispatch or claim a person answered without confirmation. If no approved and tested route exists, the pilot is not ready for live calls.

## Review with the actual implementation

QuickVoice's [live MCP handler](https://github.com/allgpt-co/QuickVoice/blob/main/apps/ai/handlers/mcp_handler.py) restricts marked write and side-effect tools. A PMS write or booking needs a separately implemented permitted path; caller agreement alone does not enable it.

The [property-management workflow](/industries/real-estate) and [workflow guide](/blog/ai-voice-agents-property-management) describe the scope. Use the [30-case scorecard](/resources/property-management-benchmark-scorecard.csv) and [pilot checklist](/resources/property-management-pilot-checklist.md) to test it. No test has been executed by publishing this script.
