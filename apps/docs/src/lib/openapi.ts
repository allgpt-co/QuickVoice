import { apiBaseUrl, apiGroups, type ApiEndpoint, type ApiMethod } from "@/data/api-reference";

type OpenApiParameter = {
  name: string;
  in: "path" | "query";
  required: boolean;
  description?: string;
  schema: { type: string };
};

type OpenApiOperation = {
  tags: string[];
  summary: string;
  description: string;
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: {
          type: "object";
          additionalProperties: true;
          properties: Record<string, { type: string; description: string }>;
        };
      };
    };
  };
  security?: Array<Record<string, string[]>>;
  responses: Record<string, { description: string }>;
  "x-quickvoice-source": string;
  "x-quickvoice-permission"?: string;
  "x-quickvoice-ai-context": string;
  "x-quickvoice-use-case": string;
  "x-quickvoice-side-effects": string;
};

type OpenApiPathItem = Partial<Record<Lowercase<ApiMethod>, OpenApiOperation>>;

export type QuickVoiceOpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey";
        in: "cookie";
        name: "better-auth.session_token";
        description: string;
      };
      apiKey: {
        type: "apiKey";
        in: "header";
        name: "x-api-key";
        description: string;
      };
    };
  };
};

export function buildQuickVoiceOpenApi(): QuickVoiceOpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "QuickVoice REST API",
      version: "2026-07",
      description: "Interactive OpenAPI reference for QuickVoice REST operations. In Ask AI flows, answer questions using the selected operation description first instead of giving a broad overview of the full API catalog.",
    },
    servers: [
      {
        url: apiBaseUrl,
        description: "QuickVoice production API",
      },
    ],
    tags: apiGroups.map((group) => ({ name: group.title, description: group.description })),
    paths: buildPaths(),
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description:
            "Better Auth session cookie from the console app. Browsers normally send it only when the docs and API share a compatible origin.",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Organization-scoped QuickVoice API key. Send the raw key in the x-api-key header.",
        },
      },
    },
  };
}

function buildPaths() {
  const paths: Record<string, OpenApiPathItem> = {};
  for (const group of apiGroups) {
    for (const endpoint of group.endpoints) {
      paths[endpoint.path] = {
        ...paths[endpoint.path],
        ...buildPathItem(endpoint, group.title),
      };
    }
  }
  return paths;
}

function buildPathItem(endpoint: ApiEndpoint, tag: string): OpenApiPathItem {
  const method = endpoint.method.toLowerCase() as Lowercase<ApiMethod>;
  return {
    [method]: {
      tags: [tag],
      summary: endpoint.summary,
      description: buildDescription(endpoint),
      operationId: buildOperationId(endpoint),
      parameters: buildParameters(endpoint),
      requestBody: buildRequestBody(endpoint),
      security: buildSecurity(endpoint),
      responses: buildResponses(endpoint),
      "x-quickvoice-source": endpoint.source,
      ...(endpoint.permission ? { "x-quickvoice-permission": endpoint.permission } : {}),
      "x-quickvoice-ai-context": buildAiContext(endpoint),
      "x-quickvoice-use-case": buildUseCase(endpoint),
      "x-quickvoice-side-effects": buildSideEffects(endpoint),
    },
  };
}

function buildDescription(endpoint: ApiEndpoint) {
  const aiContext = buildAiContext(endpoint);
  const parts = [
    `Selected endpoint: ${endpoint.method} ${endpoint.path}.`,
    `What it does: ${endpoint.summary}`,
    `When to use it: ${buildUseCase(endpoint)}`,
    `Side effects and risk: ${buildSideEffects(endpoint)}`,
    `Authentication: ${endpoint.auth}.`,
  ];
  if (endpoint.permission) parts.push(`Permission: ${endpoint.permission}.`);
  if (endpoint.params?.length) parts.push(`Path parameters: ${endpoint.params.join("; ")}.`);
  if (endpoint.query?.length) parts.push(`Query parameters: ${endpoint.query.join("; ")}.`);
  if (endpoint.body?.length) parts.push(`Request body: ${endpoint.body.join("; ")}.`);
  parts.push(`Response: ${endpoint.response}.`);
  parts.push(
    `Ask AI guidance: If the user asks "what this API does" while this operation is selected, answer only about ${endpoint.method} ${endpoint.path}. Do not summarize the whole QuickVoice API catalog unless the user explicitly asks for the whole catalog.`,
  );
  parts.push(`AI context: ${aiContext}`);
  parts.push(`Source: ${endpoint.source}.`);
  return parts.join("\n\n");
}

function buildAiContext(endpoint: ApiEndpoint) {
  return `${endpoint.method} ${endpoint.path} ${endpoint.summary} Use case: ${buildUseCase(endpoint)} Side effects: ${buildSideEffects(endpoint)}`;
}

function buildUseCase(endpoint: ApiEndpoint) {
  const key = `${endpoint.method} ${endpoint.path}`;
  const useCases: Record<string, string> = {
    "POST /agents": "Use this when an admin or integration needs to create a new voice agent programmatically from a template or blank setup.",
    "GET /agents": "Use this to populate agent lists, let users select an agent, or sync agent inventory into another system.",
    "GET /agents/voice/catalog": "Use this before saving voice configuration so the UI or integration can offer only supported model and voice choices.",
    "POST /agents/{agentId}/preview-session": "Use this to test an agent in the browser before assigning a phone number or launching real calls.",
    "PATCH /agents/{id}": "Use this for lightweight agent metadata changes such as renaming or activating/deactivating an agent.",
    "DELETE /agents/{agentId}": "Use this when an agent should be permanently removed from the organization.",
    "POST /agents/{agentId}/config": "Use this to save the complete behavior and runtime configuration for an agent.",
    "GET /agents/{agentId}/config": "Use this to load an agent's saved configuration into an editor or audit workflow.",
    "GET /numbers/search": "Use this when a user needs to discover available phone numbers before purchase.",
    "GET /numbers": "Use this to show all phone numbers owned by the organization and their agent assignments.",
    "POST /numbers": "Use this to purchase or provision a selected provider phone number.",
    "PATCH /numbers/{phId}": "Use this to route a phone number to a different agent or unassign it.",
    "DELETE /numbers/{phId}": "Use this to release a phone number that is no longer needed.",
    "GET /calls": "Use this to build call-history views, export call activity, or audit call outcomes with filters.",
    "GET /calls/live": "Use this to show currently active calls in an operations console.",
    "POST /calls/live/end": "Use this when an operator needs to force-end a stuck or unwanted live call.",
    "GET /calls/{callId}": "Use this to inspect one call's metadata, status, recording, and routing information.",
    "GET /calls/{callId}/transcripts": "Use this to page through transcript messages for one call without loading every call log field.",
    "DELETE /calls/{callId}": "Use this for privacy, retention, or cleanup workflows that remove a call record.",
    "GET /dashboard/summary": "Use this to power dashboard KPIs and charts without manually aggregating raw call logs.",
    "GET /outbound-calls": "Use this to list outbound attempts and campaign calls with operational filters.",
    "POST /outbound-calls/quick": "Use this to place one immediate outbound call from a chosen agent and caller ID.",
    "GET /outbound-calls/batch-upload-url": "Use this before creating a campaign so the source CSV/XLSX file can be uploaded directly to storage.",
    "POST /outbound-calls/batches": "Use this to create a scheduled or immediate outbound campaign from an uploaded source file.",
    "GET /outbound-calls/batches": "Use this to show campaign history and campaign-level status.",
    "GET /outbound-calls/batches/{campaignId}": "Use this to inspect one campaign's details and progress.",
    "POST /outbound-calls/batches/{campaignId}/cancel": "Use this to stop pending work for an outbound batch campaign.",
    "GET /outbound-calls/{outboundId}": "Use this to inspect full details for one outbound call attempt.",
    "POST /outbound-calls/{outboundId}/cancel": "Use this to cancel an individual scheduled outbound call before it completes.",
    "POST /outbound-calls/{outboundId}/retry": "Use this to retry a failed or unanswered outbound call without rebuilding the original request.",
    "POST /kb": "Use this to register uploaded or URL-based documents as agent knowledge sources.",
    "GET /kb": "Use this to list knowledge sources and processing status for an organization or agent.",
    "GET /kb/upload-url": "Use this to securely upload a knowledge file through a presigned storage URL.",
    "DELETE /kb/{kbId}": "Use this to remove a knowledge source from an agent's retrievable context.",
    "GET /tools": "Use this to list reusable HTTP tools configured for the organization.",
    "POST /tools": "Use this to create a callable HTTP tool that agents can use during conversations.",
    "PATCH /tools/{toolId}": "Use this to update a tool's endpoint, headers, parameters, timeout, or behavior.",
    "DELETE /tools/{toolId}": "Use this to remove a tool that should no longer be available.",
    "GET /tools/agent/{agentId}": "Use this to show which tools are currently available to a specific agent.",
    "POST /tools/{toolId}/attach/{agentId}": "Use this to enable one existing tool for one agent.",
    "DELETE /tools/{toolId}/detach/{agentId}": "Use this to disable one tool for one agent without deleting the tool globally.",
    "GET /secrets": "Use this to list stored secret metadata while keeping secret values redacted.",
    "POST /secrets": "Use this to store a secret value for tools, headers, webhooks, or integrations.",
    "DELETE /secrets/{secretId}": "Use this to remove a rotated or unused secret.",
    "GET /mcp/catalog": "Use this to browse MCP servers that can be connected to QuickVoice.",
    "GET /mcp/connections": "Use this to list remote MCP servers already connected to the organization.",
    "POST /mcp/connections": "Use this to connect a catalog MCP server or a custom MCP server URL.",
    "POST /mcp/connections/{mcpConnectionId}/refresh": "Use this to refresh metadata and tool definitions from a connected MCP server.",
    "DELETE /mcp/connections/{mcpConnectionId}": "Use this to disconnect a remote MCP server from the organization.",
    "GET /mcp/agent/{agentId}": "Use this to list MCP connections attached to a specific agent.",
    "POST /mcp/connections/{mcpConnectionId}/attach/{agentId}": "Use this to enable a connected MCP server's tools for an agent.",
    "DELETE /mcp/connections/{mcpConnectionId}/detach/{agentId}": "Use this to disable a connected MCP server for an agent.",
    "POST /mcp/connections/{mcpConnectionId}/tools/{toolName}/execute": "Use this for advanced testing or controlled execution of a tool exposed by a connected MCP server.",
    "GET /agents/{agentId}/widgets": "Use this to list website widgets configured for a specific agent.",
    "POST /agents/{agentId}/widgets": "Use this to create an embeddable website voice widget for an agent.",
    "GET /widgets/{widgetId}": "Use this to read one widget's admin configuration.",
    "PATCH /widgets/{widgetId}": "Use this to update widget theme, origin allowlist, consent text, or enabled state.",
    "DELETE /widgets/{widgetId}": "Use this to remove a website widget from service.",
    "GET /public/widgets/{widgetId}/config": "Use this from the embeddable browser widget to load safe public widget configuration.",
    "POST /public/widgets/{widgetId}/sessions": "Use this from the embeddable browser widget to create a public voice session.",
    "POST /public/widgets/{widgetId}/sessions/{sessionId}/end": "Use this from the embeddable browser widget to end a public session with its end token.",
  };
  return useCases[key] ?? `Use this operation for the ${endpoint.summary.toLowerCase()}`;
}

function buildSideEffects(endpoint: ApiEndpoint) {
  if (endpoint.method === "GET") return "Read-only; it should not change QuickVoice data.";
  if (endpoint.method === "DELETE") return "Destructive; it removes or detaches data and should require user confirmation.";
  if (endpoint.path.includes("/cancel") || endpoint.path.includes("/end")) {
    return "Stops active or scheduled work; confirm before use.";
  }
  if (endpoint.path.includes("/retry")) {
    return "Can re-run a call or workflow; confirm before use because it may contact a person or consume resources.";
  }
  if (endpoint.path.includes("/execute")) {
    return "Executes an external tool; review the tool arguments and expected effects before use.";
  }
  if (endpoint.path.includes("/numbers") && endpoint.method === "POST") {
    return "Can provision billable telephony resources; confirm before use.";
  }
  if (endpoint.path.includes("/quick") || endpoint.path.includes("/sessions")) {
    return "Creates a real-time call/session; it can consume minutes or contact a person, so confirm intent before using it.";
  }
  return "Writes or updates QuickVoice data; require appropriate authorization and user intent.";
}

function buildParameters(endpoint: ApiEndpoint): OpenApiParameter[] | undefined {
  const params: OpenApiParameter[] = [];

  for (const pathParam of endpoint.params ?? []) {
    const { name, description } = parseField(pathParam);
    params.push({ name, in: "path", required: true, description, schema: { type: "string" } });
  }

  for (const queryParam of endpoint.query ?? []) {
    const { name, description, optional } = parseField(queryParam);
    params.push({ name, in: "query", required: !optional, description, schema: { type: "string" } });
  }

  return params.length ? params : undefined;
}

function buildRequestBody(endpoint: ApiEndpoint): OpenApiOperation["requestBody"] {
  if (!endpoint.body?.length) return undefined;

  return {
    required: !["GET", "DELETE"].includes(endpoint.method),
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: Object.fromEntries(
            endpoint.body.map((field) => {
              const { name, description } = parseField(field);
              return [name, { type: "string", description }];
            }),
          ),
        },
      },
    },
  };
}

function buildSecurity(endpoint: ApiEndpoint): OpenApiOperation["security"] {
  if (endpoint.auth.toLowerCase().includes("origin")) return undefined;
  return [{ sessionCookie: [] }, { apiKey: [] }];
}

function buildResponses(endpoint: ApiEndpoint): OpenApiOperation["responses"] {
  const match = endpoint.response.match(/^(\d{3})\s+(.+)$/);
  const status = match?.[1] ?? "200";
  const description = match?.[2] ?? endpoint.response;
  return { [status]: { description } };
}

function buildOperationId(endpoint: ApiEndpoint) {
  const pathName = endpoint.path
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "by-$1")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${endpoint.method.toLowerCase()}-${pathName}`;
}

function parseField(field: string) {
  const beforeComma = field.split(",")[0]?.trim() || field.trim();
  const [rawName] = beforeComma.split(":");
  const name = rawName.trim().replace(/\?$/, "") || "value";
  return {
    name,
    optional: rawName.trim().endsWith("?"),
    description: field,
  };
}
