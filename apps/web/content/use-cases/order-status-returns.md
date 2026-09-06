---
slug: order-status-returns
title: Order status and returns workflows
metaTitle: Order status and returns workflows | QuickVoice
metaDescription: Plan WISMO enquiries and return requests using authorized order lookups, current carrier information and verified actions.
category: Order status and returns workflows
tags: [workflow planning, implementation requirements]
canonical: https://quickvoice.co/use-cases/order-status-returns
---

## Purpose

Separate a status read from a return or refund action. A bounded workflow can answer from an approved source or record what the shopper needs; it should only announce a completed return or refund after the destination confirms it.

## Verify the caller and order

Define identity checks appropriate to the information being disclosed. An order number alone should not grant access to addresses, payment details or another customer account.

## Explain the latest verified status

Implement the order and carrier lookup, include the source time and distinguish estimates from completed delivery events. Route missing or conflicting records to support.

## Handle the return request

Use the current return policy and an accountable exception owner. Return authorization, labels, exchanges and refunds are separate actions, each requiring a verified result. The default live MCP bridge restricts tools marked as writes or side effects. A system change requires a separately implemented permitted action path and a verified destination result; a caller request alone does not enable it.

## Implementation requirements

- A support owner for return policy, eligibility exceptions and follow-up.
- A tested order and tracking connection with scoped access and stale-data handling.
- A separately implemented action path for each return or refund operation that is in scope.

Real calls require configured voice, telephony and model providers and a technical owner. The MIT source license does not include provider charges or establish deployment readiness.

## Pilot checks

- **Carrier and order records disagree:** Explain that verification is needed and route the discrepancy; do not choose a plausible status.
- **Customer requests a late return:** Collect the request for the policy exception owner without inventing eligibility.
- **Refund request times out:** Check the payment or order system before retrying to prevent a duplicate refund.

## Evidence and next steps

Read the [repository setup boundaries](https://github.com/allgpt-co/QuickVoice#setup-boundaries) and [live MCP action restrictions](https://github.com/allgpt-co/QuickVoice/blob/main/apps/ai/handlers/mcp_handler.py). Verify the current deployment and required external systems with your implementation team. No customer results, compliance certification, named business connector, fixed launch timeline or cost saving is asserted.
