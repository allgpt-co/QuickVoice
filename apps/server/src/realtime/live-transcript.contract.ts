export const LIVE_TRANSCRIPT_CHANNEL = "quickvoice:live:events";
export const LIVE_TRANSCRIPT_VERSION = 1 as const;

export const activeCallsKey = (organizationId: string) =>
  `quickvoice:live:active:${organizationId}`;

export const callMetadataKey = (organizationId: string, callId: string) =>
  `quickvoice:live:metadata:${organizationId}:${callId}`;

export const callStreamKey = (organizationId: string, callId: string) =>
  `quickvoice:live:stream:${organizationId}:${callId}`;

export const callDedupKey = (organizationId: string, callId: string) =>
  `quickvoice:live:dedup:${organizationId}:${callId}`;

export type CallDirection = "inbound" | "outbound";
export type TranscriptSpeaker = "user" | "agent";

type LiveEventBase = {
  version: typeof LIVE_TRANSCRIPT_VERSION;
  organizationId: string;
  callId: string;
  roomName: string;
  eventId: string;
  occurredAt: string;
};

type LifecycleFields = {
  agentId: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
};

export type CallStartedEvent = LiveEventBase &
  LifecycleFields & {
    type: "call.started";
    status: "active";
  };

export type TranscriptFinalEvent = LiveEventBase & {
  type: "transcript.final";
  messageId: string;
  speaker: TranscriptSpeaker;
  text: string;
  timestamp: string;
};

export type CallEndedEvent = LiveEventBase &
  LifecycleFields & {
    type: "call.ended";
    status: "ended";
    endedAt: string;
    reason: string;
  };

export type LiveTranscriptEvent =
  | CallStartedEvent
  | TranscriptFinalEvent
  | CallEndedEvent;

export type LiveCallStatus = "active" | "ended";

export type WatchCallRequest = { callId: string };
export type UnwatchCallRequest = { callId: string };

export type SocketCommandError = {
  code:
    | "BAD_REQUEST"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "UNAVAILABLE"
    | "INTERNAL_ERROR";
  message: string;
};

export type WatchCallAck =
  | {
      ok: true;
      callId: string;
      messages: TranscriptFinalEvent[];
      status: LiveCallStatus;
    }
  | { ok: false; error: SocketCommandError };

export type UnwatchCallAck =
  | { ok: true; callId: string }
  | { ok: false; error: SocketCommandError };

export interface ServerToClientEvents {
  "live-call:started": (event: CallStartedEvent) => void;
  "live-call:updated": (event: CallStartedEvent) => void;
  "live-call:ended": (event: CallEndedEvent) => void;
  "live-transcript:message": (event: TranscriptFinalEvent) => void;
}

export interface ClientToServerEvents {
  "live-call:watch": (
    payload: WatchCallRequest,
    acknowledge?: (result: WatchCallAck) => void,
  ) => void;
  "live-call:unwatch": (
    payload: UnwatchCallRequest,
    acknowledge?: (result: UnwatchCallAck) => void,
  ) => void;
}

export interface SocketData {
  userId: string;
  organizationId: string;
}

const BASE_KEYS = [
  "version",
  "type",
  "organizationId",
  "callId",
  "roomName",
  "eventId",
  "occurredAt",
] as const;
const LIFECYCLE_KEYS = [
  "agentId",
  "direction",
  "fromNumber",
  "toNumber",
  "startedAt",
  "status",
] as const;
const STARTED_KEYS = new Set<string>([...BASE_KEYS, ...LIFECYCLE_KEYS]);
const TRANSCRIPT_KEYS = new Set<string>([
  ...BASE_KEYS,
  "messageId",
  "speaker",
  "text",
  "timestamp",
]);
const ENDED_KEYS = new Set<string>([
  ...BASE_KEYS,
  ...LIFECYCLE_KEYS,
  "endedAt",
  "reason",
]);

/**
 * Parses the only three messages accepted on the trusted Redis channel.
 * Unknown fields are rejected for v1 so a producer/consumer drift cannot
 * silently expose unreviewed data to connected browsers.
 */
export function parseLiveTranscriptEvent(
  value: unknown,
  options: { eventId?: string } = {},
): LiveTranscriptEvent | null {
  const record = jsonRecord(value);
  if (!record) return null;

  const eventId = options.eventId ?? requiredString(record.eventId);
  if (!eventId || !isRedisStreamId(eventId)) return null;

  const type = record.type;
  if (
    record.version !== LIVE_TRANSCRIPT_VERSION ||
    (type !== "call.started" &&
      type !== "transcript.final" &&
      type !== "call.ended")
  ) {
    return null;
  }

  const allowedKeys =
    type === "call.started"
      ? STARTED_KEYS
      : type === "transcript.final"
        ? TRANSCRIPT_KEYS
        : ENDED_KEYS;
  if (!hasOnlyKeys(record, allowedKeys, options.eventId !== undefined)) {
    return null;
  }

  const base = parseBase(record, eventId);
  if (!base) return null;

  if (type === "transcript.final") {
    const messageId = requiredString(record.messageId);
    const speaker = record.speaker;
    const text = stringValue(record.text);
    const timestamp = isoDate(record.timestamp);
    if (
      !messageId ||
      (speaker !== "user" && speaker !== "agent") ||
      text === null ||
      !timestamp
    ) {
      return null;
    }
    return {
      ...base,
      type,
      messageId,
      speaker,
      text,
      timestamp,
    };
  }

  const lifecycle = parseLifecycle(record);
  if (!lifecycle) return null;

  if (type === "call.started") {
    if (record.status !== "active") return null;
    return { ...base, ...lifecycle, type, status: "active" };
  }

  const endedAt = isoDate(record.endedAt);
  const reason = stringValue(record.reason);
  if (record.status !== "ended" || !endedAt || reason === null) return null;
  return { ...base, ...lifecycle, type, status: "ended", endedAt, reason };
}

export function parseWatchCallRequest(value: unknown): WatchCallRequest | null {
  const record = objectRecord(value);
  if (!record || Object.keys(record).some((key) => key !== "callId")) {
    return null;
  }
  const callId = requiredString(record.callId);
  if (!callId || callId.length > 256) return null;
  return { callId };
}

function parseBase(
  record: Record<string, unknown>,
  eventId: string,
): LiveEventBase | null {
  const organizationId = requiredString(record.organizationId);
  const callId = requiredString(record.callId);
  const roomName = requiredString(record.roomName);
  const occurredAt = isoDate(record.occurredAt);
  if (!organizationId || !callId || !roomName || !occurredAt) return null;
  return {
    version: LIVE_TRANSCRIPT_VERSION,
    organizationId,
    callId,
    roomName,
    eventId,
    occurredAt,
  };
}

function parseLifecycle(
  record: Record<string, unknown>,
): LifecycleFields | null {
  const agentId = stringValue(record.agentId);
  const direction = record.direction;
  const fromNumber = stringValue(record.fromNumber);
  const toNumber = stringValue(record.toNumber);
  const startedAt = isoDate(record.startedAt);
  if (
    agentId === null ||
    (direction !== "inbound" && direction !== "outbound") ||
    fromNumber === null ||
    toNumber === null ||
    !startedAt
  ) {
    return null;
  }
  return { agentId, direction, fromNumber, toNumber, startedAt };
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return objectRecord(value);
  try {
    return objectRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(
  record: Record<string, unknown>,
  allowed: Set<string>,
  eventIdOverride: boolean,
) {
  return Object.keys(record).every(
    (key) => allowed.has(key) || (eventIdOverride && key === "eventId"),
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function isRedisStreamId(value: string) {
  return /^\d+-\d+$/.test(value);
}
