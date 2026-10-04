import {
  CallStatus,
  OutboundCallMode,
  Prisma,
  TelephonyProvider,
} from "../../../prisma/generated/prisma/client.js";
import {
  LIVEKIT_AGENT_NAME,
  LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID,
  LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID,
  livekitAgentDispatchClient,
  livekitRoomServiceClient,
  livekitSipClient,
} from "../../config/livekit.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import type { ListOutboundCallsArgs, QuickOutboundCallArgs } from "./outbound-call.schema.js";
import * as outboundCallRepository from "./outbound-call.repository.js";
import {
  authorizeCallBilling,
  callAdmissionMessage,
  cancelCallBillingAdmission,
  hasActiveLegacySubscription,
} from "../billing/call-metering.service.js";
import { PaymentRequiredError } from "../../common/errors/paymentRequired.js";

type QuickOutboundCallRepository = {
  getDialableNumber: typeof outboundCallRepository.getDialableNumber;
  getOutboundCallForDispatch?: typeof outboundCallRepository.getOutboundCallForDispatch;
  claimQuickOutboundCall?: typeof outboundCallRepository.claimQuickOutboundCall;
  createQuickCall: typeof outboundCallRepository.createQuickCall;
  markInProgress: typeof outboundCallRepository.markInProgress;
  markFailed: typeof outboundCallRepository.markFailed;
  getMonthlyUsage?: typeof outboundCallRepository.getMonthlyUsage;
};

type OutboundCallWorkflowRepository = {
  listForOrg: typeof outboundCallRepository.listForOrg;
  getForOrg: typeof outboundCallRepository.getForOrg;
  markCancelled: typeof outboundCallRepository.markCancelled;
};

type SipClientLike = {
  createSipParticipant: (
    sipTrunkId: string,
    number: string,
    roomName: string,
    opts?: Record<string, unknown>
  ) => Promise<unknown>;
};

type AgentDispatchClientLike = {
  createDispatch: (
    roomName: string,
    agentName: string,
    options?: { metadata?: string }
  ) => Promise<unknown>;
  deleteDispatch?: (dispatchId: string, roomName: string) => Promise<void>;
};

type RoomServiceClientLike = {
  deleteRoom: (roomName: string) => Promise<unknown>;
  listRooms?: (names?: string[]) => Promise<Array<{ name?: string }>>;
  listParticipants?: (roomName: string) => Promise<Array<{ identity?: string }>>;
};

type OutboundTrunks = Record<TelephonyProvider, string>;

const DEFAULT_OUTBOUND_MAX_CALL_DURATION_SECONDS = 15 * 60;
const DEFAULT_OUTBOUND_RINGING_TIMEOUT_SECONDS = 45;

function positiveSecondsFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * LiveKit hangs the SIP leg up on its own at these limits, so a provider-billed
 * call is bounded even if the AI worker and the billing watchdog both fail.
 */
export function outboundCallLimits(ringingTimeoutSeconds?: number | null) {
  const maxCallDuration = positiveSecondsFromEnv(
    "OUTBOUND_MAX_CALL_DURATION_SECONDS",
    DEFAULT_OUTBOUND_MAX_CALL_DURATION_SECONDS,
  );
  const ringingTimeout =
    ringingTimeoutSeconds && ringingTimeoutSeconds > 0
      ? Math.floor(ringingTimeoutSeconds)
      : positiveSecondsFromEnv(
          "OUTBOUND_RINGING_TIMEOUT_SECONDS",
          DEFAULT_OUTBOUND_RINGING_TIMEOUT_SECONDS,
        );
  return { maxCallDuration, ringingTimeout };
}

type CreateQuickOutboundCallDeps = {
  repository?: QuickOutboundCallRepository;
  sipClient?: SipClientLike;
  dispatchClient?: AgentDispatchClientLike;
  roomClient?: RoomServiceClientLike;
  outboundTrunks?: OutboundTrunks;
  agentName?: string;
  hasActiveLegacySubscription?: typeof hasActiveLegacySubscription;
};

type OutboundCallRecord = NonNullable<
  Awaited<ReturnType<typeof outboundCallRepository.getForOrg>>
>;

type OutboundWorkflowDeps = {
  repository?: OutboundCallWorkflowRepository;
};

type RetryOutboundWorkflowDeps = OutboundWorkflowDeps & {
  dispatchQuickCall?: typeof createQuickOutboundCall;
};

const defaultOutboundTrunks: OutboundTrunks = {
  [TelephonyProvider.TWILIO]: LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID,
  [TelephonyProvider.TELNYX]: LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID,
};

export async function createQuickOutboundCall(
  args: QuickOutboundCallArgs,
  deps: CreateQuickOutboundCallDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const sipClient = deps.sipClient ?? livekitSipClient;
  const dispatchClient = deps.dispatchClient ?? livekitAgentDispatchClient;
  const roomClient = deps.roomClient ?? livekitRoomServiceClient;
  const outboundTrunks = deps.outboundTrunks ?? defaultOutboundTrunks;
  const agentName = deps.agentName ?? LIVEKIT_AGENT_NAME;

  await enforcePlanQuota(
    repository,
    args.organizationId,
    deps.hasActiveLegacySubscription,
  );

  const dialableNumber = await repository.getDialableNumber({
    organizationId: args.organizationId,
    agentId: args.agentId,
    fromNumber: args.fromNumber,
  });

  if (!dialableNumber) {
    throw new BadRequestError(
      "From number must belong to this organization and be linked to the selected agent"
    );
  }

  const provider = dialableNumber.provider;
  const sid = dialableNumber.sid;
  const trunkId = outboundTrunks[provider];
  const dynamicVariables = normalizeDynamicVariables(args.dynamicVariables);
  const dynamicVariableData =
    Object.keys(dynamicVariables).length > 0 ? { dynamicVariables } : {};

  if (!trunkId) {
    throw new BadRequestError(`LiveKit outbound trunk is not configured for ${provider}`);
  }

  const outbound = await repository.createQuickCall({
    organizationId: args.organizationId,
    userId: args.userId,
    agentId: args.agentId,
    phoneNumber: args.phoneNumber,
    fromNumber: args.fromNumber,
    firstMessage: args.firstMessage,
    systemPrompt: args.systemPrompt,
    status: CallStatus.SCHEDULED,
    mode: OutboundCallMode.quick,
    optionalData: {
      username: args.username ?? null,
      provider,
      sid,
      ...dynamicVariableData,
    },
  });

  try {
    const claim = await repository.claimQuickOutboundCall?.(outbound.outboundId);
    if (claim && !claim.claimed) {
      throw new BadRequestError(claim.reason);
    }

    const roomName = `outbound_${outbound.outboundId}`;
    const admission = await authorizeCallBilling({
      organizationId: args.organizationId,
      callId: outbound.outboundId,
      roomName,
      agentId: args.agentId,
      userId: args.userId,
      telephonyProvider: provider,
      direction: "outbound",
      fromNumber: args.fromNumber,
      toNumber: args.phoneNumber,
    });
    if (admission.action === "stop") {
      throw new PaymentRequiredError(
        callAdmissionMessage(admission, "Add prepaid credit before making this call"),
        {
          reason: admission.reason,
          requiredMicros: admission.reserveMicros?.toString() ?? null,
        },
      );
    }
    const metadata = buildOutboundMetadata(args, outbound.outboundId, provider);
    const metadataJson = JSON.stringify(metadata);
    let agentDispatch: unknown;
    try {
      agentDispatch = await dispatchClient.createDispatch(roomName, agentName, {
        metadata: metadataJson,
      });
      const livekitParticipant = await sipClient.createSipParticipant(
        trunkId,
        args.phoneNumber,
        roomName,
        {
          fromNumber: args.fromNumber,
          participantIdentity: `outbound-${outbound.outboundId}`,
          participantName: args.username,
          participantMetadata: metadataJson,
          waitUntilAnswered: false,
          ...outboundCallLimits(),
        }
      );

      const updated = await repository.markInProgress(
        outbound.outboundId,
        {
          username: args.username ?? null,
          provider,
          sid,
          ...dynamicVariableData,
          livekitParticipant: toJsonValue(livekitParticipant),
          agentDispatch: toJsonValue(agentDispatch),
        }
      );
      if (!updated) {
        await roomClient.deleteRoom(roomName).catch(() => undefined);
        throw new BadRequestError("Outbound call was cancelled before dialing completed");
      }

      return { outbound: updated, livekitParticipant, agentDispatch };
    } catch (error) {
      await cleanupAgentDispatch(dispatchClient, agentDispatch, roomName);
      throw error;
    }
  } catch (error) {
    await cancelCallBillingAdmission({
      organizationId: args.organizationId,
      callId: outbound.outboundId,
      reason: "outbound_dispatch_failed",
    }).catch(() => undefined);
    await repository.markFailed(
      outbound.outboundId,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function dispatchScheduledOutboundCall(
  outboundId: string,
  deps: CreateQuickOutboundCallDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const sipClient = deps.sipClient ?? livekitSipClient;
  const dispatchClient = deps.dispatchClient ?? livekitAgentDispatchClient;
  const roomClient = deps.roomClient ?? livekitRoomServiceClient;
  const outboundTrunks = deps.outboundTrunks ?? defaultOutboundTrunks;
  const agentName = deps.agentName ?? LIVEKIT_AGENT_NAME;

  if (!repository.getOutboundCallForDispatch) {
    throw new Error("Outbound dispatch repository method is not configured");
  }

  const outbound = await repository.getOutboundCallForDispatch(outboundId);
  if (!outbound) {
    return;
  }

  try {
    if (!outbound.agentId) {
      throw new BadRequestError("Outbound call is not linked to an agent");
    }

    await enforcePlanQuota(
      repository,
      outbound.organizationId,
      deps.hasActiveLegacySubscription,
    );

    const dialableNumber = await repository.getDialableNumber({
      organizationId: outbound.organizationId,
      agentId: outbound.agentId,
      fromNumber: outbound.fromNumber,
    });

    if (!dialableNumber) {
      throw new BadRequestError(
        "From number must belong to this organization and be linked to the selected agent"
      );
    }

    const provider = dialableNumber.provider;
    const sid = dialableNumber.sid;
    const trunkId = outboundTrunks[provider];
    if (!trunkId) {
      throw new BadRequestError(`LiveKit outbound trunk is not configured for ${provider}`);
    }

    const optionalData = asRecord(outbound.optionalData);
    const language = stringValue(optionalData.language);
    const voiceId = stringValue(optionalData.voiceId) ?? stringValue(optionalData.voice_id);
    const dynamicVariables = asRecord(optionalData.dynamicVariables ?? optionalData.dynamic_variables);
    const ringingTimeoutSeconds = numberValue(optionalData.ringingTimeoutSeconds);

    const roomName = `outbound_${outbound.outboundId}`;
    const admission = await authorizeCallBilling({
      organizationId: outbound.organizationId,
      callId: outbound.outboundId,
      roomName,
      agentId: outbound.agentId,
      userId: outbound.userId,
      telephonyProvider: provider,
      direction: "outbound",
      fromNumber: outbound.fromNumber,
      toNumber: outbound.phoneNumber,
    });
    if (admission.action === "stop") {
      throw new PaymentRequiredError(
        callAdmissionMessage(admission, "Insufficient prepaid credit for scheduled call"),
        { reason: admission.reason },
      );
    }
    const metadata = {
      agent_id: outbound.agentId,
      organization_id: outbound.organizationId,
      user_id: outbound.userId,
      call_id: outbound.outboundId,
      outbound_id: outbound.outboundId,
      campaign_id: outbound.campaignId ?? null,
      direction: "outbound",
      from_number: outbound.fromNumber,
      to_number: outbound.phoneNumber,
      provider,
      first_message: outbound.firstMessage ?? null,
      system_prompt: outbound.systemPrompt ?? null,
      language,
      voice_id: voiceId,
      dynamic_variables: Object.keys(dynamicVariables).length > 0 ? dynamicVariables : null,
    };
    const metadataJson = JSON.stringify(metadata);
    if (
      await outboundParticipantExists(
        roomClient,
        roomName,
        `outbound-${outbound.outboundId}`,
      )
    ) {
      const updated = await repository.markInProgress(outbound.outboundId, {
        ...optionalData,
        provider,
        sid,
        recoveredExistingRoom: true,
      });
      if (!updated) {
        await roomClient.deleteRoom(roomName).catch(() => undefined);
        throw new BadRequestError("Outbound call was cancelled before recovery completed");
      }
      return {
        outbound: updated,
        livekitParticipant: null,
        agentDispatch: null,
        recovered: true,
      };
    }

    let agentDispatch: unknown;
    try {
      agentDispatch = await dispatchClient.createDispatch(roomName, agentName, {
        metadata: metadataJson,
      });
      const livekitParticipant = await sipClient.createSipParticipant(
        trunkId,
        outbound.phoneNumber,
        roomName,
        {
          fromNumber: outbound.fromNumber,
          participantIdentity: `outbound-${outbound.outboundId}`,
          participantMetadata: metadataJson,
          waitUntilAnswered: false,
          ...outboundCallLimits(ringingTimeoutSeconds),
        }
      );

      const updated = await repository.markInProgress(outbound.outboundId, {
        ...optionalData,
        provider,
        sid,
        livekitParticipant: toJsonValue(livekitParticipant),
        agentDispatch: toJsonValue(agentDispatch),
      });
      if (!updated) {
        await roomClient.deleteRoom(roomName).catch(() => undefined);
        throw new BadRequestError("Outbound call was cancelled before dialing completed");
      }

      return { outbound: updated, livekitParticipant, agentDispatch };
    } catch (error) {
      await cleanupAgentDispatch(dispatchClient, agentDispatch, roomName);
      throw error;
    }
  } catch (error) {
    await cancelCallBillingAdmission({
      organizationId: outbound.organizationId,
      callId: outbound.outboundId,
      reason: "scheduled_outbound_dispatch_failed",
    }).catch(() => undefined);
    // Cancellation (or another terminal transition) is a successful no-op for
    // the queue, not a provider failure that should consume retry attempts.
    if (!(await repository.getOutboundCallForDispatch(outboundId))) return;
    await repository.markFailed(
      outbound.outboundId,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

async function outboundParticipantExists(
  roomClient: RoomServiceClientLike,
  roomName: string,
  participantIdentity: string,
) {
  if (!roomClient.listRooms) return false;
  const rooms = await roomClient.listRooms([roomName]);
  if (!rooms.some((room) => room.name === roomName)) return false;
  if (!roomClient.listParticipants) return true;
  const participants = await roomClient.listParticipants(roomName);
  return participants.some(
    (participant) => participant.identity === participantIdentity,
  );
}

export async function enforcePlanQuota(
  repository: Pick<QuickOutboundCallRepository, "getMonthlyUsage">,
  organizationId: string,
  legacySubscriptionCheck = hasActiveLegacySubscription,
) {
  if (!(await legacySubscriptionCheck(organizationId))) return;
  const usage = await repository.getMonthlyUsage?.(organizationId);
  if (!usage?.includedMinutes) return;

  if (usage.usedSeconds >= usage.includedMinutes * 60) {
    throw new BadRequestError(
      "Plan minutes exhausted for the current billing period"
    );
  }
}

async function cleanupAgentDispatch(
  dispatchClient: AgentDispatchClientLike,
  agentDispatch: unknown,
  roomName: string
) {
  const dispatchId = getDispatchId(agentDispatch);
  if (!dispatchId || !dispatchClient.deleteDispatch) return;

  try {
    await dispatchClient.deleteDispatch(dispatchId, roomName);
  } catch (cleanupError) {
    console.warn("[outbound] failed to clean up LiveKit agent dispatch", {
      roomName,
      dispatchId,
      error:
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }
}

function getDispatchId(agentDispatch: unknown) {
  if (!agentDispatch || typeof agentDispatch !== "object") return null;
  const dispatch = agentDispatch as {
    id?: unknown;
    dispatchId?: unknown;
    agentDispatchId?: unknown;
  };
  const id = dispatch.id ?? dispatch.dispatchId ?? dispatch.agentDispatchId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function buildOutboundMetadata(
  args: QuickOutboundCallArgs,
  outboundId: string,
  provider: TelephonyProvider,
) {
  const dynamicVariables = normalizeDynamicVariables(args.dynamicVariables);

  return {
    agent_id: args.agentId,
    organization_id: args.organizationId,
    user_id: args.userId,
    call_id: outboundId,
    outbound_id: outboundId,
    direction: "outbound",
    from_number: args.fromNumber,
    to_number: args.phoneNumber,
    provider,
    first_message: args.firstMessage ?? null,
    system_prompt: args.systemPrompt ?? null,
    username: args.username ?? null,
    dynamic_variables: Object.keys(dynamicVariables).length > 0 ? dynamicVariables : null,
  };
}

function normalizeDynamicVariables(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const dynamicVariables: Record<string, string> = {};

  for (const [key, entry] of Object.entries(record)) {
    const name = key.trim();
    if (!name || typeof entry !== "string") continue;

    const variableValue = entry.trim();
    if (variableValue) dynamicVariables[name] = variableValue;
  }

  return dynamicVariables;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return String(value);
  }
}

export async function listOutboundCalls(
  args: ListOutboundCallsArgs,
  deps: OutboundWorkflowDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const result = await repository.listForOrg(args);

  return {
    items: result.items.map(formatOutboundCall),
    count: result.count,
    filters: compact({
      agentId: args.agentId,
      status: args.status,
      mode: args.mode,
    }),
    nextCursor:
      result.items.length === args.limit
        ? result.items[result.items.length - 1]?.outboundId ?? null
        : null,
  };
}

export async function getOutboundCall(
  args: { organizationId: string; outboundId: string },
  deps: OutboundWorkflowDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const outbound = await repository.getForOrg(args.outboundId, args.organizationId);
  if (!outbound) {
    throw new NotFoundError("Outbound call not found");
  }

  return formatOutboundCall(outbound);
}

export async function cancelOutboundCall(
  args: {
    organizationId: string;
    userId: string;
    outboundId: string;
    reason?: string;
  },
  deps: OutboundWorkflowDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const outbound = await repository.getForOrg(args.outboundId, args.organizationId);
  if (!outbound) {
    throw new NotFoundError("Outbound call not found");
  }

  if (outbound.status !== CallStatus.SCHEDULED) {
    throw new BadRequestError("Only scheduled outbound calls can be cancelled");
  }

  const updated = await repository.markCancelled({
    organizationId: args.organizationId,
    userId: args.userId,
    outboundId: args.outboundId,
    reason: args.reason ?? "Cancelled by user",
  });

  return formatOutboundCall(updated);
}

export async function retryOutboundCall(
  args: {
    organizationId: string;
    userId: string;
    outboundId: string;
  },
  deps: RetryOutboundWorkflowDeps = {}
) {
  const repository = deps.repository ?? outboundCallRepository;
  const dispatchQuickCall = deps.dispatchQuickCall ?? createQuickOutboundCall;
  const outbound = await repository.getForOrg(args.outboundId, args.organizationId);
  if (!outbound) {
    throw new NotFoundError("Outbound call not found");
  }

  if (
    outbound.status !== CallStatus.FAILED &&
    outbound.status !== CallStatus.NOT_ANSWERED
  ) {
    throw new BadRequestError("Only failed or unanswered outbound calls can be retried");
  }

  if (!outbound.agentId) {
    throw new BadRequestError("Outbound call must have an agent to retry");
  }

  const optionalData = jsonObject(outbound.optionalData);
  const retry = await dispatchQuickCall({
    organizationId: args.organizationId,
    userId: args.userId,
    agentId: outbound.agentId,
    phoneNumber: outbound.phoneNumber,
    fromNumber: outbound.fromNumber,
    firstMessage: outbound.firstMessage ?? undefined,
    systemPrompt: outbound.systemPrompt ?? undefined,
    username: getOptionalString(optionalData.username) ?? undefined,
    dynamicVariables: normalizeDynamicVariables(
      optionalData.dynamicVariables ?? optionalData.dynamic_variables,
    ),
  });

  return {
    sourceOutboundId: outbound.outboundId,
    retry,
  };
}

function formatOutboundCall(outbound: OutboundCallRecord) {
  const optionalData = jsonObject(outbound.optionalData);

  return {
    outboundId: outbound.outboundId,
    organizationId: outbound.organizationId,
    agentId: outbound.agentId,
    userId: outbound.userId,
    campaignId: outbound.campaignId,
    callLogId: outbound.callLogId,
    phoneNumber: outbound.phoneNumber,
    fromNumber: outbound.fromNumber,
    firstMessage: outbound.firstMessage,
    systemPrompt: outbound.systemPrompt,
    mode: outbound.mode,
    status: outbound.status,
    failureReason: getOptionalString(optionalData.failureReason),
    cancellationReason: getOptionalString(optionalData.cancellationReason),
    scheduledAt: toIsoString(outbound.scheduledAt),
    createdAt: toIsoString(outbound.createdAt),
    updatedAt: toIsoString(outbound.updatedAt),
    callLog: outbound.callLog
      ? {
          ...outbound.callLog,
          startTime: toIsoString(outbound.callLog.startTime),
          endTime: toIsoString(outbound.callLog.endTime),
        }
      : null,
  };
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}
