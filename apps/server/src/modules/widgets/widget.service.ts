import { createHash, randomBytes } from "node:crypto";
import { StatusCodes } from "http-status-codes";

import CustomApiError from "../../common/errors/customApiError.js";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { livekitRoomServiceClient } from "../../config/livekit.js";
import { serverBaseUrl } from "../../config/origins.js";
import { redisConnection } from "../../config/redis.js";
import {
  requestVoiceSession,
  providerModel,
  type AgentPreviewSession,
  type VoiceSessionPayload,
} from "../agent/agent.service.js";
import * as widgetRepository from "./widget.repository.js";
import type {
  CreateAgentWidgetInput,
  CreatePublicWidgetSessionInput,
  UpdateAgentWidgetInput,
  WidgetTheme,
} from "./widget.schema.js";
import {
  authorizeCallBilling,
  cancelCallBillingAdmission,
} from "../billing/call-metering.service.js";
import { PaymentRequiredError } from "../../common/errors/paymentRequired.js";

const WIDGET_ID_PREFIX = "wgt";
const WIDGET_SESSION_ID_PREFIX = "wgs";
const DEFAULT_WIDGET_SESSION_TTL_SECONDS = 900;
const MAX_WIDGET_SESSION_TTL_SECONDS = 3600;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX_SESSIONS = 10;
const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;

const DEFAULT_THEME: WidgetTheme = {
  primaryColor: "#002FA7",
  accentColor: "#0F172A",
  surfaceColor: "#FFFFFF",
  textColor: "#111827",
  mutedTextColor: "#667085",
  buttonTextColor: "#FFFFFF",
  borderColor: "#DADDE3",
  position: "bottom-right",
  launcherSize: "comfortable",
  panelWidth: 340,
  borderRadius: 16,
  defaultOpen: false,
  showAvatar: true,
  avatarImageUrl: null,
  avatarOrbColor1: "#002FA7",
  avatarOrbColor2: "#00F0FF",
  brandName: "QuickVoice",
  actionText: "Talk to us",
  welcomeText: "Talk with our voice agent.",
  startButtonText: "Start call",
  endButtonText: "End call",
  connectingText: "Connecting",
  listeningText: "Listening",
  speakingText: "Assistant speaking",
  endedText: "Call ended",
  whiteLabel: false,
};

type WidgetRecord = Awaited<
  ReturnType<typeof widgetRepository.findPublicWidget>
>;

export type AgentWidgetResponse = {
  widgetId: string;
  organizationId: string;
  agentId: string;
  name: string;
  enabled: boolean;
  allowedOrigins: string[];
  theme: WidgetTheme;
  consentRequired: boolean;
  consentText: string;
  createdAt: string;
  updatedAt: string;
  agent: {
    agentId: string;
    name: string;
    isConfigured: boolean;
  };
  embed: {
    scriptUrl: string;
    snippet: string;
  };
};

export type PublicWidgetConfig = {
  widgetId: string;
  name: string;
  agentName: string;
  theme: WidgetTheme;
  consentRequired: boolean;
  consentText: string;
  sessionTtlSeconds: number;
};

export type PublicWidgetSession = {
  sessionId: string;
  endToken: string;
  livekitUrl: string;
  roomName: string;
  participant: AgentPreviewSession["participant"];
  expiresAt: string;
};

export const listAgentWidgets = async (
  organizationId: string,
  agentId: string,
) => {
  const agent = await widgetRepository.findAgentForWidgetCreation(
    organizationId,
    agentId,
  );
  if (!agent) throw new NotFoundError("Agent not found");
  const widgets = await widgetRepository.listWidgetsForAgent(
    organizationId,
    agentId,
  );
  return widgets.map(toWidgetResponse);
};

export const createAgentWidget = async (
  organizationId: string,
  agentId: string,
  userId: string,
  input: CreateAgentWidgetInput,
) => {
  const agent = await widgetRepository.findAgentForWidgetCreation(
    organizationId,
    agentId,
  );
  if (!agent) throw new NotFoundError("Agent not found");
  if (input.enabled && !agent.isConfigured) {
    throw new BadRequestError("Configure this agent before enabling a widget");
  }

  const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins);
  if (input.enabled && allowedOrigins.length === 0) {
    throw new BadRequestError("Add at least one allowed origin before enabling");
  }

  const widget = await widgetRepository.createWidget(
    organizationId,
    agentId,
    userId,
    generatePublicId(WIDGET_ID_PREFIX),
    { ...input, allowedOrigins },
  );
  return toWidgetResponse(widget);
};

export const getAgentWidget = async (
  organizationId: string,
  widgetId: string,
) => {
  const widget = await widgetRepository.findWidgetForOrg(
    organizationId,
    widgetId,
  );
  if (!widget) throw new NotFoundError("Widget not found");
  return toWidgetResponse(widget);
};

export const updateAgentWidget = async (
  organizationId: string,
  widgetId: string,
  userId: string,
  input: UpdateAgentWidgetInput,
) => {
  const existing = await widgetRepository.findWidgetForOrg(
    organizationId,
    widgetId,
  );
  if (!existing) throw new NotFoundError("Widget not found");

  const allowedOrigins =
    input.allowedOrigins === undefined
      ? undefined
      : normalizeAllowedOrigins(input.allowedOrigins);
  const nextOrigins = allowedOrigins ?? jsonStringArray(existing.allowedOrigins);
  const nextEnabled = input.enabled ?? existing.enabled;
  if (nextEnabled && !existing.agent.isConfigured) {
    throw new BadRequestError("Configure this agent before enabling a widget");
  }
  if (nextEnabled && nextOrigins.length === 0) {
    throw new BadRequestError("Add at least one allowed origin before enabling");
  }

  const widget = await widgetRepository.updateWidget(
    organizationId,
    widgetId,
    userId,
    { ...input, ...(allowedOrigins ? { allowedOrigins } : {}) },
  );
  if (!widget) throw new NotFoundError("Widget not found");
  return toWidgetResponse(widget);
};

export const deleteAgentWidget = async (
  organizationId: string,
  widgetId: string,
) => {
  const result = await widgetRepository.deleteWidget(organizationId, widgetId);
  if (result.count === 0) throw new NotFoundError("Widget not found");
};

export const getPublicWidgetConfig = async (
  widgetId: string,
): Promise<PublicWidgetConfig> => {
  const widget = await requireRunnablePublicWidget(widgetId);
  return {
    widgetId: widget.widgetId,
    name: widget.name,
    agentName: widget.agent.name,
    theme: mergeTheme(widget.theme),
    consentRequired: widget.consentRequired,
    consentText: widget.consentText || defaultConsentText(),
    sessionTtlSeconds: widgetSessionTtlSeconds(),
  };
};

export const createPublicWidgetSession = async (
  widgetId: string,
  originHeader: string | undefined,
  input: CreatePublicWidgetSessionInput,
  ipAddress: string | undefined,
): Promise<PublicWidgetSession> => {
  const widget = await requireRunnablePublicWidget(widgetId);
  const origin = requireAllowedOrigin(widget, originHeader);

  await enforceWidgetRateLimit({
    widgetId,
    origin,
    ipAddress,
  });
  await enforceConcurrentSessionLimit(widgetId);

  const configuration = widget.agent.configuration;
  if (!configuration) {
    throw new NotFoundError("Widget not found");
  }

  const sessionId = generatePublicId(WIDGET_SESSION_ID_PREFIX);
  const roomName = `widget_${sessionId}`;
  const participantIdentity = `widget-user-${randomBytes(8).toString("hex")}`;
  const ttlSeconds = widgetSessionTtlSeconds();
  const dynamicVariables = normalizeDynamicVariables(input.dynamicVariables);
  const firstMessage = renderDynamicVariables(
    configuration.firstMessage,
    dynamicVariables,
  );
  const systemPrompt = renderDynamicVariables(
    configuration.systemPrompt,
    dynamicVariables,
  );

  const payload: VoiceSessionPayload = {
    room: { name: roomName },
    participant: {
      identity: participantIdentity,
      name: "Website visitor",
    },
    config: {
      language: configuration.agent_language,
      timezone: configuration.timezone,
      stt: providerModel(configuration.sttModel),
      llm: providerModel(configuration.llmModel),
      tts: {
        ...providerModel(configuration.ttsModel),
        voice: configuration.voiceId,
      },
    },
    metadata: {
      mode: "widget",
      source: "web_widget",
      retention: "configured",
      agent_id: widget.agentId,
      organization_id: widget.organizationId,
      widget_id: widget.widgetId,
      session_id: sessionId,
      visitor_id: input.visitorId,
      origin,
      call_id: roomName,
      direction: "inbound",
      provider: "WEB_WIDGET",
      from_number: "",
      to_number: "",
      first_message: firstMessage,
      system_prompt: systemPrompt,
      ...(Object.keys(dynamicVariables).length > 0
        ? { dynamic_variables: dynamicVariables }
        : {}),
    },
    ttl_seconds: ttlSeconds,
  };

  const admission = await authorizeCallBilling({
    organizationId: widget.organizationId,
    callId: roomName,
    roomName,
    sessionId,
    agentId: widget.agentId,
  });
  if (admission.action === "stop") {
    throw new PaymentRequiredError(
      "This voice agent is temporarily unavailable because its account needs credit",
      { reason: admission.reason },
    );
  }

  let voiceSession;
  try {
    voiceSession = await requestVoiceSession(
      payload,
      "Website widget session is unavailable",
    );
  } catch (error) {
    await cancelCallBillingAdmission({
      organizationId: widget.organizationId,
      callId: roomName,
      reason: "widget_session_creation_failed",
    }).catch(() => undefined);
    throw error;
  }
  const endToken = randomBytes(32).toString("base64url");

  await widgetRepository.createWidgetSession({
    sessionId,
    widgetId: widget.widgetId,
    organizationId: widget.organizationId,
    agentId: widget.agentId,
    roomName: voiceSession.roomName,
    callId: voiceSession.roomName,
    participantIdentity,
    dispatchId: voiceSession.agent.dispatchId,
    origin,
    endTokenHash: hashToken(endToken),
    expiresAt: new Date(voiceSession.expiresAt),
    metadata: {
      source: "web_widget",
      origin,
      visitorId: input.visitorId ?? null,
    },
  });

  return {
    sessionId,
    endToken,
    livekitUrl: voiceSession.livekitUrl,
    roomName: voiceSession.roomName,
    participant: voiceSession.participant,
    expiresAt: voiceSession.expiresAt,
  };
};

export const endPublicWidgetSession = async (
  widgetId: string,
  sessionId: string,
  endToken: string,
) => {
  const session = await widgetRepository.findSessionForEnd(widgetId, sessionId);
  if (!session || !session.endTokenHash) {
    throw new NotFoundError("Widget session not found");
  }
  if (session.endTokenHash !== hashToken(endToken)) {
    throw new NotFoundError("Widget session not found");
  }

  try {
    await livekitRoomServiceClient.deleteRoom(session.roomName);
  } catch (error) {
    if (!isLiveKitRoomNotFound(error)) throw error;
  }
  await widgetRepository.markSessionEnded(sessionId);
  return { status: "ended" as const, roomName: session.roomName };
};

export const publicWidgetOriginAllowed = async (
  widgetId: string,
  originHeader: string | undefined,
) => {
  const widget = await widgetRepository.findPublicWidget(widgetId);
  if (!widget || !widget.enabled) return false;
  const origin = normalizeRequestOrigin(originHeader);
  if (!origin) return false;
  return originAllowed(jsonStringArray(widget.allowedOrigins), origin);
};

export const widgetRoomBelongsToOrg =
  widgetRepository.widgetRoomBelongsToOrg;

function toWidgetResponse(widget: {
  widgetId: string;
  organizationId: string;
  agentId: string;
  name: string;
  enabled: boolean;
  allowedOrigins: unknown;
  theme: unknown;
  consentRequired: boolean;
  consentText: string | null;
  createdAt: Date;
  updatedAt: Date;
  agent: { agentId: string; name: string; isConfigured: boolean };
}): AgentWidgetResponse {
  const scriptUrl = widgetScriptUrl();
  return {
    widgetId: widget.widgetId,
    organizationId: widget.organizationId,
    agentId: widget.agentId,
    name: widget.name,
    enabled: widget.enabled,
    allowedOrigins: jsonStringArray(widget.allowedOrigins),
    theme: mergeTheme(widget.theme),
    consentRequired: widget.consentRequired,
    consentText: widget.consentText || defaultConsentText(),
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
    agent: widget.agent,
    embed: {
      scriptUrl,
      snippet: `<quickvoice-widget widget-id="${widget.widgetId}"></quickvoice-widget>\n<script async src="${scriptUrl}"></script>`,
    },
  };
}

async function requireRunnablePublicWidget(widgetId: string) {
  const widget = await widgetRepository.findPublicWidget(widgetId);
  if (
    !widget ||
    !widget.enabled ||
    !widget.agent.isActive ||
    !widget.agent.isConfigured
  ) {
    throw new NotFoundError("Widget not found");
  }
  return widget;
}

function requireAllowedOrigin(
  widget: NonNullable<WidgetRecord>,
  originHeader: string | undefined,
) {
  const origin = normalizeRequestOrigin(originHeader);
  if (!origin) {
    throw new CustomApiError("Origin is required", StatusCodes.FORBIDDEN);
  }
  if (!originAllowed(jsonStringArray(widget.allowedOrigins), origin)) {
    throw new CustomApiError("Origin is not allowed", StatusCodes.FORBIDDEN);
  }
  return origin;
}

function normalizeAllowedOrigins(origins: string[]) {
  return Array.from(new Set(origins.map(normalizeConfiguredOrigin)));
}

function normalizeConfiguredOrigin(value: string) {
  const normalized = normalizeOrigin(value);
  if (!normalized) {
    throw new BadRequestError(`Invalid origin: ${value}`);
  }
  return normalized;
}

function normalizeRequestOrigin(value: string | undefined) {
  if (!value) return null;
  const normalized = normalizeOrigin(value);
  if (!normalized) return null;
  if (
    isLocalhostOrigin(normalized) &&
    process.env.WIDGET_ALLOW_LOCALHOST_ORIGINS !== "true"
  ) {
    return null;
  }
  return normalized;
}

function normalizeOrigin(value: string) {
  try {
    if (value.includes("*")) return null;
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.protocol === "http:" && !isLocalhostHostname(url.hostname)) {
      return null;
    }
    if (url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function originAllowed(allowedOrigins: string[], origin: string) {
  return allowedOrigins.includes(origin);
}

function isLocalhostOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return isLocalhostHostname(hostname);
  } catch {
    return false;
  }
}

function isLocalhostHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function enforceWidgetRateLimit(input: {
  widgetId: string;
  origin: string;
  ipAddress: string | undefined;
}) {
  const windowSeconds = positiveIntEnv(
    "WIDGET_RATE_LIMIT_WINDOW_SECONDS",
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  );
  const maxSessions = positiveIntEnv(
    "WIDGET_RATE_LIMIT_MAX_SESSIONS",
    DEFAULT_RATE_LIMIT_MAX_SESSIONS,
  );
  const key = [
    "quickvoice",
    "widget",
    "rate",
    input.widgetId,
    hashToken(input.origin),
    hashToken(input.ipAddress || "unknown"),
  ].join(":");
  const count = await redisConnection.incr(key);
  if (count === 1) await redisConnection.expire(key, windowSeconds);
  if (count > maxSessions) {
    throw new CustomApiError(
      "Too many widget sessions. Try again shortly.",
      StatusCodes.TOO_MANY_REQUESTS,
    );
  }
}

async function enforceConcurrentSessionLimit(widgetId: string) {
  const maxConcurrent = positiveIntEnv(
    "WIDGET_MAX_CONCURRENT_SESSIONS_PER_WIDGET",
    DEFAULT_MAX_CONCURRENT_SESSIONS,
  );
  const active = await widgetRepository.countActiveWidgetSessions(widgetId);
  if (active >= maxConcurrent) {
    throw new CustomApiError(
      "This widget is at its concurrent call limit.",
      StatusCodes.TOO_MANY_REQUESTS,
    );
  }
}

function widgetSessionTtlSeconds() {
  return Math.min(
    positiveIntEnv("WIDGET_SESSION_TTL_SECONDS", DEFAULT_WIDGET_SESSION_TTL_SECONDS),
    MAX_WIDGET_SESSION_TTL_SECONDS,
  );
}

function positiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function widgetScriptUrl() {
  return `${serverBaseUrl}/widget/v1/quickvoice-widget.js`;
}

function defaultConsentText() {
  return "This voice call may be recorded and transcribed.";
}

function mergeTheme(value: unknown): WidgetTheme {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_THEME;
  }
  return { ...DEFAULT_THEME, ...(value as Partial<WidgetTheme>) };
}

function jsonStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeDynamicVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const variables: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) continue;
    if (typeof entry !== "string") continue;
    const variableValue = entry.trim();
    if (variableValue) variables[name] = variableValue.slice(0, 500);
  }
  return variables;
}

function renderDynamicVariables(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (match, key) => {
      const value = variables[key];
      return value?.trim() ? value : match;
    },
  );
}

function generatePublicId(prefix: string) {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isLiveKitRoomNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = String(record.code ?? "").toLowerCase();
  const status = record.status ?? record.statusCode;
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    code === "not_found" ||
    code === "5" ||
    status === 404 ||
    message.includes("not found") ||
    message.includes("does not exist")
  );
}
