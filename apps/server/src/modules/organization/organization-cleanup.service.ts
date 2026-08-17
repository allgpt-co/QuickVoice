import prisma from "../../config/prisma.js";
import { deleteObject } from "../../config/s3.js";
import { stripeClient } from "../../config/stripe.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import { cleanupKnowledgeSourceAssets } from "../kb/kb-assets.service.js";
import * as kbRepository from "../kb/kb.repository.js";
import { deleteNumber } from "../numbers/phone.service.js";

type OrganizationCleanupInput = {
  organizationId: string;
  stripeCustomerId?: string | null;
};

type OrganizationCleanupDependencies = {
  hostedBilling?: boolean;
  hasFinancialHistory?: (organizationId: string) => Promise<boolean>;
  hasPendingTopUps?: (organizationId: string) => Promise<boolean>;
  cancelSubscription?: (subscriptionId: string) => Promise<unknown>;
  cleanupKnowledgeSource?: typeof cleanupKnowledgeSourceAssets;
  clearCampaignFile?: (campaignId: string, key: string) => Promise<void>;
  clearRecording?: (callId: string, key: string) => Promise<void>;
  deleteKnowledgeSource?: typeof kbRepository.deleteKnowledgeSource;
  deleteCustomer?: (customerId: string) => Promise<unknown>;
  deleteSubscriptions?: (organizationId: string) => Promise<unknown>;
  listCampaignFiles?: (
    organizationId: string,
  ) => Promise<Array<{ campaignId: string; sourceFileKey: string }>>;
  listKnowledgeSources?: (organizationId: string) => Promise<
    Array<{
      kbId: string;
      agentId: string | null;
      storagePath: string;
      sourceType: string;
    }>
  >;
  listPhoneNumbers?: (
    organizationId: string,
  ) => Promise<Array<{ phId: string }>>;
  listRecordings?: (
    organizationId: string,
  ) => Promise<Array<{ callId: string; audioRecordingPath: string }>>;
  listSubscriptions?: (
    organizationId: string,
  ) => Promise<
    Array<{ status: string | null; stripeSubscriptionId: string | null }>
  >;
  listStripeSubscriptions?: (
    customerId: string,
  ) => Promise<Array<{ id: string; status: string }>>;
  releaseNumber?: typeof deleteNumber;
};

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

type DeletionHookOrganization = {
  id: string;
  stripeCustomerId?: unknown;
};

/**
 * Runs organization cleanup and clears the in-memory Stripe customer field
 * used by Better Auth's subsequently-composed Stripe deletion hook. The
 * database intentionally retains the stale customer ID until Better Auth
 * deletes the organization row. That ID fences concurrent billing requests
 * from creating a replacement customer while deletion is in progress.
 */
export async function cleanupOrganizationDeletionHook(
  organization: DeletionHookOrganization,
  dependencies: OrganizationCleanupDependencies = {},
) {
  const stripeCustomerId =
    typeof organization.stripeCustomerId === "string"
      ? organization.stripeCustomerId
      : null;
  const result = await cleanupOrganizationBeforeDeletion(
    {
      organizationId: organization.id,
      stripeCustomerId,
    },
    dependencies,
  );
  if (result.stripeCustomerDetached) {
    organization.stripeCustomerId = null;
  }
  return result;
}

export async function cleanupOrganizationBeforeDeletion(
  input: OrganizationCleanupInput,
  dependencies: OrganizationCleanupDependencies = {},
) {
  const organizationId = input.organizationId;
  const hasFinancialHistory =
    dependencies.hasFinancialHistory ?? defaultHasFinancialHistory;
  const hasPendingTopUps =
    dependencies.hasPendingTopUps ?? defaultHasPendingTopUps;
  await assertDeletionBillingState(
    organizationId,
    hasFinancialHistory,
    hasPendingTopUps,
  );

  // Complete every fallible discovery read before changing any provider or
  // local resource. Provider cleanup below is intentionally idempotent so a
  // failed deletion request can safely resume from the beginning.
  const listPhoneNumbers =
    dependencies.listPhoneNumbers ?? defaultListPhoneNumbers;
  const phoneNumbers = await listPhoneNumbers(organizationId);

  const listKnowledgeSources =
    dependencies.listKnowledgeSources ?? defaultListKnowledgeSources;
  const knowledgeSources = await listKnowledgeSources(organizationId);

  const listRecordings = dependencies.listRecordings ?? defaultListRecordings;
  const recordings = await listRecordings(organizationId);

  const listCampaignFiles =
    dependencies.listCampaignFiles ?? defaultListCampaignFiles;
  const campaignFiles = await listCampaignFiles(organizationId);

  const listSubscriptions =
    dependencies.listSubscriptions ?? defaultListSubscriptions;
  const subscriptions = await listSubscriptions(organizationId);

  const hostedBilling = dependencies.hostedBilling ?? isHostedBilling;
  let stripeSubscriptions: Array<{ id: string; status: string }> = [];
  let stripeCustomerMissing = false;
  if (hostedBilling && input.stripeCustomerId) {
    const listStripeSubscriptions =
      dependencies.listStripeSubscriptions ?? defaultListStripeSubscriptions;
    try {
      stripeSubscriptions = await listStripeSubscriptions(
        input.stripeCustomerId,
      );
    } catch (error) {
      if (!isStripeResourceMissing(error)) throw error;
      stripeCustomerMissing = true;
    }
  }

  // Close most of the discovery-window race with checkout/webhook activity.
  // Once the customer is deleted below, retaining its ID in the organization
  // row prevents billing requests from creating a replacement customer.
  await assertDeletionBillingState(
    organizationId,
    hasFinancialHistory,
    hasPendingTopUps,
  );

  let stripeCustomerDetached = false;
  if (hostedBilling && input.stripeCustomerId) {
    const cancelSubscription =
      dependencies.cancelSubscription ??
      ((subscriptionId: string) =>
        stripeClient.subscriptions.cancel(subscriptionId));
    for (const subscription of stripeSubscriptions) {
      if (
        !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status.toLowerCase())
      ) {
        try {
          await cancelSubscription(subscription.id);
        } catch (error) {
          if (!isStripeResourceMissing(error)) throw error;
        }
      }
    }

    if (!stripeCustomerMissing) {
      const deleteCustomer =
        dependencies.deleteCustomer ??
        ((customerId: string) => stripeClient.customers.del(customerId));
      try {
        await deleteCustomer(input.stripeCustomerId);
      } catch (error) {
        if (!isStripeResourceMissing(error)) throw error;
      }
    }

    stripeCustomerDetached = true;
  }

  const releaseNumber = dependencies.releaseNumber ?? deleteNumber;
  for (const phoneNumber of phoneNumbers) {
    await releaseNumber(organizationId, phoneNumber.phId);
  }

  const cleanupKnowledgeSource =
    dependencies.cleanupKnowledgeSource ?? cleanupKnowledgeSourceAssets;
  const deleteKnowledgeSource =
    dependencies.deleteKnowledgeSource ?? kbRepository.deleteKnowledgeSource;
  for (const source of knowledgeSources) {
    await cleanupKnowledgeSource(source);
    await deleteKnowledgeSource(source.kbId, organizationId);
  }

  const clearRecording = dependencies.clearRecording ?? defaultClearRecording;
  for (const recording of recordings) {
    await clearRecording(recording.callId, recording.audioRecordingPath);
  }

  const clearCampaignFile =
    dependencies.clearCampaignFile ?? defaultClearCampaignFile;
  for (const campaign of campaignFiles) {
    await clearCampaignFile(campaign.campaignId, campaign.sourceFileKey);
  }

  const deleteSubscriptions =
    dependencies.deleteSubscriptions ?? defaultDeleteSubscriptions;
  await deleteSubscriptions(organizationId);

  return {
    phoneNumbersReleased: phoneNumbers.length,
    knowledgeSourcesDeleted: knowledgeSources.length,
    recordingsDeleted: recordings.length,
    campaignFilesDeleted: campaignFiles.length,
    subscriptionsDeleted: subscriptions.length,
    stripeCustomerDetached,
  };
}

async function assertDeletionBillingState(
  organizationId: string,
  hasFinancialHistory: (organizationId: string) => Promise<boolean>,
  hasPendingTopUps: (organizationId: string) => Promise<boolean>,
) {
  if (await hasFinancialHistory(organizationId)) {
    throw new Error(
      "Organizations with wallet transactions cannot be deleted because financial records must be retained. Contact support to close and anonymize the account.",
    );
  }
  if (await hasPendingTopUps(organizationId)) {
    throw new Error(
      "Organizations with pending wallet top-ups cannot be deleted. Wait for payment processing to finish or contact support.",
    );
  }
}

async function defaultHasFinancialHistory(organizationId: string) {
  const transaction = await prisma.billingTransaction.findFirst({
    where: { organizationId },
    select: { billingTransactionId: true },
  });
  return transaction !== null;
}

async function defaultHasPendingTopUps(organizationId: string) {
  const topUp = await prisma.topUp.findFirst({
    where: { organizationId, status: "PENDING" },
    select: { topUpId: true },
  });
  return topUp !== null;
}

async function defaultListPhoneNumbers(organizationId: string) {
  return prisma.phoneNumber.findMany({
    where: { organizationId },
    select: { phId: true },
  });
}

async function defaultListKnowledgeSources(organizationId: string) {
  return prisma.knowledgeSource.findMany({
    where: { organizationId },
    select: {
      kbId: true,
      agentId: true,
      storagePath: true,
      sourceType: true,
    },
  });
}

async function defaultListRecordings(organizationId: string) {
  return prisma.callLog.findMany({
    where: {
      organizationId,
      audioRecordingPath: { not: null },
    },
    select: {
      callId: true,
      audioRecordingPath: true,
    },
  }) as Promise<Array<{ callId: string; audioRecordingPath: string }>>;
}

async function defaultClearRecording(callId: string, key: string) {
  if (!isHttpUrl(key)) {
    await deleteObject(key);
  }
  await prisma.callLog.updateMany({
    where: { callId, audioRecordingPath: key },
    data: { audioRecordingPath: null },
  });
}

async function defaultListCampaignFiles(organizationId: string) {
  return prisma.campaign.findMany({
    where: {
      organizationId,
      sourceFileKey: { not: null },
    },
    select: {
      campaignId: true,
      sourceFileKey: true,
    },
  }) as Promise<Array<{ campaignId: string; sourceFileKey: string }>>;
}

async function defaultClearCampaignFile(campaignId: string, key: string) {
  await deleteObject(key);
  await prisma.campaign.updateMany({
    where: { campaignId, sourceFileKey: key },
    data: { sourceFileKey: null },
  });
}

async function defaultListSubscriptions(organizationId: string) {
  return prisma.subscription.findMany({
    where: { referenceId: organizationId },
    select: {
      status: true,
      stripeSubscriptionId: true,
    },
  });
}

async function defaultListStripeSubscriptions(customerId: string) {
  const subscriptions: Array<{ id: string; status: string }> = [];
  for await (const subscription of stripeClient.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  })) {
    subscriptions.push({
      id: subscription.id,
      status: subscription.status,
    });
  }
  return subscriptions;
}

async function defaultDeleteSubscriptions(organizationId: string) {
  return prisma.subscription.deleteMany({
    where: { referenceId: organizationId },
  });
}

function isStripeResourceMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "resource_missing"
  );
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
