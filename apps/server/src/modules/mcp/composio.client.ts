import { BadRequestError } from "../../common/errors/badRequest.js";
import { McpProviderError } from "./mcp-provider-result.js";
import { normalizeMcpTools } from "./mcp-tool-policy.js";

const BASE_URL = "https://backend.composio.dev/api/v3.1";
export const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export class ComposioHttpError extends McpProviderError {
  constructor(readonly status: number) {
    super("MCP_PROVIDER_ERROR", null, status);
  }
}

// Native fetch keeps credentials exclusively on the API server. Never follow a
// redirect with the project key, or retry a possibly completed write operation.
export async function composioRequest(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key)
    throw new BadRequestError(
      "Integrations are not configured. Ask an administrator to set COMPOSIO_API_KEY.",
    );
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      redirect: "error",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new McpProviderError("MCP_PROVIDER_ERROR");
  }
  if (!response.ok) throw new ComposioHttpError(response.status);
  if (response.status === 204) return {};
  // Provider responses can contain credentials. Callers must select safe fields;
  // never persist or log a raw account response.
  try {
    return object(await response.json());
  } catch {
    throw new McpProviderError("MCP_PROVIDER_ERROR");
  }
}

export async function composioPages(path: string, maxPages = 30) {
  const items: Record<string, any>[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  const deadline = Date.now() + 60_000;
  for (let page = 0; page < maxPages; page++) {
    if (Date.now() > deadline) break;
    const result = await composioRequest(
      `${path}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!Array.isArray(result.items))
      throw new McpProviderError("MCP_PROVIDER_ERROR");
    items.push(...result.items.map(object));
    if (!result.next_cursor) return items;
    if (
      typeof result.next_cursor !== "string" ||
      cursors.has(result.next_cursor)
    )
      break;
    cursor = result.next_cursor;
    cursors.add(cursor!);
  }
  throw new BadRequestError(
    "The integration catalog could not be loaded completely. Please retry.",
  );
}

export async function createComposioSession(
  userId: string,
  toolkit: string,
  accountId?: string | null,
) {
  let authConfigs: unknown;
  try {
    authConfigs = process.env.COMPOSIO_AUTH_CONFIGS
      ? JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS)
      : {};
  } catch {
    throw new BadRequestError("Invalid COMPOSIO_AUTH_CONFIGS setting");
  }
  const authConfig = object(authConfigs)[toolkit];
  if (authConfig !== undefined && typeof authConfig !== "string")
    throw new BadRequestError("Invalid COMPOSIO_AUTH_CONFIGS setting");
  const result = await composioRequest("/tool_router/session", {
    user_id: userId,
    toolkits: { enable: [toolkit] },
    ...(accountId ? { connected_accounts: { [toolkit]: [accountId] } } : {}),
    ...(authConfig ? { auth_configs: { [toolkit]: authConfig } } : {}),
    instant: false,
    manage_connections: { enable: false },
    workbench: { enable: false },
    proxy_execute: { enable: false },
    search: { enable: false },
    execute: { enable_multi_execute: false },
    preload: { tools: "all" },
  });
  if (typeof result.session_id !== "string" || !result.session_id)
    throw new McpProviderError("MCP_PROVIDER_ERROR");
  return result.session_id as string;
}

export function composioTool(tool: Record<string, any>, toolkit: string) {
  if (
    tool.toolkit?.slug !== toolkit ||
    tool.is_deprecated ||
    String(tool.slug).startsWith("COMPOSIO_")
  )
    return null;
  const hasSchema =
    tool.input_parameters &&
    typeof tool.input_parameters === "object" &&
    !Array.isArray(tool.input_parameters);
  const parameters = object(tool.input_parameters);
  // Both representations are documented: a JSON Schema, and a property map
  // with per-property required flags. Preserve nested schema constraints.
  const inputSchema =
    parameters.type === "object" || parameters.properties || parameters.$ref
      ? parameters
      : {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(parameters).map(([key, value]) => {
              const { required: _required, ...schema } = object(value);
              return [key, schema];
            }),
          ),
          required: Object.entries(parameters)
            .filter(([, value]) => object(value).required === true)
            .map(([key]) => key),
          additionalProperties: false,
        };
  const tags = Array.isArray(tool.tags) ? tool.tags : [];
  const sideEffect = tags.some((tag: unknown) =>
    ["createHint", "updateHint", "destructiveHint"].includes(String(tag)),
  );
  return (
    normalizeMcpTools([
      {
        name: tool.slug,
        description: tool.description,
        inputSchema: hasSchema ? inputSchema : null,
        readOnly: tags.includes("readOnlyHint") && !sideEffect,
        sideEffect,
        annotations: {
          readOnlyHint: tags.includes("readOnlyHint") && !sideEffect,
          destructiveHint: tags.includes("destructiveHint"),
        },
      },
    ])[0] ?? null
  );
}

export async function composioTools(sessionId: string, toolkit: string) {
  const items = await composioPages(
    `/tool_router/session/${encodeURIComponent(sessionId)}/tools?limit=500`,
  );
  return items.flatMap((item) => {
    const tool = composioTool(item, toolkit);
    return tool ? [tool] : [];
  });
}

export async function deleteComposioResource(path: string) {
  try {
    await composioRequest(path, undefined, "DELETE");
  } catch (error) {
    if (!(error instanceof ComposioHttpError) || error.status !== 404)
      throw error;
  }
}

export function safeComposioSetupUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "connect.composio.dev",
        "app.composio.dev",
        "backend.composio.dev",
      ].includes(url.hostname)
    )
      return url.href;
  } catch {
    /* Reject malformed provider links. */
  }
  throw new McpProviderError("MCP_PROVIDER_ERROR");
}
