# AI phone-agent implementation checklist

A working evaluation sheet for business and technical owners. Complete one workflow before adding others. This is an evaluation aid, not a certification or a promise of QuickVoice functionality.

Project / workflow: __________  Business owner: __________  Technical owner: __________
Review date: __________  Intended callers: __________  Decision date: __________

## 1. Define the business job

- [ ] Choose one call type: appointment request, answering-service intake, support triage, or lead qualification.
- [ ] Write the exact successful outcome, including the system where it must be recorded.
- [ ] List questions the agent may answer and actions it may request. List prohibited topics/actions.
- [ ] Identify a human fallback, staffed hours, contact destination, and expected next step when unavailable.
- [ ] Record baseline call attempts, answered calls, relevant outcomes, staff time, and cost over a named period. Use aggregates, not caller transcripts, in the business case.
- [ ] Define decision thresholds before the pilot: acceptable completion rate, failed/escalated-call rate, duplicate-action count, and maximum cost. Enter actual thresholds: __________.

## 2. Confirm implementation dependencies

- [ ] Assign an engineer or implementation partner. Confirm the required console, API, worker, database and provider setup.
- [ ] Verify the exact deployment version and documented setup path. A local startup is distinct from a functioning carrier-connected call.
- [ ] Confirm LiveKit, telephony and model-provider accounts, quotas, permissions, credentials and expected costs.
- [ ] Check each calendar/CRM/helpdesk operation individually: available API, authentication, permissions, field mapping, errors and duplicate prevention. Do not assume a logo means a working integration.
- [ ] Prepare a small approved knowledge set with an owner and update date; remove contradictory or expired answers.
- [ ] Record who operates infrastructure, responds to incidents, reviews calls, changes prompts and pays provider bills.

## 3. Review data and caller handling

- [ ] Map audio, transcript, recording, contact data, tool requests, logs and backups to their actual storage/processors.
- [ ] Decide data access, retention and deletion requirements; verify them in the chosen deployment.
- [ ] Have the responsible business reviewer confirm caller notices, consent needs and any relevant sector obligations. Obtain required provider agreements before sensitive data is used.
- [ ] Use synthetic examples and consenting staff for initial tests. Keep credentials and personal information out of public screenshots.
- [ ] Document where the agent must stop, escalate or decline to act; test those cases.

## 4. Test a realistic call set

| Scenario | Expected result | Actual result / evidence | Owner |
| --- | --- | --- | --- |
| Normal request with all information | Correct next step; one recorded outcome | __________ | __________ |
| Missing or ambiguous information | Clarify without guessing | __________ | __________ |
| Caller interrupts or corrects details | Use corrected information | __________ | __________ |
| Unknown answer | Admit uncertainty; use documented fallback | __________ | __________ |
| Calendar/tool/provider unavailable | No false booking or false success | __________ | __________ |
| Duplicate request or retry | No duplicate side effect | __________ | __________ |
| Caller asks for a human | Follow the configured escalation path | __________ | __________ |
| Out-of-scope or sensitive request | Stop or escalate per agreed policy | __________ | __________ |
| No answer / voicemail / wrong contact | Record correct disposition; apply retry policy | __________ | __________ |
| Poor audio or unexpected language | Clarify or fall back; do not claim comprehension | __________ | __________ |

## 5. Decide using measured results

- [ ] Reconcile outcome counts against source systems, including failed attempts and human follow-up.
- [ ] Enter observed inputs and provider quotes in [the cost worksheet](cost-estimation.csv); replace every illustrative input.
- [ ] Compare the pilot with a comparable baseline period and disclose staffing, demand or process changes.
- [ ] Review failures with the business owner and engineer; fix and retest material issues.
- [ ] Record a clear decision: expand, revise and retest, or stop. Keep a rollback plan and a reachable owner.

Decision: __________  Reason/evidence: __________  Next review: __________
