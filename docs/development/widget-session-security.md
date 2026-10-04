# Anonymous widget session inputs

Public widget session creation accepts an empty body or tracking-only visitor ID:

```json
{"visitorId":"visitor-generated-tracking-id"}
```

Unknown fields, including `dynamicVariables`, `dynamic_variables`, prompt
overrides, and nested metadata, return HTTP 400 before session creation. The
bundled widget already sends only `visitorId` and needs no payload change.

The server no longer renders visitor values into the greeting/system prompt or
dispatches them as tool variables. The AI worker loads the saved agent
configuration and renders its configured placeholder defaults. Widget session
metadata cannot override prompts, variables, language, or voice. This also
protects against old dispatch metadata created before the server update.

For widgets, participant attributes cannot override dispatch identity or mode.
Legacy prompt/variable overrides are removed before initiation webhooks receive
metadata. Initiation webhooks still run, but their returned session variables
are not used to personalize widget prompts or tool parameters. Trusted preview
and outbound personalization retain their existing behavior.

HTTP tool parameters configured as Dynamic Variable use configured/runtime
variable values only. A missing value no longer falls back to an LLM argument.
Missing required values fail before sending the HTTP request; optional missing
values are omitted. This applies to all call types. Use LLM Prompt parameters
explicitly for caller-supplied search terms and other non-authoritative input.

## Identity and authorization

Allowed origins restrict browser embedding; an Origin header is not customer
authentication. Neither `visitorId`, spoken input, nor LLM arguments prove that
a visitor owns a customer account. Tools on anonymous widgets should expose
only operations safe for anonymous visitors. Tenant backends must authorize
access independently before returning private data or performing mutations.

Customer-specific personalization needs a separate server-verified identity
design (for example, short-lived signed claims bound to the authenticated
customer, widget, and tenant). This patch does not introduce that capability.

## Deployment and checks

Deploy both QuickVoice Server and the AI worker. No migration or new environment
variable is required. Custom embeds that send dynamic variables must remove
those fields; widget-specific personalization now uses saved configuration.

Regression coverage:

- `apps/server/tests/api/reported-endpoints.test.ts`: forged allowed origins do
  not permit prompt/variable fields; empty/tracking-only inputs remain valid.
- `apps/ai/tests/test_worker_helpers.py`: legacy metadata and participant
  attributes cannot override widget configuration; trusted call flows remain.
- `apps/ai/tests/test_http_tool_handler.py`: missing required dynamic identities
  cannot be filled by LLM arguments and do not reach a provider.
