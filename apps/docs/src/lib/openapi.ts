import { apiBaseUrl, apiGroups, type ApiEndpoint, type ApiMethod } from "../data/api-reference";

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
  "x-quickvoice-lifecycle": string;
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
      bearerAuth: {
        type: "http";
        scheme: "bearer";
        bearerFormat: "QuickVoice API key or session token";
      };
      internalApiKey: {
        type: "http";
        scheme: "bearer";
        bearerFormat: "Internal runtime token";
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
      description: "Interactive OpenAPI reference for QuickVoice agents, calls, phone numbers, outbound workflows, tools, MCP integrations, website widgets, and operational APIs.",
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
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "QuickVoice API key or session token",
        },
        internalApiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Internal runtime token",
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
      "x-quickvoice-lifecycle": endpoint.lifecycle,
      ...(endpoint.permission ? { "x-quickvoice-permission": endpoint.permission } : {}),
    },
  };
}

function buildDescription(endpoint: ApiEndpoint) {
  const parts = [endpoint.summary, `Authentication: ${endpoint.auth}.`];
  if (endpoint.permission) parts.push(`Permission: ${endpoint.permission}.`);
  parts.push(`Source: ${endpoint.source}.`);
  return parts.join("\n\n");
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
    required: !["GET", "DELETE", "OPTIONS"].includes(endpoint.method),
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
  if (endpoint.auth.toLowerCase().includes("internal")) return [{ internalApiKey: [] }];
  if (endpoint.auth.toLowerCase().includes("origin")) return undefined;
  return [{ bearerAuth: [] }];
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
