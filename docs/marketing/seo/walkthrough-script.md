# Product evaluation walkthrough: recording script

Status: script prepared; recording not produced. Audience: a business workflow owner with a technical evaluator. Use a synthetic appointment-request or reception workflow. This is a demonstration, not customer evidence or a production benchmark. Target length: approximately 5–7 minutes; this is the video duration, not deployment time.

## Before recording

Prepare a clean test organization, synthetic business FAQ, non-sensitive sample request and the actual tested software version. Verify the specific phone/voice/provider path beforehand. Show only actions that work in that environment. For unavailable functionality, stop at the documented boundary and describe the additional integration work. Do not simulate a successful booking as though it occurred.

The default [live MCP bridge](../../../apps/ai/handlers/mcp_handler.py) hides tools marked as writes, mutations, side effects or requiring confirmation from live-call instructions and rejects their execution through that path. An MCP connection or caller request does not by itself enable a calendar booking or CRM write. Demonstrate a confirmed external action only when a separately implemented, permitted action path has been tested and the resulting destination record verified; otherwise show request intake and the actual human follow-up boundary.

## Shot list and narration

| Segment | Visual | Narration |
| --- | --- | --- |
| 0:00–0:35: the job | A one-page workflow: caller asks, agent clarifies, system records next step, human handles exceptions | “This evaluation starts with one business job: collecting an appointment request and routing it to the right next step. Before building, we define what success means and where a human takes over.” |
| 0:35–1:15: prerequisites | README setup boundaries, then the test console | “QuickVoice provides source code and a console for AI phone-agent workflows. An engineering owner configures the deployment and providers. Real calls require LiveKit, a telephony provider and model credentials. This recording uses a prepared test environment.” |
| 1:15–2:10: agent setup | Actual agent fields and the approved test knowledge | “Here are the instructions and knowledge for this example. We specify what the agent can answer, what information it should collect and when to stop. We are using fictional business details.” |
| 2:10–3:30: test interaction | Actual consenting-staff or synthetic-data call; label it “Test call” | “Listen for three things: whether the caller's request is understood, whether missing details are clarified and whether the response matches the approved knowledge. A fluent voice is only one part of a successful workflow.” |
| 3:30–4:15: verify outcome | Actual call log and destination system if a tested tool exists | “We now check the recorded outcome. If an external system is part of the workflow, we verify its record separately. The agent saying that an action succeeded is not sufficient evidence.” |
| 4:15–5:05: failure case | Repeat with an unanswered question or deliberately unavailable test tool | “This second example checks the fallback. The system should avoid claiming success when it cannot complete the action. We record the failure and the next human step.” |
| 5:05–5:50: business evaluation | Buyer checklist and cost model with visible “illustrative inputs” label | “Before wider use, compare outcomes, failed attempts, human follow-up and total cost with your own baseline. Provider charges, setup time and ongoing review belong in that calculation.” |
| 5:50–6:15: next step | Relevant workflow page plus `/open-source` | “Use the workflow guide to define your requirements. Your technical evaluator can inspect the source and setup boundaries. A fit discussion starts with one call type, its volume and the systems it must reach.” |

## Recording checks

- Verify every visible outcome in the actual system; retain the internal test date/version with the recording notes.
- Remove real contacts, call IDs that identify customers, credentials and internal URLs from the published cut.
- Add captions and a text transcript. Label cuts and synthetic/test calls where omission could imply uninterrupted success.
- Do not add outcome percentages, customer logos, compliance badges or a deployment-time stopwatch.
- Publish only to an authorized owned channel after the destination is live and the business/technical review is complete. Record the final URL in the calendar.
