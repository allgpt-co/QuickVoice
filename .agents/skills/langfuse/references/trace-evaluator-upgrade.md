---
name: langfuse-trace-evaluator-upgrade
description: Upgrade legacy trace-level LLM-as-a-Judge evaluators to observation-level evaluators by selecting one stable target observation and making the required application instrumentation changes. Use when Langfuse recommends the coding-assistant evaluator upgrade path or provides an evaluator upgrade handoff.
metadata:
  required_access:
    - CODEBASE
    - LANGFUSE_PROJECT_INTERFACE
    - LANGFUSE_PROJECT_SCRIPT
---

# Trace-level evaluator upgrade

In the v4 data model, a trace groups observations sharing a trace ID; it is not a separate record with its own input and output. Observation evaluators run against one ingested observation. Upgrade each legacy trace rule by selecting one semantically correct observation and verifying its own fields.

## Sources of truth

Fetch the [trace-level evaluator upgrade guide](https://langfuse.com/faq/all/llm-as-a-judge-migration) in full before planning or editing. Treat it as the primary reference and fetch it again whenever the API shape, instrumentation guidance, or migration semantics are unclear. Do not infer those details from memory.

Fetch the other applicable pages in full before editing:

- [Langfuse v4 overview](https://langfuse.com/docs/v4)
- [Observation evaluator context](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge#observation-evaluator-context)
- [Python v3 to v4](https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4)
- [JS/TS v4 to v5](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5)
- [Instrumentation and attribute propagation](https://langfuse.com/docs/observability/sdk/instrumentation#add-attributes-to-observations)
- [Evaluation Rules API](https://api.reference.langfuse.com/#tag/unstableevaluationrules)
- [Evaluators API](https://api.reference.langfuse.com/#tag/unstableevaluators)

Discover the current unstable API schema before use. Use unstable evaluation-rule `list` and `get` as the source of truth for legacy trace rules; use the related evaluator endpoint for the complete evaluator definition. Keep legacy trace-target access confined to unstable migration reads; create only modern observation successors.

## 1. Inventory trace rules

- Page through every evaluation rule, then fetch each trace-target rule and its referenced evaluator. If a bulk page fails to parse, retry with `limit=1` to isolate unreadable entries and report them as blockers.
- Record status, block reason, filters, variable mappings and JSONPaths, sampling, delay, time scope, evaluator definition, and score name.
- Migrate only trace-target rules in this section. Dataset-target rules follow the short migration below; do not include observation, experiment, or event rules in this workflow.
- Classify trace rules as active, inactive, or blocked/paused before asking which ones to retain. Offer to delete blocked rules the user no longer needs. Require approval for deletion; if the unstable API cannot mutate legacy trace rules, give the exact UI action instead.
- Separate rules by time scope before planning a migration. Deactivate or delete rules that run only on historical data (`EXISTING` without `NEW`); migrate only rules that depend on new/live data. Require approval before deleting any rule.
- Show the complete inventory and get one consolidated decision about retained and deleted rules. Do not let discarded rules drive code changes.

## Dataset-item evaluator migration

Use the unstable Evaluation Rules API to read the legacy `dataset` rule, then
create an `experiment` rule with the same evaluator, score name, sampling, and
mappings. Translate the dataset filter from `datasetId` to
`experimentDatasetId`; map `dataset_item.expected_output` and
`dataset_item.metadata` to `experimentItemExpectedOutput` and
`experimentItemMetadata`.

Keep the legacy rule active while the project still uses low-level dataset-run
APIs. Disable it once the project emits experiment context; leaving both copies
active can create duplicate scores for Experiment Runner runs. Review mappings
that use `dataset_item.input` or named observations, since those are not always
one-to-one.

## 2. Confirm v4 instrumentation

The SDK upgrade should already have happened. Inspect the repository and a representative newly ingested trace to confirm the resolved SDK or OpenTelemetry path follows the applicable guide under [SDK upgrade paths](https://langfuse.com/docs/observability/sdk/upgrade-path); do not infer readiness from a dependency declaration alone.

V4 SDK migration can change the tracing shape. By default, complete and verify the SDK upgrade before creating successor rules. Migrating against pre-upgrade data is possible but not recommended: link the user to the applicable SDK upgrade guide and proceed only after they explicitly confirm the selected observations, fields, and selectors will remain valid.

Trace rules whose variables already come from one observation can migrate with zero downtime once that observation is confirmed in the v4 data. They should not require evaluator-specific instrumentation beyond adding a missing field or propagated filter attribute.

### Select one observation

Locate the code that creates the representative trace and observations. Match names and types from real project data to their creation sites. Do not treat trace-level UI aggregation as proof that a value exists on an observation.

Use the first applicable path:

1. **Variables already use one observation:** Target it and verify its own input, output, metadata, tool calls, and filter attributes.
2. **Variables use former trace input/output:** There is no separate trace-I/O target in v4. If these values represent the overall request and response, set them as ordinary input/output on the root observation and target it. Otherwise target the observation that semantically owns them.
3. **Variables mix trace context with one observation:** Target that observation and add only the missing context or propagated filter attributes.
4. **Variables use multiple observations:** Prefer an existing root or parent observation that already contains the required result. Only when the required values remain spread across observations, create one dedicated evaluation observation containing those values. Do not serialize the whole trace into metadata.

Do not create a dedicated evaluation observation for a rule that already targets one semantically correct observation. The SDK upgrade should handle the general tracing migration; evaluator-specific code changes should be limited to missing fields, attribute propagation, or the multi-observation case.

For any code change:

- set overall request/response input and output directly on the selected root or workflow observation;
- put extra judge context on the target observation using intentional, stable metadata keys;
- enter trace-attribute propagation scope before creating observations that need trace filters;
- keep observation names and types stable across executions and avoid selectors based on generated names or incidental framework spans.

## 3. Record the upgrade contract

For each retained legacy evaluator, record:

| Field             | Required evidence                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite      | Confirmed v4 SDK/ingestion shape, or the user's explicit acceptance of pre-upgrade migration risk                              |
| Legacy behavior   | Evaluator and score names, filters, variable mappings and JSONPaths, sampling, delay, and expected one-score-per-trace behavior |
| Candidate target  | One stable observation name/type and whether it is the root observation                                                         |
| Variable coverage | Where every required input, output, metadata, or tool-call value exists on that observation                                     |
| Filter coverage   | Where every filter value exists on that observation, including propagated trace attributes                                      |
| Code change       | Exact instrumentation site and fields that must be added or moved                                                               |
| Successor rule    | Observation selector, filters, and one mapping for every evaluator variable                                                     |
| Validation        | Representative execution and expected score count                                                                               |

Inspect every variable and filter. Preserve the evaluator prompt, model, output definition, score name, sampling, delay, time scope, mappings, and JSONPaths unless the user approves a semantic change. Continue using the same evaluator definition when it remains valid.

## 4. Translate filters and mappings

- Add a stable observation selector. Prefer a unique observation `name` plus `type`; use root-observation status when root semantics are part of the contract.
- A legacy trace `name` filter becomes `traceName` on the observation rule. It does not select the target observation by itself; add the observation selector separately.
- Preserve observation-level filters such as name, type, and environment only after confirming the target observation carries those values.
- Trace attributes used by filters, including user ID, session ID, tags, metadata, version, or trace name, must be propagated to the target observation using the current SDK or OpenTelemetry guidance. Configure environment and release using their documented SDK-specific mechanisms and confirm they exist on the target observation.
- Map every evaluator variable exactly once from the target observation's input, output, metadata, or tool-call fields. Preserve JSONPath semantics against the new payload shape.
- Preserve sampling, delay, and new-data time scope. Observation evaluation rules run on newly ingested observations and do not backfill historical data.

Check cardinality explicitly. A trace-level rule produces one score per matching trace; an observation rule produces one score per matching observation. If the existing behavior requires one score per trace, the selector must match at most one observation in each representative trace.

## 5. Create, verify, and retire

Project writes require explicit user approval.

- For a single-observation rule confirmed against v4 data, use a zero-downtime cutover: create the observation successor, enable and validate it on new data while the trace rule remains active, then disable the legacy rule. Warn that the brief overlap may create duplicate scores.
- For rules affected by SDK or evaluator-specific instrumentation changes, deploy and verify the new observation shape first. A pre-upgrade zero-downtime cutover is possible but not recommended unless the user confirms the rule is future-proof for the v4 shape.
- Keep deprecated trace-I/O calls only while an active legacy rule still requires them. Remove them after the successor is verified and the legacy rule is disabled.
- Do not delete historical scores. Delete a blocked legacy rule only when the user selected deletion and approved the write.

Run focused repository checks and one representative instrumented execution when credentials and a runnable environment are available. Verify:

- the intended observation exists exactly once per trace when one-score-per-trace behavior is required;
- its own input, output, metadata, and tool-call fields satisfy every variable mapping;
- every retained filter attribute exists directly on the observation;
- the proposed selector matches the intended observation and excludes siblings;
- no required spans are dropped by SDK export filtering.

Do not claim live verification when project access or a runnable path is unavailable. Return the exact successor configuration and manual checks. If legacy trace mutation is unsupported by the unstable API, return the exact UI step and keep it as an explicit action.

## Output

Return valid Markdown with:

1. complete trace-rule inventory and retain/delete decisions;
2. SDK/ingestion confirmation and any accepted pre-upgrade risk;
3. a per-evaluator upgrade table using the contract above;
4. code files changed and why;
5. exact successor selector, filters, and variable mappings;
6. checks run and observed results;
7. temporary legacy trace-I/O calls still present;
8. project actions or blockers remaining.

Check links, tables, lists, and code fences for valid Markdown before returning.
