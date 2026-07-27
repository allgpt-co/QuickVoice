import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanupOrganizationBeforeDeletion } from "../../src/modules/organization/organization-cleanup.service.js";

test("organization cleanup releases provider resources before database deletion", async () => {
  const operations: string[] = [];

  const result = await cleanupOrganizationBeforeDeletion(
    {
      organizationId: "org_123",
      stripeCustomerId: "cus_123",
    },
    {
      listPhoneNumbers: async () => [{ phId: "phone_1" }],
      releaseNumber: async (_organizationId, phId) => {
        operations.push(`phone:${phId}`);
      },
      listKnowledgeSources: async () => [
        {
          kbId: "kb_1",
          agentId: "agent_1",
          storagePath: "kb/org_123/file.pdf",
          sourceType: "PDF",
        },
      ],
      cleanupKnowledgeSource: async ({ kbId }) => {
        operations.push(`kb-assets:${kbId}`);
      },
      deleteKnowledgeSource: async (kbId) => {
        operations.push(`kb-row:${kbId}`);
        return {} as never;
      },
      listRecordings: async () => [
        { callId: "call_1", audioRecordingPath: "recordings/call.ogg" },
      ],
      clearRecording: async (callId) => {
        operations.push(`recording:${callId}`);
      },
      listCampaignFiles: async () => [
        { campaignId: "campaign_1", sourceFileKey: "batches/list.csv" },
      ],
      clearCampaignFile: async (campaignId) => {
        operations.push(`campaign:${campaignId}`);
      },
      listSubscriptions: async () => [
        { status: "active", stripeSubscriptionId: "sub_123" },
      ],
      deleteCustomer: async (customerId) => {
        operations.push(`customer:${customerId}`);
      },
      deleteSubscriptions: async () => {
        operations.push("subscription-rows");
      },
    }
  );

  assert.deepEqual(operations, [
    "phone:phone_1",
    "kb-assets:kb_1",
    "kb-row:kb_1",
    "recording:call_1",
    "campaign:campaign_1",
    "customer:cus_123",
    "subscription-rows",
  ]);
  assert.deepEqual(result, {
    phoneNumbersReleased: 1,
    knowledgeSourcesDeleted: 1,
    recordingsDeleted: 1,
    campaignFilesDeleted: 1,
    subscriptionsDeleted: 1,
  });
});

test("organization cleanup stops when an external release fails", async () => {
  let subscriptionsDeleted = false;

  await assert.rejects(
    cleanupOrganizationBeforeDeletion(
      { organizationId: "org_123" },
      {
        listPhoneNumbers: async () => [{ phId: "phone_1" }],
        releaseNumber: async () => {
          throw new Error("telephony unavailable");
        },
        listKnowledgeSources: async () => [],
        listRecordings: async () => [],
        listCampaignFiles: async () => [],
        listSubscriptions: async () => [],
        deleteSubscriptions: async () => {
          subscriptionsDeleted = true;
        },
      }
    ),
    /telephony unavailable/
  );

  assert.equal(subscriptionsDeleted, false);
});
