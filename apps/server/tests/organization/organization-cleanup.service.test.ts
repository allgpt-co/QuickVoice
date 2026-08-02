import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanupOrganizationBeforeDeletion,
  cleanupOrganizationDeletionHook,
} from "../../src/modules/organization/organization-cleanup.service.js";

const noLocalResources = {
  listPhoneNumbers: async () => [],
  listKnowledgeSources: async () => [],
  listRecordings: async () => [],
  listCampaignFiles: async () => [],
  listSubscriptions: async () => [],
};

test("Stripe preflight and customer detachment happen before local cleanup and suppress the later Better Auth check", async () => {
  const operations: string[] = [];
  const organization: { id: string; stripeCustomerId: string | null } = {
    id: "org_123",
    stripeCustomerId: "cus_123",
  };

  const result = await cleanupOrganizationDeletionHook(organization, {
    hostedBilling: true,
    hasFinancialHistory: async () => {
      operations.push("discover-financial-history");
      return false;
    },
    hasPendingTopUps: async () => {
      operations.push("discover-pending-topups");
      return false;
    },
    listPhoneNumbers: async () => {
      operations.push("discover-phone-numbers");
      return [{ phId: "phone_1" }];
    },
    listKnowledgeSources: async () => {
      operations.push("discover-knowledge-sources");
      return [
        {
          kbId: "kb_1",
          agentId: "agent_1",
          storagePath: "kb/org_123/file.pdf",
          sourceType: "PDF",
        },
      ];
    },
    listRecordings: async () => {
      operations.push("discover-recordings");
      return [{ callId: "call_1", audioRecordingPath: "recordings/call.ogg" }];
    },
    listCampaignFiles: async () => {
      operations.push("discover-campaign-files");
      return [{ campaignId: "campaign_1", sourceFileKey: "batches/list.csv" }];
    },
    listSubscriptions: async () => {
      operations.push("discover-local-subscriptions");
      return [{ status: "active", stripeSubscriptionId: "sub_local" }];
    },
    listStripeSubscriptions: async (customerId) => {
      operations.push(`stripe-list:${customerId}`);
      return [
        { id: "sub_active", status: "active" },
        { id: "sub_orphan", status: "paused" },
        { id: "sub_checkout", status: "incomplete" },
        { id: "sub_expired", status: "incomplete_expired" },
        { id: "sub_done", status: "canceled" },
      ];
    },
    cancelSubscription: async (subscriptionId) => {
      operations.push(`stripe-cancel:${subscriptionId}`);
    },
    deleteCustomer: async (customerId) => {
      operations.push(`stripe-customer:${customerId}`);
    },
    releaseNumber: async (_organizationId, phId) => {
      operations.push(`phone:${phId}`);
    },
    cleanupKnowledgeSource: async ({ kbId }) => {
      operations.push(`kb-assets:${kbId}`);
    },
    deleteKnowledgeSource: async (kbId) => {
      operations.push(`kb-row:${kbId}`);
      return {} as never;
    },
    clearRecording: async (callId) => {
      operations.push(`recording:${callId}`);
    },
    clearCampaignFile: async (campaignId) => {
      operations.push(`campaign:${campaignId}`);
    },
    deleteSubscriptions: async () => {
      operations.push("subscription-rows");
    },
  });

  // The Better Auth Stripe plugin's composed hook checks this same object and
  // returns without issuing another Stripe request once the field is null.
  if (organization.stripeCustomerId) {
    operations.push("better-auth-stripe-list");
  }

  assert.deepEqual(operations, [
    "discover-financial-history",
    "discover-pending-topups",
    "discover-phone-numbers",
    "discover-knowledge-sources",
    "discover-recordings",
    "discover-campaign-files",
    "discover-local-subscriptions",
    "stripe-list:cus_123",
    "discover-financial-history",
    "discover-pending-topups",
    "stripe-cancel:sub_active",
    "stripe-cancel:sub_orphan",
    "stripe-cancel:sub_checkout",
    "stripe-customer:cus_123",
    "phone:phone_1",
    "kb-assets:kb_1",
    "kb-row:kb_1",
    "recording:call_1",
    "campaign:campaign_1",
    "subscription-rows",
  ]);
  assert.equal(organization.stripeCustomerId, null);
  assert.deepEqual(result, {
    phoneNumbersReleased: 1,
    knowledgeSourcesDeleted: 1,
    recordingsDeleted: 1,
    campaignFilesDeleted: 1,
    subscriptionsDeleted: 1,
    stripeCustomerDetached: true,
  });
});

test("pending top-ups block deletion before Stripe or local cleanup", async () => {
  const operations: string[] = [];
  const organization = { id: "org_123", stripeCustomerId: "cus_123" };

  await assert.rejects(
    cleanupOrganizationDeletionHook(organization, {
      hostedBilling: true,
      hasFinancialHistory: async () => false,
      hasPendingTopUps: async () => true,
      listPhoneNumbers: async () => {
        operations.push("local-discovery");
        return [];
      },
      listStripeSubscriptions: async () => {
        operations.push("stripe-list");
        return [];
      },
    }),
    /pending wallet top-ups/,
  );

  assert.deepEqual(operations, []);
  assert.equal(organization.stripeCustomerId, "cus_123");
});

test("a top-up that starts during discovery is caught before customer deletion", async () => {
  const operations: string[] = [];
  let pendingCheck = 0;

  await assert.rejects(
    cleanupOrganizationDeletionHook(
      { id: "org_123", stripeCustomerId: "cus_123" },
      {
        hostedBilling: true,
        hasFinancialHistory: async () => false,
        hasPendingTopUps: async () => {
          pendingCheck += 1;
          return pendingCheck === 2;
        },
        ...noLocalResources,
        listStripeSubscriptions: async () => {
          operations.push("stripe-list");
          return [];
        },
        deleteCustomer: async () => {
          operations.push("stripe-customer");
        },
        deleteSubscriptions: async () => {
          operations.push("subscription-rows");
        },
      },
    ),
    /pending wallet top-ups/,
  );

  assert.equal(pendingCheck, 2);
  assert.deepEqual(operations, ["stripe-list"]);
});

test("a Stripe discovery failure leaves every provider and local resource untouched", async () => {
  const operations: string[] = [];
  const organization = { id: "org_123", stripeCustomerId: "cus_123" };

  await assert.rejects(
    cleanupOrganizationDeletionHook(organization, {
      hostedBilling: true,
      hasFinancialHistory: async () => false,
      hasPendingTopUps: async () => false,
      ...noLocalResources,
      listStripeSubscriptions: async () => {
        operations.push("stripe-list");
        throw new Error("Stripe unavailable");
      },
      cancelSubscription: async () => {
        operations.push("stripe-cancel");
      },
      deleteCustomer: async () => {
        operations.push("stripe-customer");
      },
      deleteSubscriptions: async () => {
        operations.push("subscription-rows");
      },
    }),
    /Stripe unavailable/,
  );

  assert.deepEqual(operations, ["stripe-list"]);
  assert.equal(organization.stripeCustomerId, "cus_123");
});

test("missing Stripe subscriptions and customers are idempotent cleanup successes", async () => {
  const missing = Object.assign(new Error("No such resource"), {
    code: "resource_missing",
  });
  const operations: string[] = [];
  const organization: { id: string; stripeCustomerId: string | null } = {
    id: "org_123",
    stripeCustomerId: "cus_missing",
  };

  const result = await cleanupOrganizationDeletionHook(organization, {
    hostedBilling: true,
    hasFinancialHistory: async () => false,
    hasPendingTopUps: async () => false,
    ...noLocalResources,
    listStripeSubscriptions: async () => [
      { id: "sub_missing", status: "active" },
    ],
    cancelSubscription: async () => {
      operations.push("stripe-cancel");
      throw missing;
    },
    deleteCustomer: async () => {
      operations.push("stripe-customer");
      throw missing;
    },
    deleteSubscriptions: async () => {
      operations.push("subscription-rows");
    },
  });

  assert.deepEqual(operations, [
    "stripe-cancel",
    "stripe-customer",
    "subscription-rows",
  ]);
  assert.equal(organization.stripeCustomerId, null);
  assert.equal(result.stripeCustomerDetached, true);
});

test("an already-missing Stripe customer still clears the in-memory hook reference", async () => {
  const missing = Object.assign(new Error("No such customer"), {
    code: "resource_missing",
  });
  const operations: string[] = [];
  const organization: { id: string; stripeCustomerId: string | null } = {
    id: "org_123",
    stripeCustomerId: "cus_missing",
  };

  await cleanupOrganizationDeletionHook(organization, {
    hostedBilling: true,
    hasFinancialHistory: async () => false,
    hasPendingTopUps: async () => false,
    ...noLocalResources,
    listStripeSubscriptions: async () => {
      throw missing;
    },
    deleteCustomer: async () => {
      operations.push("stripe-customer");
    },
    deleteSubscriptions: async () => {
      operations.push("subscription-rows");
    },
  });

  assert.deepEqual(operations, ["subscription-rows"]);
  assert.equal(organization.stripeCustomerId, null);
});

test("self-hosted organization cleanup never calls Stripe", async () => {
  let stripeCalls = 0;
  const organization = { id: "org_123", stripeCustomerId: "cus_123" };
  const result = await cleanupOrganizationDeletionHook(organization, {
    hostedBilling: false,
    hasFinancialHistory: async () => false,
    hasPendingTopUps: async () => false,
    ...noLocalResources,
    listStripeSubscriptions: async () => {
      stripeCalls += 1;
      return [];
    },
    cancelSubscription: async () => {
      stripeCalls += 1;
    },
    deleteCustomer: async () => {
      stripeCalls += 1;
    },
    deleteSubscriptions: async () => ({ count: 1 }),
  });

  assert.equal(stripeCalls, 0);
  assert.equal(organization.stripeCustomerId, "cus_123");
  assert.equal(result.stripeCustomerDetached, false);
});

test("organization cleanup stops local deletion when Stripe customer deletion fails", async () => {
  const operations: string[] = [];

  await assert.rejects(
    cleanupOrganizationBeforeDeletion(
      { organizationId: "org_123", stripeCustomerId: "cus_123" },
      {
        hostedBilling: true,
        hasFinancialHistory: async () => false,
        hasPendingTopUps: async () => false,
        listPhoneNumbers: async () => [{ phId: "phone_1" }],
        listKnowledgeSources: async () => [],
        listRecordings: async () => [],
        listCampaignFiles: async () => [],
        listSubscriptions: async () => [],
        listStripeSubscriptions: async () => [],
        deleteCustomer: async () => {
          operations.push("stripe-customer");
          throw new Error("Stripe unavailable");
        },
        releaseNumber: async () => {
          operations.push("phone");
        },
        deleteSubscriptions: async () => {
          operations.push("subscription-rows");
        },
      },
    ),
    /Stripe unavailable/,
  );

  assert.deepEqual(operations, ["stripe-customer"]);
});
