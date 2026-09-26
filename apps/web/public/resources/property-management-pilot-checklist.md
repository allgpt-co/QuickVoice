# Leasing-intake pilot checklist

**Planning template, not a completed review or customer result.** All items below start unchecked. The companion 30-case benchmark is synthetic and unexecuted. Passing a finite test set would not prove universal reliability, compliance or commercial results.

## Define the job and owners

- [ ] Choose leasing enquiries only. Keep maintenance, screening and outbound campaigns outside this pilot.
- [ ] Name the property-information owner, implementation owner, request-review owner and fallback owner.
- [ ] Define portfolio, hours, time zone, approved call types and which callers are eligible for evaluation.
- [ ] Agree what a complete record means: property reference, request type, callback details, relevant preference, unresolved question and truthful stated next step.
- [ ] Define the staff acknowledgement window and escalation process from real coverage; do not copy an invented service-level promise.

## Verify the implementation, not a logo

- [ ] Confirm phone/provider configuration, approved knowledge sources and their review dates.
- [ ] Inspect exactly where call records and any extracted fields are persisted. Compare the record with the caller's words.
- [ ] Demonstrate the actual staff receipt and acknowledgement process. A transcript, queued retry and staff acknowledgement are different states.
- [ ] If a PMS or calendar operation is proposed, verify access, permissions, field mapping, destination success, timeouts and duplicate handling. Otherwise keep the flow request-only.
- [ ] Define honest closing language when receipt can only be checked after the call.
- [ ] Verify the unavailable-destination alternative and failure reconciliation owner. Do not advertise a transfer until it has actually been demonstrated.

## Approve boundaries and data handling

- [ ] Have responsible staff approve the exact identity, recording and privacy disclosures and the handling of caller corrections.
- [ ] Exclude eligibility decisions, housing recommendations based on personal traits, negotiation, unit reservations and private tenant lookups.
- [ ] Approve a separate route for maintenance and urgent concerns, including the unavailable-destination case. Do not diagnose, authorize repairs or claim dispatch.
- [ ] Use synthetic callers, addresses and records first. Do not place real caller names, numbers, addresses, recordings, transcripts, tokens or private-system links in public files or the initial contact form.
- [ ] Keep evidence in an access-controlled location with an owner, approved retention and deletion process. Put only non-identifying local references in the private scorecard/log.
- [ ] Review what every audio, model, storage and analytics provider receives before any live pilot. A checklist is not certification or legal approval.

## Run and record the synthetic evaluation

- [ ] Run all 30 specifications against the intended configuration; repeat when relevant configuration changes.
- [ ] Leave outcomes blank until execution. After execution, record pass, fail or blocked; blocked is not a pass. Record observed behavior, version, reviewer and private evidence reference.
- [ ] Mark any observed unsafe disclosure, eligibility decision, false booking/dispatch or missing urgent fallback as a critical failure, even if its scenario was classified standard.
- [ ] Stop expansion for any critical failure or untested critical path. Fix it and rerun affected and neighboring cases.
- [ ] Review record accuracy, destination receipt, duplicate behavior and actual staff acknowledgement separately. Do not report synthetic scenarios as customer calls.

## Establish an honest baseline and pilot log

- [ ] Define baseline and pilot periods with comparable call types, coverage hours and inclusion rules. Record changes in staffing, demand and scope.
- [ ] Use one private log row per observed call, with a non-identifying record key. Mark eligibility and exclusions rather than quietly dropping difficult calls.
- [ ] Use yes, no or unknown for observation fields. An unknown is not success; leave numeric costs and staff minutes blank when unmeasured, not zero.
- [ ] Count complete, receipt-verified and staff-acknowledged records among eligible leasing calls. Report the numerator, denominator, unknowns and missing evidence.
- [ ] Track corrections, unresolved handoffs, completed staff follow-up and staff time separately. Do not infer viewings held, leases or revenue from intake.
- [ ] Use the existing [cost worksheet](/resources/cost-estimation.csv) and [instructions](/resources#costs), replacing illustrative inputs with observed costs and dated quotes. Include engineering and human follow-up.

## Decide whether to continue

- [ ] Have operational and technical owners review failures, unknowns, operating effort and remaining risks. Agree acceptance thresholds before examining results.
- [ ] Limit any live pilot to the reviewed scope, with a way to stop routing calls and a person responsible for monitoring.
- [ ] Obtain separate customer permission before publishing a name, logo, quotation, recording or aggregate result. Keep raw evidence private and publish only approved non-identifying findings.
- [ ] Record continue, revise or stop, with the decision owner, date and unresolved conditions. Do not replace missing evidence with a hypothetical success story.

For broader setup checks, reuse the existing [implementation checklist](/resources#checklist). To discuss the dependencies without sharing caller records, [discuss a leasing-intake pilot](/company/contact).
