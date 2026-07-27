import prisma from "../../config/prisma.js";
import { deleteObject } from "../../config/s3.js";
import { stripeClient } from "../../config/stripe.js";
import { cleanupKnowledgeSourceAssets } from "../kb/kb-assets.service.js";
import * as kbRepository from "../kb/kb.repository.js";
import { deleteNumber } from "../numbers/phone.service.js";

type OrganizationCleanupInput = {
  organizationId: string;
  stripeCustomerId?: string | null;
};

type OrganizationCleanupDependencies = {
  cancelSubscription?: (subscriptionId: string) => Promise<unknown>;
  cleanupKnowledgeSource?: typeof cleanupKnowledgeSourceAssets;
  clearCampaignFile?: (campaignId: string, key: string) => Promise<void>;
  clearRecording?: (callId: string, key: string) => Promise<void>;
  deleteCustomer?: (customerId: string) => Promise<unknown>;
  deleteKnowledgeSource?: typeof kbRepository.deleteKnowledgeSource;
  deleteSubscriptions?: (organizationId: string) => Promise<unknown>;
  listCampaignFiles?: (
    organizationId: string
  ) => Promise<Array<{ campaignId: string; sourceFileKey: string }>>;
  listKnowledgeSources?: (
    organizationId: string
  ) => Promise<
    Array<{
      kbId: string;
      agentId: string | null;
      storagePath: string;
      sourceType: string;
    }>
  >;
  listPhoneNumbers?: (
    organizationId: string
  ) => Promise<Array<{ phId: string }>>;
  listRecordings?: (
    organizationId: string
  ) => Promise<Array<{ callId: string; audioRecordingPath: string }>>;
  listSubscriptions?: (
    organizationId: string
  ) => Promise<Array<{ status: string | null; stripeSubscriptionId: string | null }>>;
  releaseNumber?: typeof deleteNumber;
};

const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "incomplete",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
]);

export async function cleanupOrganizationBeforeDeletion(
  input: OrganizationCleanupInput,
  dependencies: OrganizationCleanupDependencies = {}
) {
  const organizationId = input.organizationId;
  const listPhoneNumbers =
    dependencies.listPhoneNumbers ?? defaultListPhoneNumbers;
  const releaseNumber = dependencies.releaseNumber ?? deleteNumber;
  const phoneNumbers = await listPhoneNumbers(organizationId);
  for (const phoneNumber of phoneNumbers) {
    await releaseNumber(organizationId, phoneNumber.phId);
  }

  const listKnowledgeSources =
    dependencies.listKnowledgeSources ?? defaultListKnowledgeSources;
  const cleanupKnowledgeSource =
    dependencies.cleanupKnowledgeSource ?? cleanupKnowledgeSourceAssets;
  const deleteKnowledgeSource =
    dependencies.deleteKnowledgeSource ?? kbRepository.deleteKnowledgeSource;
  const knowledgeSources = await listKnowledgeSources(organizationId);
  for (const source of knowledgeSources) {
    await cleanupKnowledgeSource(source);
    await deleteKnowledgeSource(source.kbId, organizationId);
  }

  const listRecordings =
    dependencies.listRecordings ?? defaultListRecordings;
  const clearRecording =
    dependencies.clearRecording ?? defaultClearRecording;
  const recordings = await listRecordings(organizationId);
  for (const recording of recordings) {
    await clearRecording(
      recording.callId,
      recording.audioRecordingPath
    );
  }

  const listCampaignFiles =
    dependencies.listCampaignFiles ?? defaultListCampaignFiles;
  const clearCampaignFile =
    dependencies.clearCampaignFile ?? defaultClearCampaignFile;
  const campaignFiles = await listCampaignFiles(organizationId);
  for (const campaign of campaignFiles) {
    await clearCampaignFile(campaign.campaignId, campaign.sourceFileKey);
  }

  const listSubscriptions =
    dependencies.listSubscriptions ?? defaultListSubscriptions;
  const subscriptions = await listSubscriptions(organizationId);
  if (input.stripeCustomerId) {
    const deleteCustomer =
      dependencies.deleteCustomer ??
      ((customerId: string) => stripeClient.customers.del(customerId));
    try {
      await deleteCustomer(input.stripeCustomerId);
    } catch (error) {
      if (!isStripeResourceMissing(error)) throw error;
    }
  } else {
    const cancelSubscription =
      dependencies.cancelSubscription ??
      ((subscriptionId: string) =>
        stripeClient.subscriptions.cancel(subscriptionId));
    for (const subscription of subscriptions) {
      if (
        subscription.stripeSubscriptionId &&
        CANCELLABLE_SUBSCRIPTION_STATUSES.has(
          subscription.status?.toLowerCase() ?? ""
        )
      ) {
        try {
          await cancelSubscription(subscription.stripeSubscriptionId);
        } catch (error) {
          if (!isStripeResourceMissing(error)) throw error;
        }
      }
    }
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
  };
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
