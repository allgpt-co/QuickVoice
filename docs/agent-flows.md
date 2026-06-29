# Agent Flows

Agent flows let a phone number start with one general QuickVoice agent and route the same live call to specialist agents based on customer intent. A number still belongs to a root agent, and the active flow for that root agent decides which specialist node can take over during the conversation.

## Build a Returns Flow

1. Create a **General Inquiry** agent.
2. Create a **Returns Specialist** agent.
3. Configure both agents with first messages, system prompts, models, voices, and any tools or knowledge they need.
4. Assign the inbound phone number to the **General Inquiry** agent.
5. Open **General Inquiry** in the console and select the **Flow** tab.
6. Click **Create flow**.
7. Add an agent node and select **Returns Specialist**.
8. Connect the General Inquiry start node to the Returns Specialist node.
9. Set the route condition to:
   `Customer asks to return, exchange, refund, or replace an order`
10. Keep or add a default fallback route for callers who do not match the returns condition.
11. Save the flow and turn on **Active**.

## Test Before Calling

Use the **Test** button in the flow toolbar and enter:

```text
I bought this last week and need to return it
```

The result path should show the start node followed by the Returns Specialist node. Warnings should be empty for a valid graph.

## Live Call Verification

After the simulation passes:

1. Place a real call to the phone number assigned to **General Inquiry**.
2. Ask to return or exchange an order.
3. Confirm the worker transfers the conversation to **Returns Specialist** without ending the call.
4. Check the call log after the call ends. The final `agentId` should remain compatible with existing call log views, and metadata should include the flow path.

## Validation Rules

The console blocks saving invalid graphs. A valid v1 flow needs:

- Exactly one start node.
- The start node's agent to match the root agent for the page.
- Every agent node to have an agent selected.
- Every non-terminal node to have at least one outgoing route.
- No route pointing into the start node.
- No outgoing routes from end nodes.
- Condition text on every LLM condition route.
- Nodes reachable from the start node.

## Runtime Notes

The simulation endpoint is a deterministic wiring check. It uses keyword overlap to choose routes and does not make an audio call or evaluate routing with the production LLM. Live routing still depends on the active agent calling the `transfer_to_flow_agent` tool when the caller clearly matches a route.

Agent configuration secrets are resolved only for runtime use. Flow APIs expose graph structure and compiled routing metadata, not secret values.
