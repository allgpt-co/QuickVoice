---
slug: hr-recruiting
title: "HR and recruiting phone workflows"
metaTitle: "HR and recruiting phone workflows | QuickVoice"
metaDescription: "Plan candidate enquiries, interview availability and HR callback requests with approved information, human decisions and tested system connections."
canonical: https://quickvoice.co/industries/hr-recruiting
---

Start with administrative calls: explain a published role, collect interview availability or record a question for HR. Configure QuickVoice with approved information and a staff follow-up process. Keep candidate evaluation and employment decisions with accountable people.

## Plan the workflow

### Define the information callers need

Use the current job description, interview instructions and approved policy answers. Avoid guessing about pay, benefits, eligibility or application status.

### Collect an administrative request

Ask for the minimum details needed to arrange a callback or discuss interview availability. Offer a human alternative for sensitive questions or accessibility needs.

### Confirm the staff handoff

An applicant-tracking or calendar update requires an implemented, permitted action path. The default live MCP bridge restricts tools marked as writes or side effects; a candidate's request does not enable them.

## Implementation requirements

- An HR owner for scripts, candidate communication and human review.
- A technical owner to implement any applicant-system or calendar connection and test its permissions.
- An agreed data-minimization, retention and access policy for candidate information.

## Evaluate before routing customer calls

### Candidate requests an accommodation

The workflow offers the approved human contact and does not decide whether the accommodation is justified.

### Candidate asks whether they passed screening

An authorized status source or recruiter provides the answer; the agent does not infer a hiring decision from the conversation.

### Interview slot cannot be written

Record availability as a request and identify who will confirm it. Do not announce a booked interview.

## Questions to resolve

### Does a structured call establish fair hiring?

No. A script or transcript does not establish fairness, job relevance or legal compliance. Keep evaluation with responsible reviewers and assess the actual process, including accessibility and the effects of any automated criteria.

### Are HR and applicant-system connectors included?

Do not assume a named connector is available. Verify the target system's API, authentication, data fields and permitted actions with your implementation team before a pilot.

## Implementation evidence

QuickVoice's [repository and setup boundaries](https://github.com/allgpt-co/QuickVoice#setup-boundaries) describe the application and required providers. Its [live MCP handler](https://github.com/allgpt-co/QuickVoice/blob/main/apps/ai/handlers/mcp_handler.py) restricts tools marked as writes or side effects. Confirm the version and configuration used for your pilot.

These are evaluation patterns, not a report of customer results. Review [current pricing and cost boundaries](https://quickvoice.co/pricing) and [discuss the intended workflow](https://quickvoice.co/company/contact).
