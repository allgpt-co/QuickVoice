import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createQuickVoiceMcpServer } from "./mcp-server.js";
import { authContext } from "./auth-context.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 8787);
const endpointPath = process.env.MCP_ENDPOINT_PATH ?? "/mcp";
const allowedOrigins = (process.env.MCP_CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

type McpTransport = StreamableHTTPServerTransport;
const transports = new Map<string, McpTransport>();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization", "x-api-key", "Mcp-Session-Id"],
    exposedHeaders: ["Mcp-Session-Id"],
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

async function transportForRequest(req: express.Request, res: express.Response) {
  const sessionId = req.header("mcp-session-id");
  if (sessionId) {
    const existing = transports.get(sessionId);
    if (!existing) {
      res.status(400).json({ error: `Unknown MCP session: ${sessionId}` });
      return null;
    }
    return existing;
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: "MCP session id is required after initialize" });
    return null;
  }

  let transport: McpTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
    },
  });

  transport.onclose = () => {
    const closedSessionId = transport.sessionId;
    if (closedSessionId) transports.delete(closedSessionId);
  };

  await createQuickVoiceMcpServer().connect(transport);
  return transport;
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
    const transport = await transportForRequest(req, res);
    if (!transport) return;
    await authContext.run({ upstreamApiKey }, () => transport.handleRequest(req, res, req.body));
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "MCP request failed",
      });
    }
  }
});

export const httpServer = app.listen(port, () => {
  console.log(`QuickVoice MCP server listening on http://0.0.0.0:${port}${endpointPath}`);
});
