import "dotenv/config";
import express from "express";
import { isIP } from "node:net";
import cors from "cors";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createQuickVoiceMcpServer } from "./mcp-server.js";
import { authContext } from "./auth-context.js";
import { validateQuickVoiceApiKey } from "./api-client.js";

const app = express();
// Trust only explicitly configured immediate proxies; direct traffic cannot spoof XFF.
const proxies = process.env.MCP_TRUSTED_PROXY_CIDRS?.trim().split(",").map((ip) => ip.trim()).filter(Boolean) ?? [];
for (const entry of proxies) {
  const [address, prefix, extra] = entry.split("/");
  const family = isIP(address ?? "");
  if (!family || extra !== undefined || (prefix !== undefined && (
    !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)
  ))) throw new Error("MCP_TRUSTED_PROXY_CIDRS must contain explicit proxy IPs or non-global CIDRs");
}
app.set("trust proxy", proxies.length ? proxies : false);
// ponytail: process-local admission budget; enforce an aggregate ingress limit for multiple replicas.
const initializeAttempts = new Map<string, { count: number; resetAt: number }>();
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 8787);
const endpointPath = process.env.MCP_ENDPOINT_PATH ?? "/mcp";
const allowedOrigins = (process.env.MCP_CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

type McpTransport = StreamableHTTPServerTransport;
type McpSession = {
  transport: McpTransport;
  keyFingerprint: Buffer;
  createdAt: number;
  lastActivityAt: number;
};
type McpTransportLease = {
  transport: McpTransport;
  releaseInitialization?: () => void;
};
const transports = new Map<string, McpSession>();
const pendingByKey = new Map<string, number>();
let pendingInitializations = 0;
const maxSessions = positiveInteger(process.env.MCP_MAX_SESSIONS, 1_000);
const maxSessionsPerKey = positiveInteger(process.env.MCP_MAX_SESSIONS_PER_KEY, 10);
const maxPendingInitializations = positiveInteger(process.env.MCP_MAX_PENDING_INITIALIZATIONS, 20);
const sessionIdleTtlMs = positiveInteger(process.env.MCP_SESSION_IDLE_TTL_MS, 15 * 60_000);
const sessionAbsoluteTtlMs = positiveInteger(process.env.MCP_SESSION_ABSOLUTE_TTL_MS, 24 * 60 * 60_000);

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const fingerprint = (apiKey: string) =>
  createHash("sha256").update(apiKey).digest();

const fingerprintKey = (value: Buffer) => value.toString("base64url");

const sameFingerprint = (left: Buffer, right: Buffer) =>
  left.length === right.length && timingSafeEqual(left, right);

function sessionExpired(session: McpSession, now = Date.now()) {
  return (
    now - session.lastActivityAt >= sessionIdleTtlMs ||
    now - session.createdAt >= sessionAbsoluteTtlMs
  );
}

function removeSession(sessionId: string, session: McpSession) {
  if (transports.get(sessionId) !== session) return;
  transports.delete(sessionId);
  void session.transport.close().catch(() => undefined);
}

function cleanupExpiredSessions(now = Date.now()) {
  for (const [ip, entry] of initializeAttempts) {
    if (entry.resetAt <= now) initializeAttempts.delete(ip);
  }
  for (const [sessionId, session] of transports) {
    if (sessionExpired(session, now)) removeSession(sessionId, session);
  }
}

const cleanupTimer = setInterval(cleanupExpiredSessions, Math.min(sessionIdleTtlMs, 60_000));
cleanupTimer.unref();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization", "x-api-key", "Mcp-Session-Id"],
    exposedHeaders: ["Mcp-Session-Id", "Retry-After"],
  }),
);

function extractQuickVoiceApiKey(req: express.Request) {
  const direct = req.header("x-api-key");
  if (direct) return direct;
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return null;
}

function isInitializeRequest(body: unknown) {
  if (Array.isArray(body)) return body.some(isInitializeRequest);
  return Boolean(
    body &&
      typeof body === "object" &&
      "method" in body &&
      (body as { method?: unknown }).method === "initialize",
  );
}

async function transportForRequest(
  req: express.Request,
  res: express.Response,
  upstreamApiKey: string,
) {
  cleanupExpiredSessions();
  const keyFingerprint = fingerprint(upstreamApiKey);
  const sessionId = req.header("mcp-session-id");
  if (sessionId) {
    const existing = transports.get(sessionId);
    if (!existing) {
      res.status(400).json({ error: `Unknown MCP session: ${sessionId}` });
      return null;
    }
    if (!sameFingerprint(existing.keyFingerprint, keyFingerprint)) {
      res.status(401).json({ error: "MCP session does not belong to this API key" });
      return null;
    }
    existing.lastActivityAt = Date.now();
    return { transport: existing.transport };
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: "MCP session id is required after initialize" });
    return null;
  }

  const address = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const entry = initializeAttempts.get(address) ?? { count: 0, resetAt: now + 60_000 };
  if (entry.count >= 20 || (!initializeAttempts.has(address) && initializeAttempts.size >= 10_000)) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1_000))))
      .status(429).json({ error: "Too many MCP initialization attempts" });
    return null;
  }
  entry.count++;
  initializeAttempts.set(address, entry);

  const pendingKey = fingerprintKey(keyFingerprint);
  const activeForKey = [...transports.values()].filter((session) =>
    sameFingerprint(session.keyFingerprint, keyFingerprint),
  ).length;
  const pendingForKey = pendingByKey.get(pendingKey) ?? 0;
  if (
    transports.size + pendingInitializations >= maxSessions ||
    activeForKey + pendingForKey >= maxSessionsPerKey ||
    pendingInitializations >= maxPendingInitializations
  ) {
    res.status(429).json({ error: "MCP session capacity reached; close an existing session and retry" });
    return null;
  }

  pendingInitializations += 1;
  pendingByKey.set(pendingKey, pendingForKey + 1);
  let pending = true;
  const releaseInitialization = () => {
    if (!pending) return;
    pending = false;
    pendingInitializations -= 1;
    const remaining = (pendingByKey.get(pendingKey) ?? 1) - 1;
    if (remaining > 0) pendingByKey.set(pendingKey, remaining);
    else pendingByKey.delete(pendingKey);
  };
  try {
    if (!(await validateQuickVoiceApiKey(upstreamApiKey))) {
      releaseInitialization();
      res.status(401).json({ error: "Invalid QuickVoice API key" });
      return null;
    }

    let transport: McpTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        const now = Date.now();
        transports.set(newSessionId, {
          transport,
          keyFingerprint,
          createdAt: now,
          lastActivityAt: now,
        });
      },
    });

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;
      const session = closedSessionId ? transports.get(closedSessionId) : null;
      if (closedSessionId && session?.transport === transport) {
        transports.delete(closedSessionId);
      }
    };

    await createQuickVoiceMcpServer().connect(transport);
    return { transport, releaseInitialization } satisfies McpTransportLease;
  } catch (error) {
    releaseInitialization();
    throw error;
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "quickvoice-mcp-server", activeSessions: transports.size });
});

app.all(endpointPath, async (req, res) => {
  const upstreamApiKey = extractQuickVoiceApiKey(req);
  if (!upstreamApiKey) {
    res.status(401).json({ error: "Missing QuickVoice API key. Send x-api-key or Authorization: Bearer <api-key>." });
    return;
  }

  // This server has no unsolicited notifications. Decline the optional GET
  // stream instead of leaving it idle until a reverse proxy times out.
  // Streamable HTTP clients handle 405 here and keep using POST for RPCs.
  if (req.method === "GET") {
    res.set("Allow", "POST, DELETE").status(405).end();
    return;
  }

  try {
    const lease = await transportForRequest(req, res, upstreamApiKey);
    if (!lease) return;
    try {
      await authContext.run(
        { upstreamApiKey },
        () => lease.transport.handleRequest(req, res, req.body),
      );
    } finally {
      lease.releaseInitialization?.();
    }
  } catch {
    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP request failed",
      });
    }
  }
});

export const httpServer = app.listen(port, () => {
  console.log(`QuickVoice MCP server listening on http://0.0.0.0:${port}${endpointPath}`);
});
